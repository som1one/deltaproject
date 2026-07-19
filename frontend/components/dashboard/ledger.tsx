"use client";

import { useEffect, useRef } from "react";

import { formatDateTime, formatLedgerStatus, formatMoney } from "@/lib/format";
import type { LedgerEntryRead, LedgerEntryStatus } from "@/lib/types";
import { Button, DataTable, StatusPill, TableWrap } from "@/components/common/ui";
import { CopyButton } from "@/components/common/copy-button";

import styles from "./cabinet.module.css";

/* =========================================================
   Ledger — история операций: десктопная таблица, мобильный
   hairline-список и модалка деталей. Общее для обоих кабинетов
   и превью «Последние операции» в обзоре блогера.
   ========================================================= */

export const ledgerTone = (
  status: LedgerEntryStatus,
): "active" | "success" | "muted" | "danger" | "default" => {
  switch (status) {
    case "completed": return "success";
    case "rejected": return "danger";
    case "freeze":
    case "pending_confirmation":
    case "payout_request":
      return "active";
    default: return "default";
  }
};

export const LedgerTable = ({
  items,
  onSelect,
}: {
  items: LedgerEntryRead[];
  onSelect?: (entry: LedgerEntryRead) => void;
}) => (
  <>
    <ul className={styles.ledgerMobileList}>
      {items.map((entry) => (
        <li
          key={`m-${entry.id}`}
          className={`${styles.ledgerMobileRow}${onSelect ? ` ${styles.ledgerMobileRowClickable}` : ""}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={onSelect ? () => onSelect(entry) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(entry);
                  }
                }
              : undefined
          }
        >
          <div className={styles.ledgerMobileTop}>
            <span
              className={styles.ledgerMobileAmount}
              data-negative={entry.amount_kopeks < 0 ? "true" : undefined}
            >
              {entry.amount_kopeks < 0 ? "−" : "+"}
              {formatMoney(Math.abs(entry.amount_kopeks))}
            </span>
            <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
          </div>
          <div className={styles.ledgerMobileFoot}>
            <span className={styles.ledgerMobileDate}>{formatDateTime(entry.created_at)}</span>
            {entry.status === "rejected" ? (
              <span
                className={styles.ledgerMobileNote}
                style={entry.note ? undefined : { color: "var(--text-soft)" }}
              >
                {entry.note || "Причина не указана"}
              </span>
            ) : entry.note ? (
              <span className={styles.ledgerMobileNote}>{entry.note}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
    <div className={styles.dealsDesktopTable}>
      <TableWrap>
        <DataTable>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Заметка</th>
            </tr>
          </thead>
          {/* Строки кликабельны, но остаются строками таблицы: role="button"
              с aria-label прятал бы содержимое ячеек от скринридера. */}
          <tbody>
            {items.map((entry) => (
              <tr
                key={entry.id}
                className={onSelect ? styles.dealRowClickable : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(entry) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(entry);
                        }
                      }
                    : undefined
                }
              >
                <td>{formatDateTime(entry.created_at)}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: entry.amount_kopeks < 0 ? "var(--status-danger)" : "var(--text-strong)" }}>
                  {entry.amount_kopeks < 0 ? "−" : "+"}
                  {formatMoney(Math.abs(entry.amount_kopeks))}
                </td>
                <td>
                  <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
                </td>
                {entry.status === "rejected" ? (
                  <td style={{ color: entry.note ? "var(--text)" : "var(--text-soft)" }}>
                    {entry.note || "Причина не указана"}
                  </td>
                ) : (
                  <td style={{ color: entry.note ? "var(--text)" : "var(--text-soft)" }}>{entry.note || "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  </>
);

/* =========================================================
   Ledger details modal — opens on row/card click.
   ========================================================= */

const LEDGER_SUPPORT_HANDLE = "looneymoonhelper";

const ledgerStatusSummary = (status: LedgerEntryStatus): string => {
  switch (status) {
    case "completed":
      return "Операция завершена. Деньги уже учтены в балансе.";
    case "payout_request":
      return "Запрос на выплату принят, ждёт обработки администратором.";
    case "freeze":
      return "Сумма заморожена по сделке. Снимется при подтверждении или отклонении.";
    case "pending_confirmation":
      return "Выплата отправлена и ждёт подтверждения банка/провайдера.";
    case "rejected":
      return "Операция отклонена. Деньги остались на балансе.";
    default:
      return "Статус неизвестен.";
  }
};

export const LedgerDetailsModal = ({
  entry,
  onClose,
}: {
  entry: LedgerEntryRead;
  onClose: () => void;
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Esc — закрыть, body scroll — заблокировать, фокус — внутрь модалки.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const isNegative = entry.amount_kopeks < 0;
  const supportHref = `https://t.me/${LEDGER_SUPPORT_HANDLE}?text=${encodeURIComponent(
    `Здравствуйте! Вопрос по операции ${entry.id} (${formatLedgerStatus(entry.status)}).`,
  )}`;

  return (
    <div
      className={styles.dealModalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Детали операции"
      onClick={onClose}
    >
      <div
        className={styles.dealModalCard}
        ref={cardRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.dealModalHeader}>
          <div className={styles.dealModalHeaderTop}>
            <div className={styles.dealModalIdent}>
              <p className={styles.dealModalEyebrow}>Финансовая операция</p>
              <h2 className={styles.dealModalTitle}>
                <span
                  className={styles.ledgerMobileAmount}
                  data-negative={isNegative ? "true" : undefined}
                >
                  {isNegative ? "−" : "+"}
                  {formatMoney(Math.abs(entry.amount_kopeks))}
                </span>
              </h2>
            </div>
            <div className={styles.dealModalHeaderActions}>
              <a
                className={styles.dealIconButton}
                href={supportHref}
                target="_blank"
                rel="noreferrer"
                title={`Поддержка @${LEDGER_SUPPORT_HANDLE}`}
                aria-label="Связаться с поддержкой"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 21a9 9 0 1 0-9-9v3a3 3 0 0 0 3 3h1v-6H6a9 9 0 0 1 12 0h-1v6h1a3 3 0 0 0 3-3" />
                  <path d="M12 21h2a3 3 0 0 0 3-3" />
                </svg>
              </a>
              <button
                type="button"
                className={styles.dealIconButton}
                onClick={onClose}
                title="Закрыть (Esc)"
                aria-label="Закрыть"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.dealModalSummaryRow}>
            <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
            <span className={styles.dealModalCreated}>{formatDateTime(entry.created_at)}</span>
            <CopyButton
              value={entry.id}
              kind="ghost"
              label={`ID: ${entry.id.slice(0, 8)}…`}
              toastText="ID операции скопирован"
            />
          </div>
        </header>

        <div className={styles.dealModalBody}>
          <div className={styles.dealModalSection}>
            <p className={styles.dealModalLead}>{ledgerStatusSummary(entry.status)}</p>

            <dl className={styles.dealMetaGrid}>
              <div>
                <dt>Тип</dt>
                <dd>{isNegative ? "Списание / выплата" : "Начисление"}</dd>
              </div>
              <div>
                <dt>Создано</dt>
                <dd>{formatDateTime(entry.created_at)}</dd>
              </div>
              <div>
                <dt>Обновлено</dt>
                <dd>{formatDateTime(entry.updated_at)}</dd>
              </div>
              <div>
                <dt>Связанная сделка</dt>
                <dd>{entry.deal_id ? `${entry.deal_id.slice(0, 8)}…` : "—"}</dd>
              </div>
              {entry.yookassa_payout_id ? (
                <div>
                  <dt>ЮKassa payout</dt>
                  <dd>{entry.yookassa_payout_id}</dd>
                </div>
              ) : null}
              {entry.idempotency_key ? (
                <div>
                  <dt>Idempotency</dt>
                  <dd title={entry.idempotency_key}>{entry.idempotency_key.slice(0, 24)}…</dd>
                </div>
              ) : null}
            </dl>

            {entry.status === "rejected" ? (
              <div className={styles.dealModalLedgerNote}>
                <p className={styles.dealModalEyebrow}>Причина отклонения</p>
                <p style={entry.note ? undefined : { color: "var(--text-soft)" }}>
                  {entry.note || "Причина не указана"}
                </p>
              </div>
            ) : entry.note ? (
              <div className={styles.dealModalLedgerNote}>
                <p className={styles.dealModalEyebrow}>Заметка</p>
                <p>{entry.note}</p>
              </div>
            ) : null}
          </div>
        </div>

        <footer className={styles.dealModalFooter}>
          {entry.deal_id ? (
            <CopyButton
              value={entry.deal_id}
              kind="secondary"
              label="ID сделки"
              toastText="ID сделки скопирован"
            />
          ) : null}
          <Button kind="secondary" onClick={onClose}>Закрыть</Button>
        </footer>
      </div>
    </div>
  );
};
