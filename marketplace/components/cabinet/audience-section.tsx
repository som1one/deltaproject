"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ImagePlus, Plus, X } from "lucide-react";

import { Modal } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { resolveUploadUrl } from "@/lib/config";
import { formatAudience, formatDate } from "@/lib/format";
import type { AudienceGroup, AudienceStats, BloggerSelfProfile } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import s from "./cabinet.module.css";

type GroupRow = { label: string; percent: string };

const AGE_MAX = 8;
const GEO_MAX = 8;
const DEVICES_MAX = 5;

const toGroupRows = (groups: AudienceGroup[] | null | undefined): GroupRow[] =>
  (groups ?? []).map((g) => ({ label: g.label, percent: String(g.percent) }));

const toGroups = (rows: GroupRow[]): AudienceGroup[] =>
  rows
    .map((r) => ({ label: r.label.trim(), percent: Number(r.percent.replace(",", ".")) }))
    .filter((g) => g.label && Number.isFinite(g.percent) && g.percent > 0);

const groupsToText = (groups: AudienceGroup[] | null | undefined): string | null => {
  if (!groups || groups.length === 0) return null;
  return groups.map((g) => `${g.label} — ${g.percent}%`).join(" · ");
};

/** Редактор рядов «группа + процент» для модалки. */
function GroupRowsEditor({
  rows,
  onChange,
  max,
  labelPlaceholder,
  ariaLabel,
}: {
  rows: GroupRow[];
  onChange: (next: GroupRow[]) => void;
  max: number;
  labelPlaceholder: string;
  ariaLabel: string;
}) {
  const patch = (index: number, next: Partial<GroupRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...next } : r)));
  };

  return (
    <div className={s.groupRows}>
      {rows.map((row, index) => (
        <div key={index} className={s.groupRow}>
          <input
            className={ui.input}
            value={row.label}
            placeholder={labelPlaceholder}
            aria-label={`${ariaLabel}, группа ${index + 1}`}
            onChange={(e) => patch(index, { label: e.target.value })}
          />
          <span className={s.pctWrap}>
            <input
              className={ui.input}
              inputMode="numeric"
              value={row.percent}
              placeholder="0"
              aria-label={`${ariaLabel}, процент группы ${index + 1}`}
              onChange={(e) => patch(index, { percent: e.target.value.replace(/[^\d.,]/g, "") })}
            />
            <span className={s.pctSign}>%</span>
          </span>
          <button
            type="button"
            className={s.linkRemove}
            aria-label={`Удалить группу ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className={s.addLink} onClick={() => onChange([...rows, { label: "", percent: "" }])}>
          <Plus size={14} /> Добавить группу
        </button>
      )}
    </div>
  );
}

/**
 * «Аудитория»: подтверждённая статистика + заявка на обновление данных
 * через модалку (скриншоты обязательны, проверяет платформа).
 */
export function AudienceSection({ profile }: { profile: BloggerSelfProfile }) {
  const queryClient = useQueryClient();
  const submission = profile.latest_audience_submission;
  const stats = profile.audience_stats;
  const pending = submission?.status === "pending";

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Форма — предзаполняем из подтверждённых данных либо последней заявки.
  const seed: AudienceStats = stats ?? submission?.payload ?? {};
  const [ages, setAges] = useState<GroupRow[]>(() => toGroupRows(seed.audience_age));
  const [geo, setGeo] = useState<GroupRow[]>(() => toGroupRows(seed.audience_geo));
  const [devices, setDevices] = useState<GroupRow[]>(() => toGroupRows(seed.audience_devices));
  const [female, setFemale] = useState(seed.audience_gender ? String(seed.audience_gender.female) : "");
  const [male, setMale] = useState(seed.audience_gender ? String(seed.audience_gender.male) : "");
  const [avgViews, setAvgViews] = useState(seed.avg_views != null ? String(seed.avg_views) : "");
  const [frequency, setFrequency] = useState(seed.posting_frequency ?? "");
  const [responseTime, setResponseTime] = useState(seed.response_time ?? "");
  const [subscribers, setSubscribers] = useState(seed.subscriber_count != null ? String(seed.subscriber_count) : "");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadShots = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { url } = await api.uploadImage(file);
        setScreenshots((prev) => [...prev, url]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить скриншот");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = useMutation({
    mutationFn: (body: { payload: AudienceStats; screenshots: string[] }) => api.createAudienceSubmission(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY });
      setOpen(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось отправить заявку"),
  });

  const handleSubmit = () => {
    setError(null);
    if (screenshots.length === 0) {
      setError("Приложите хотя бы один скриншот статистики — без него платформа не сможет подтвердить данные.");
      return;
    }
    const femaleNum = Number(female.replace(",", "."));
    const maleNum = Number(male.replace(",", "."));
    const payload: AudienceStats = {
      audience_age: toGroups(ages).length ? toGroups(ages) : null,
      audience_geo: toGroups(geo).length ? toGroups(geo) : null,
      audience_devices: toGroups(devices).length ? toGroups(devices) : null,
      audience_gender:
        Number.isFinite(femaleNum) && Number.isFinite(maleNum) && (female.trim() || male.trim())
          ? { female: femaleNum, male: maleNum }
          : null,
      avg_views: avgViews.trim() ? Number(avgViews.replace(/\s/g, "")) : null,
      posting_frequency: frequency.trim() || null,
      response_time: responseTime.trim() || null,
      subscriber_count: subscribers.trim() ? Number(subscribers.replace(/\s/g, "")) : null,
    };
    submit.mutate({ payload, screenshots });
  };

  const verifiedChips: { key: string; value: string }[] = stats
    ? ([
        { key: "Подписчики", value: stats.subscriber_count != null ? formatAudience(stats.subscriber_count) : null },
        { key: "Средние просмотры", value: stats.avg_views != null ? formatAudience(stats.avg_views) : null },
        {
          key: "Пол",
          value: stats.audience_gender
            ? `Женщины ${stats.audience_gender.female}% · мужчины ${stats.audience_gender.male}%`
            : null,
        },
        { key: "Возраст", value: groupsToText(stats.audience_age) },
        { key: "География", value: groupsToText(stats.audience_geo) },
        { key: "Устройства", value: groupsToText(stats.audience_devices) },
        { key: "Частота публикаций", value: stats.posting_frequency },
        { key: "Время ответа", value: stats.response_time },
      ].filter((c): c is { key: string; value: string } => Boolean(c.value)))
    : [];

  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Аудитория</h2>
        {stats && profile.audience_verified_at && (
          <span className={s.verBadge}>
            <BadgeCheck size={14} /> Подтверждено платформой · {formatDate(profile.audience_verified_at)}
          </span>
        )}
      </div>
      <p className={s.panelSub}>
        Данные проверяет платформа по скриншотам статистики — подтверждённый блок повышает доверие заказчиков.
      </p>

      {verifiedChips.length > 0 ? (
        <div className={s.audGrid}>
          {verifiedChips.map((chip) => (
            <div key={chip.key} className={s.audChip}>
              <span className={s.audChipKey}>{chip.key}</span>
              <span className={s.audChipVal}>{chip.value}</span>
            </div>
          ))}
        </div>
      ) : (
        !pending && (
          <p className={ui.muted} style={{ margin: "2px 0 4px", fontSize: 14 }}>
            Подтверждённых данных пока нет. Отправьте статистику — и в карточке появится блок «Аудитория».
          </p>
        )
      )}

      {pending && (
        <div className={ui.noticeWarning} style={{ marginTop: 14 }}>
          Заявка на модерации — обычно проверяем за 1–2 рабочих дня. Пока она рассматривается, новую отправить
          нельзя.
        </div>
      )}

      {submission?.status === "rejected" && (
        <div className={ui.noticeDanger} style={{ marginTop: 14 }}>
          <span>
            Прошлую заявку отклонили{submission.review_comment ? `: ${submission.review_comment}` : "."} Поправьте
            данные и отправьте заново.
          </span>
        </div>
      )}

      {!pending && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className={`${ui.btnLine} ${ui.btnSmall}`} onClick={() => setOpen(true)}>
            {stats ? "Обновить данные" : "Отправить статистику"}
          </button>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Статистика аудитории" maxWidth={640}>
        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Основное</div>
          <div className={ui.grid2} style={{ marginTop: 10 }}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Подписчики</span>
              <input
                className={ui.input}
                inputMode="numeric"
                value={subscribers}
                placeholder="120000"
                onChange={(e) => setSubscribers(e.target.value.replace(/[^\d]/g, ""))}
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Средние просмотры</span>
              <input
                className={ui.input}
                inputMode="numeric"
                value={avgViews}
                placeholder="45000"
                onChange={(e) => setAvgViews(e.target.value.replace(/[^\d]/g, ""))}
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Частота публикаций</span>
              <input
                className={ui.input}
                value={frequency}
                placeholder="3 видео в неделю"
                onChange={(e) => setFrequency(e.target.value)}
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Время ответа</span>
              <input
                className={ui.input}
                value={responseTime}
                placeholder="≈ 2 часа"
                onChange={(e) => setResponseTime(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Пол аудитории</div>
          <div className={ui.grid2} style={{ marginTop: 10 }}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Женщины, %</span>
              <input
                className={ui.input}
                inputMode="numeric"
                value={female}
                placeholder="60"
                onChange={(e) => setFemale(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Мужчины, %</span>
              <input
                className={ui.input}
                inputMode="numeric"
                value={male}
                placeholder="40"
                onChange={(e) => setMale(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </label>
          </div>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Возраст</div>
          <div className={s.modalSectionHint}>До {AGE_MAX} групп, например «18–24».</div>
          <GroupRowsEditor rows={ages} onChange={setAges} max={AGE_MAX} labelPlaceholder="18–24" ariaLabel="Возраст" />
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>География</div>
          <div className={s.modalSectionHint}>До {GEO_MAX} регионов или стран.</div>
          <GroupRowsEditor rows={geo} onChange={setGeo} max={GEO_MAX} labelPlaceholder="Россия" ariaLabel="География" />
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Устройства</div>
          <div className={s.modalSectionHint}>До {DEVICES_MAX} типов: Mobile, Desktop, TV…</div>
          <GroupRowsEditor
            rows={devices}
            onChange={setDevices}
            max={DEVICES_MAX}
            labelPlaceholder="Mobile"
            ariaLabel="Устройства"
          />
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Скриншоты статистики</div>
          <div className={s.modalSectionHint}>
            Хотя бы один — из кабинета площадки, чтобы платформа могла сверить цифры.
          </div>
          <div className={s.shotsGrid}>
            {screenshots.map((url) => (
              <span key={url} className={s.shotThumb}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveUploadUrl(url) ?? url} alt="Скриншот статистики" />
                <button
                  type="button"
                  className={s.shotRemove}
                  aria-label="Удалить скриншот"
                  onClick={() => setScreenshots((prev) => prev.filter((u) => u !== url))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className={s.shotAdd}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={18} />
              {uploading ? "Грузим…" : "Добавить"}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Загрузить скриншоты статистики"
            onChange={(e) => uploadShots(e.target.files)}
          />
        </div>

        {error && <p className={ui.inputError}>{error}</p>}

        <div className={s.modalActions}>
          <button type="button" className={ui.btnLine} onClick={() => setOpen(false)}>
            Отмена
          </button>
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={submit.isPending || uploading}
            onClick={handleSubmit}
          >
            {submit.isPending ? "Отправляем…" : "Отправить на проверку"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
