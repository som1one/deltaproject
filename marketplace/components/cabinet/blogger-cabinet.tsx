"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Settings, Wallet } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import type { BloggerSelfProfile, OrdersResponse, ServiceType } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import land from "@/components/landing/landing.module.css";
import { AudienceSection } from "./audience-section";
import { CardControls } from "./card-controls";
import { DealsMini } from "./deals-mini";
import { ORDERS_KEY, SELF_PROFILE_KEY } from "./keys";
import { Onboarding } from "./onboarding";
import { PremiumCard } from "./premium-card";
import { PriceListEditor } from "./price-list-editor";
import { ProfileEditor } from "./profile-editor";
import s from "./cabinet.module.css";

const is404 = (e: unknown) => e instanceof ApiError && e.status === 404;

/** Кабинет автора: центр управления карточкой в каталоге. */
export function BloggerCabinet() {
  const { userName } = useAuth();

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery<BloggerSelfProfile>({
    queryKey: SELF_PROFILE_KEY,
    queryFn: api.getSelfProfile,
    retry: (failureCount, error) => !is404(error) && failureCount < 2,
  });

  const noProfile = is404(profileError);

  const { data: serviceTypes } = useQuery<ServiceType[]>({
    queryKey: ["marketplace-service-types"],
    queryFn: api.getServiceTypes,
    staleTime: 5 * 60_000,
    enabled: Boolean(profile),
  });

  const { data: ordersResp, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ORDERS_KEY,
    queryFn: () => api.getOrders("?page_size=50"),
  });

  const activeDeals = useMemo(() => {
    const items = ordersResp?.items ?? [];
    return items
      .filter((o) => ACTIVE_ORDER_STATUSES.has(o.status))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [ordersResp]);

  const displayName = profile?.name ?? userName ?? "автор";

  return (
    <>
      <header className={s.head}>
        <div className={s.headRow}>
          <div>
            <span className={ui.brow}>Кабинет автора</span>
            <h1 className={s.greeting}>
              С возвращением, <span className={land.mark}>{displayName}</span>
            </h1>
            <p className={s.sub}>
              Карточка в каталоге, прайс-лист и статистика аудитории — всё управление в одном месте.
            </p>
          </div>
          <div className={s.headAction}>
            <Link href="/settings" className={`${ui.btnLine} ${ui.btnSmall}`} style={{ gap: 7 }}>
              <Settings size={14} /> Настройки аккаунта
            </Link>
          </div>
        </div>
      </header>

      {profileLoading ? (
        <div className={s.layout}>
          <div className={s.col}>
            <div className={ui.skeleton} style={{ height: 180 }} />
            <div className={ui.skeleton} style={{ height: 320 }} />
          </div>
          <div className={s.col}>
            <div className={ui.skeleton} style={{ height: 160 }} />
            <div className={ui.skeleton} style={{ height: 140 }} />
          </div>
        </div>
      ) : noProfile ? (
        <div className={s.layout}>
          <div className={s.col}>
            <Onboarding />
          </div>
          <div className={s.col}>
            <PremiumCard />
          </div>
        </div>
      ) : profile ? (
        <div className={s.layout}>
          <div className={s.col}>
            <CardControls profile={profile} />
            {/* key по id: локальные черновики форм переживают фоновые рефетчи */}
            <ProfileEditor key={`profile-${profile.id}`} profile={profile} />
            <PriceListEditor
              key={`prices-${profile.id}-${(serviceTypes ?? []).length}`}
              serviceTypes={serviceTypes ?? []}
              priceList={profile.price_list_full}
            />
            <AudienceSection
              key={`audience-${profile.latest_audience_submission?.id ?? "none"}`}
              profile={profile}
            />
          </div>

          <aside className={s.col}>
            <PremiumCard />

            <section className={`${ui.card} ${s.panel}`}>
              <div className={s.balanceCard}>
                <span className={s.balanceIcon}>
                  <Wallet size={18} />
                </span>
                <div className={s.balanceText}>
                  <span className={s.balanceTitle}>Баланс и выплаты</span>
                  Начисления за завершённые сделки и вывод средств — в кабинете на основной платформе looney
                  moon.
                  <div style={{ marginTop: 12 }}>
                    <a
                      href={`${appConfig.mainAppUrl}/cabinet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${ui.btnLine} ${ui.btnSmall}`}
                      style={{ gap: 7 }}
                    >
                      <ExternalLink size={14} /> Открыть кабинет выплат
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <DealsMini orders={activeDeals} isLoading={ordersLoading} isBlogger limit={3} />
          </aside>
        </div>
      ) : (
        <div className={s.layout}>
          <div className={s.col}>
            <div className={ui.noticeDanger}>
              Не получилось загрузить профиль. Обновите страницу — если не поможет, напишите в{" "}
              <Link href="/support" className={ui.link}>
                поддержку
              </Link>
              .
            </div>
          </div>
        </div>
      )}
    </>
  );
}
