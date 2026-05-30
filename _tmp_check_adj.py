from pydantic import ValidationError

from schemas.admin import AdminBalanceAdjustmentRequest as R

# valid case
ok = R(amount_kopeks=500, reason="fix balance")
print("valid:", ok.amount_kopeks, repr(ok.reason))

# boundary values should pass
print("boundary hi:", R(amount_kopeks=99_999_999_999, reason="x").amount_kopeks)
print("boundary lo:", R(amount_kopeks=-99_999_999_999, reason="x").amount_kopeks)

cases = {
    "zero": dict(amount_kopeks=0, reason="x"),
    "blank reason": dict(amount_kopeks=5, reason="   "),
    "over hi": dict(amount_kopeks=100_000_000_000, reason="x"),
    "under lo": dict(amount_kopeks=-100_000_000_000, reason="x"),
    "empty reason": dict(amount_kopeks=5, reason=""),
    "too long": dict(amount_kopeks=5, reason="a" * 501),
}
for label, kwargs in cases.items():
    try:
        R(**kwargs)
        print(f"FAIL: {label} was accepted")
    except ValidationError:
        print(f"rejected ok: {label}")
