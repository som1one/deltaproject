"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Switch } from "@/components/ui/bits";
import { api, type ProfileUpdateBody } from "@/lib/api";
import type { BloggerSelfProfile } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import s from "./cabinet.module.css";

/**
 * «Управление карточкой»: статус видимости в каталоге и приёма заказов
 * с оптимистичными переключателями + ссылка на публичную карточку.
 */
export function CardControls({ profile }: { profile: BloggerSelfProfile }) {
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: (body: ProfileUpdateBody) => api.updateSelfProfile(body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: SELF_PROFILE_KEY });
      const prev = queryClient.getQueryData<BloggerSelfProfile>(SELF_PROFILE_KEY);
      if (prev) queryClient.setQueryData(SELF_PROFILE_KEY, { ...prev, ...body });
      return { prev };
    },
    onError: (_error, _body, context) => {
      if (context?.prev) queryClient.setQueryData(SELF_PROFILE_KEY, context.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY }),
  });

  const status = !profile.is_active
    ? { dot: s.dotOff, text: "Карточка скрыта из каталога" }
    : profile.orders_enabled
      ? { dot: s.dotOn, text: "Карточка в каталоге · заказы открыты" }
      : { dot: s.dotPaused, text: "Карточка в каталоге · новые заказы на паузе" };

  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Управление карточкой</h2>
        <span className={s.statusLine}>
          <span className={`${s.statusDot} ${status.dot}`} aria-hidden="true" />
          {status.text}
        </span>
      </div>

      <div className={s.switchRows}>
        <div className={s.switchRow}>
          <span>
            <span className={s.switchTitle}>Показывать карточку в каталоге</span>
            <span className={s.switchHint}>
              Выключите, если хотите на время исчезнуть из поиска — профиль и прайс сохранятся.
            </span>
          </span>
          <Switch
            checked={profile.is_active}
            disabled={toggle.isPending}
            ariaLabel="Показывать карточку в каталоге"
            onChange={(next) => toggle.mutate({ is_active: next })}
          />
        </div>

        <div className={s.switchRow}>
          <span>
            <span className={s.switchTitle}>Принимать новые заказы</span>
            <span className={s.switchHint}>
              При паузе карточка остаётся видимой, но заказчики не смогут отправлять новые офферы.
            </span>
          </span>
          <Switch
            checked={profile.orders_enabled}
            disabled={toggle.isPending}
            ariaLabel="Принимать новые заказы"
            onChange={(next) => toggle.mutate({ orders_enabled: next })}
          />
        </div>
      </div>

      <div className={s.cardLinkRow}>
        <Link href={`/bloggers/${profile.user_id}`} className={`${ui.btnLine} ${ui.btnSmall}`} style={{ gap: 7 }}>
          <ExternalLink size={14} /> Открыть мою карточку
        </Link>
        <span className={ui.muted} style={{ fontSize: 12.5 }}>
          Так вас видят заказчики
        </span>
      </div>
    </section>
  );
}
