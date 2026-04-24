import base64
from functools import lru_cache
import logging
import ssl
import time
from typing import Any

import certifi
from fastapi import HTTPException
import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, PyJWKClientError


logger = logging.getLogger(__name__)
TELEGRAM_OAUTH_TIME_LEEWAY_SECONDS = 600


@lru_cache(maxsize=4)
def _get_certifi_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


@lru_cache(maxsize=4)
def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, ssl_context=_get_certifi_ssl_context())


def _split_name(full_name: str) -> tuple[str, str | None]:
    clean = str(full_name or "").strip()
    if not clean:
        return "", None
    parts = clean.split(maxsplit=1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def _issuer_matches(actual: Any, expected: str) -> bool:
    actual_text = str(actual or "").strip().rstrip("/")
    expected_text = str(expected or "").strip().rstrip("/")
    return bool(actual_text) and actual_text == expected_text


def _audience_matches(actual: Any, expected: str) -> bool:
    expected_text = str(expected or "").strip()
    if not expected_text:
        return False
    if isinstance(actual, (list, tuple, set)):
        return any(_audience_matches(item, expected_text) for item in actual)
    return str(actual or "").strip() == expected_text


def verify_telegram_oauth_id_token(
    id_token: str,
    client_id: str,
    issuer: str,
    jwks_url: str,
) -> dict[str, Any]:
    token = str(id_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Отсутствует id_token в Telegram OAuth")

    try:
        jwks_client = _get_jwks_client(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        algorithm = signing_key.algorithm_name or jwt.get_unverified_header(token).get("alg") or "RS256"
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=[algorithm],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": False,
                "verify_nbf": True,
                "verify_aud": False,
                "verify_iss": False,
            },
            leeway=TELEGRAM_OAUTH_TIME_LEEWAY_SECONDS,
        )
    except ExpiredSignatureError as exc:
        try:
            raw_claims = jwt.decode(
                token,
                options={
                    "verify_signature": False,
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                    "verify_aud": False,
                    "verify_iss": False,
                },
            )
            logger.warning(
                "Telegram OAuth token considered expired: now=%s exp=%r iat=%r nbf=%r leeway=%s",
                int(time.time()),
                raw_claims.get("exp"),
                raw_claims.get("iat"),
                raw_claims.get("nbf"),
                TELEGRAM_OAUTH_TIME_LEEWAY_SECONDS,
            )
        except Exception:
            logger.warning("Telegram OAuth token considered expired and claims could not be decoded")
        raise HTTPException(status_code=401, detail="Telegram OAuth истёк, повторите вход") from exc
    except (InvalidTokenError, PyJWKClientError, ValueError) as exc:
        logger.warning("Telegram OAuth JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Telegram OAuth не прошёл проверку") from exc

    if not _issuer_matches(claims.get("iss"), issuer):
        logger.warning("Telegram OAuth issuer mismatch: %r", claims.get("iss"))
        raise HTTPException(status_code=401, detail="Telegram OAuth issuer не совпадает")
    if not _audience_matches(claims.get("aud"), str(client_id).strip()):
        logger.warning("Telegram OAuth audience mismatch: %r", claims.get("aud"))
        raise HTTPException(status_code=401, detail="Telegram OAuth client_id не совпадает")

    telegram_id_raw = claims.get("id") or claims.get("sub")
    try:
        telegram_id = int(telegram_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Telegram OAuth не вернул ID пользователя") from None

    username = str(claims.get("preferred_username") or "").strip().lower()
    telegram = ("@" + username) if username else None
    if not username:
        username = str(telegram_id)

    first_name, last_name = _split_name(str(claims.get("name") or "").strip())
    if not first_name:
        first_name = username

    return {
        "telegram_id": telegram_id,
        "first_name": first_name,
        "last_name": last_name,
        "username": username,
        "telegram": telegram,
    }


async def exchange_telegram_oauth_code(
    code: str,
    redirect_uri: str,
    code_verifier: str,
    client_id: str,
    client_secret: str,
    token_url: str = "https://oauth.telegram.org/token",
) -> str:
    basic_raw = f"{client_id.strip()}:{client_secret.strip()}".encode("utf-8")
    basic_auth = base64.b64encode(basic_raw).decode("ascii")

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            token_url,
            headers={
                "Authorization": f"Basic {basic_auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code.strip(),
                "redirect_uri": redirect_uri.strip(),
                "client_id": client_id.strip(),
                "code_verifier": code_verifier.strip(),
            },
        )

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if not response.is_success:
        detail = "Не удалось обменять код Telegram OAuth."
        if isinstance(payload, dict):
            error = str(payload.get("error") or "").strip()
            description = str(payload.get("error_description") or "").strip()
            if description:
                detail = description
            elif error:
                detail = error
        raise HTTPException(status_code=400, detail=detail)

    id_token = ""
    if isinstance(payload, dict):
        id_token = str(payload.get("id_token") or "").strip()
    if not id_token:
        raise HTTPException(status_code=400, detail="Telegram OAuth не вернул id_token")
    return id_token
