"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { BroadcastPreview, BroadcastResult, NudgeRuleRead } from "@/lib/types";
import {
  Button,
  DataTable,
  Field,
  Message,
  SectionCard,
  SelectInput,
  Stack,
  StatCard,
  StatsGrid,
  TableWrap,
  TextArea,
  TextInput,
} from "@/components/common/ui";

const formatRub = (kopeks: number) =>
  `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ₽`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Не удалось выполнить запрос";

/**
 * Управление ботом воркеров: выключатель авто-пинков, правка триггеров,
 * адресные рассылки и ростер.
 *
 * Рассылка намеренно двухшаговая — сначала «посчитать получателей», потом
 * отправка. Кнопка отправки не появляется, пока не посчитан состав: письмо
 * живым людям не должно уходить с одного клика.
 */
export const WorkerBotPanel = () => {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [segment, setSegment] = useState("dead");
  const [broadcastText, setBroadcastText] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const [editingKind, setEditingKind] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<Partial<NudgeRuleRead>>({});

  const overviewQuery = useQuery({
    queryKey: ["worker-bot", "overview"],
    queryFn: () => api.getWorkerBotOverview(),
  });
  const nudgesQuery = useQuery({
    queryKey: ["worker-bot", "nudges"],
    queryFn: () => api.getWorkerBotNudges(),
  });
  const logQuery = useQuery({
    queryKey: ["worker-bot", "log"],
    queryFn: () => api.getWorkerBotNudgeLog(30),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["worker-bot"] });
  };

  const settingsMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.updateWorkerBotSettings({ auto_nudges_enabled: enabled, paused_until: null }),
    onSuccess: (data) => {
      setNotice({
        tone: "success",
        text: data.auto_nudges_enabled
          ? "Авто-пинки включены. Ближайший проход — в течение суток."
          : "Авто-пинки выключены. Фоновый проход не будет никому писать.",
      });
      invalidate();
    },
    onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
  });

  const ruleMutation = useMutation({
    mutationFn: ({ kind, body }: { kind: string; body: Record<string, unknown> }) =>
      api.patchWorkerBotNudge(kind, body),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Триггер обновлён." });
      setEditingKind(null);
      setRuleDraft({});
      invalidate();
    },
    onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
  });

  const previewMutation = useMutation({
    mutationFn: () => api.previewWorkerBotBroadcast({ segment, text: broadcastText }),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
      setNotice(null);
    },
    onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.sendWorkerBotBroadcast({ segment, text: broadcastText }),
    onSuccess: (data) => {
      setResult(data);
      setPreview(null);
      setNotice({
        tone: "success",
        text: `Рассылка ушла: доставлено ${data.delivered}${data.failed ? `, ошибок ${data.failed}` : ""}.`,
      });
    },
    onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
  });

  const overview = overviewQuery.data;
  const settings = overview?.settings;
  const segments = overview?.segments ?? [];

  return (
    <Stack>
      {notice ? <Message tone={notice.tone}>{notice.text}</Message> : null}

      <StatsGrid>
        <StatCard label="Воркеров" value={overview?.total_workers ?? "—"} />
        <StatCard label="С подключённым ботом" value={overview?.bot_connected_count ?? "—"} />
        <StatCard label="Приведено заказчиков" value={overview?.total_referrals ?? "—"} />
        <StatCard
          label="Заработано воркерами"
          value={overview ? formatRub(overview.total_earnings_kopeks) : "—"}
        />
      </StatsGrid>

      <SectionCard
        title="Авто-пинки"
        lead="Фоновый проход раз в сутки сам пишет простаивающим воркерам. Выключатель действует немедленно."
        actions={
          settings ? (
            <Button
              type="button"
              kind={settings.auto_nudges_enabled ? "ghost" : "primary"}
              disabled={settingsMutation.isPending}
              onClick={() => settingsMutation.mutate(!settings.auto_nudges_enabled)}
            >
              {settings.auto_nudges_enabled ? "Выключить" : "Включить"}
            </Button>
          ) : null
        }
      >
        <Message tone={settings?.auto_nudges_enabled ? "success" : "default"}>
          {settings === undefined
            ? "Загружаю…"
            : settings.auto_nudges_enabled
              ? "Включены: воркеры получают пинки по правилам ниже."
              : "Выключены: фоновый проход никому не пишет."}
        </Message>
      </SectionCard>

      <SectionCard
        title="Триггеры"
        lead="Когда пинок срабатывает, как часто повторяется и что уходит в сообщение. {cabinet} заменяется ссылкой на кабинет."
      >
        <Stack>
          {(nudgesQuery.data ?? []).map((rule) => {
            const isEditing = editingKind === rule.kind;
            return (
              <SectionCard
                key={rule.kind}
                title={rule.title}
                actions={
                  <Button
                    type="button"
                    kind="ghost"
                    onClick={() => {
                      if (isEditing) {
                        setEditingKind(null);
                        setRuleDraft({});
                      } else {
                        setEditingKind(rule.kind);
                        setRuleDraft(rule);
                      }
                    }}
                  >
                    {isEditing ? "Отмена" : "Изменить"}
                  </Button>
                }
              >
                {isEditing ? (
                  <Stack>
                    <Field label="Порог, дней">
                      <TextInput
                        type="number"
                        value={String(ruleDraft.threshold_days ?? rule.threshold_days)}
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            threshold_days: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Не повторять, дней">
                      <TextInput
                        type="number"
                        value={String(ruleDraft.cooldown_days ?? rule.cooldown_days)}
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            cooldown_days: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Текст сообщения">
                      <TextArea
                        rows={6}
                        value={ruleDraft.text_template ?? rule.text_template}
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            text_template: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      disabled={ruleMutation.isPending}
                      onClick={() =>
                        ruleMutation.mutate({
                          kind: rule.kind,
                          body: {
                            threshold_days: ruleDraft.threshold_days ?? rule.threshold_days,
                            cooldown_days: ruleDraft.cooldown_days ?? rule.cooldown_days,
                            text_template: ruleDraft.text_template ?? rule.text_template,
                          },
                        })
                      }
                    >
                      Сохранить
                    </Button>
                  </Stack>
                ) : (
                  <Stack>
                    <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                      Порог {rule.threshold_days} дн. · не повторять {rule.cooldown_days} дн. ·{" "}
                      {rule.is_enabled ? "включён" : "выключен"}
                    </p>
                    <p style={{ whiteSpace: "pre-wrap" }}>{rule.text_template}</p>
                    <Button
                      type="button"
                      kind="ghost"
                      disabled={ruleMutation.isPending}
                      onClick={() =>
                        ruleMutation.mutate({
                          kind: rule.kind,
                          body: { is_enabled: !rule.is_enabled },
                        })
                      }
                    >
                      {rule.is_enabled ? "Отключить этот триггер" : "Включить этот триггер"}
                    </Button>
                  </Stack>
                )}
              </SectionCard>
            );
          })}
          {nudgesQuery.data && nudgesQuery.data.length === 0 ? (
            <Message>Правил нет — они засеются при первом обращении.</Message>
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard
        title="Рассылка"
        lead="Сначала считаем состав, потом отправляем. Дойдёт только до тех, кто подключил бота."
      >
        <Stack>
          <Field label="Сегмент">
            <SelectInput
              value={segment}
              onChange={(event) => {
                setSegment(event.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              {segments.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.key} — {item.description}
                  {item.reachable !== null && item.reachable !== undefined
                    ? ` (${item.reachable} с ботом из ${item.total})`
                    : ""}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Текст сообщения">
            <TextArea
              rows={6}
              value={broadcastText}
              placeholder="Что написать воркерам"
              onChange={(event) => {
                setBroadcastText(event.target.value);
                setPreview(null);
              }}
            />
          </Field>

          <Button
            type="button"
            kind="ghost"
            disabled={!broadcastText.trim() || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            Посчитать получателей
          </Button>

          {preview ? (
            <Stack>
              <Message tone={preview.reachable === 0 ? "error" : "success"}>
                Сегмент «{preview.description}»: подходит {preview.total}, с подключённым ботом{" "}
                {preview.reachable}.
                {preview.names.length > 0 ? ` Кому: ${preview.names.join(", ")}.` : ""}
              </Message>
              {preview.reachable > 0 ? (
                <Button
                  type="button"
                  disabled={sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                >
                  {sendMutation.isPending
                    ? "Отправляю…"
                    : `Отправить ${preview.reachable} воркерам`}
                </Button>
              ) : null}
            </Stack>
          ) : null}

          {result ? (
            <Message tone={result.failed > 0 ? "error" : "success"}>
              Доставлено {result.delivered}
              {result.skipped_no_chat ? `, без бота ${result.skipped_no_chat}` : ""}
              {result.failed ? `, ошибок ${result.failed}` : ""}.
              {result.failures.length > 0 ? ` Не дошло: ${result.failures.join("; ")}` : ""}
            </Message>
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard title="Ростер" lead="Самые простаивающие сверху.">
        <TableWrap>
          <DataTable>
            <thead>
              <tr>
                <th>Воркер</th>
                <th>Рефералы</th>
                <th>Заработок</th>
                <th>Тишина</th>
                <th>Бот</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.roster ?? []).map((row) => (
                <tr key={row.user_id}>
                  <td>{row.name}</td>
                  <td>{row.referrals}</td>
                  <td>{formatRub(row.earnings_kopeks)}</td>
                  <td>{row.days_silent === null ? "—" : `${row.days_silent} дн.`}</td>
                  <td>{row.bot_connected ? "да" : "нет"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableWrap>
        {overview && overview.roster.length === 0 ? <Message>Воркеров пока нет.</Message> : null}
      </SectionCard>

      <SectionCard title="История авто-пинков" lead="Что и кому уходило автоматически.">
        <TableWrap>
          <DataTable>
            <thead>
              <tr>
                <th>Воркер</th>
                <th>Триггер</th>
                <th>Когда</th>
              </tr>
            </thead>
            <tbody>
              {(logQuery.data?.items ?? []).map((item, index) => (
                <tr key={`${item.user_id}-${item.kind}-${index}`}>
                  <td>{item.name}</td>
                  <td>{item.kind}</td>
                  <td>{formatDate(item.sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableWrap>
        {logQuery.data && logQuery.data.items.length === 0 ? (
          <Message>Авто-пинки ещё не отправлялись.</Message>
        ) : null}
      </SectionCard>
    </Stack>
  );
};
