"use client";

import { useState } from "react";

import { orderStampLabel, orderStampTone, type StampTone } from "@/lib/order-status";

import ui from "./ui.module.css";

const stampClass: Record<StampTone, string> = {
  active: ui.stampActive,
  done: ui.stampDone,
  alert: ui.stampAlert,
  muted: ui.stampMuted,
};

/** Штамп статуса сделки в тонкой рамке. */
export const StampBadge = ({ status }: { status: string }) => (
  <span className={stampClass[orderStampTone(status)]}>{orderStampLabel(status)}</span>
);

/** № сделки/записи в моно. */
export const DealNo = ({ value, className }: { value: string; className?: string }) => (
  <span className={`${ui.mono} ${className ?? ""}`.trim()}>№&nbsp;{value}</span>
);

export const CopyButton = ({ value, label = "Копировать" }: { value: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard может быть недоступен — молча игнорируем */
    }
  };

  return (
    <button type="button" className={ui.copyBtn} onClick={handleCopy}>
      {copied ? "Скопировано" : label}
    </button>
  );
};

/** Портрет-дуотон; при отсутствии фото — монограмма на камне. */
export const Portrait = ({
  name,
  photoUrl,
  record,
  className,
  monoSize = 40,
}: {
  name: string;
  photoUrl?: string | null;
  record?: string;
  className?: string;
  monoSize?: number;
}) => {
  const [failed, setFailed] = useState(false);
  const initial = (name || "•").trim().charAt(0).toUpperCase();
  const showImg = photoUrl && !failed;

  return (
    <div className={`${ui.portrait} ${ui.grain} ${className ?? ""}`.trim()}>
      {showImg ? (
        <img src={photoUrl} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={ui.monogram} style={{ fontSize: monoSize }} aria-hidden="true">
          {record ?? initial}
        </span>
      )}
    </div>
  );
};

/** Латунная печать с текстом по кругу — единственный декор тёмной секции. */
export const Seal = ({
  size = 148,
  text = "СДЕЛКА ПОД ЗАЩИТОЙ ПЛАТФОРМЫ · ",
  center = "LM",
}: {
  size?: number;
  text?: string;
  center?: string;
}) => {
  const r = size / 2;
  const pathR = r - 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={text.replace(/·/g, "").trim()}
      style={{ display: "block" }}
    >
      <defs>
        <path
          id="sealArc"
          d={`M ${r},${r} m -${pathR},0 a ${pathR},${pathR} 0 1,1 ${pathR * 2},0 a ${pathR},${pathR} 0 1,1 -${pathR * 2},0`}
          fill="none"
        />
      </defs>
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--brass)" strokeWidth="1" opacity="0.9" />
      <circle cx={r} cy={r} r={r - 9} fill="none" stroke="var(--brass)" strokeWidth="1" opacity="0.45" />
      <text
        fill="var(--brass)"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.22em",
        }}
      >
        <textPath href="#sealArc" startOffset="0">
          {text.repeat(3)}
        </textPath>
      </text>
      <text
        x={r}
        y={r}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--brass)"
        style={{ fontFamily: "var(--font-display)", fontSize: size * 0.24 }}
      >
        {center}
      </text>
    </svg>
  );
};
