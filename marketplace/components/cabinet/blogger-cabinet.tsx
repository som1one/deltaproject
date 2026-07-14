"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChartPie,
  ChevronDown,
  ExternalLink,
  Handshake,
  SlidersHorizontal,
  Tags,
  UserRound,
  Wallet,
} from "lucide-react";

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

type Section = "controls" | "profile" | "prices" | "audience" | "deals" | "balance";

/** Кабинет автора: разделы в macOS-окне с боковой навигацией. */
export function BloggerCabinet() {
  const { userName } = useAuth();
  const [section, setSection] = useState<Section>("controls");
  // Мобильный переключатель разделов: раскрыт ли список (на десктопе не рендерится)
  const [navOpen, setNavOpen] = useState(false);
  const navTriggerRef = useRef<HTMLButtonElement>(null);

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

  /* Статус-метки в навигации: видно состояние, не заходя в раздел */
  const enabledPrices = (profile?.price_list_full ?? []).filter((i) => i.is_enabled).length;
  const audienceVerified = Boolean(profile?.audience_verified_at);
  const audiencePending = profile?.latest_audience_submission?.status === "pending";
  const cardLive = Boolean(profile?.is_active);
  const ordersOn = Boolean(profile?.orders_enabled);

  const nav: {
    group: string;
    items: { key: Section; label: string; icon: typeof UserRound; dot?: "green" | "amber" | "gray"; count?: number; gold?: boolean }[];
  }[] = [
    {
      group: "Карточка",
      items: [
        {
          key: "controls",
          label: "Управление",
          icon: SlidersHorizontal,
          dot: !cardLive ? "gray" : ordersOn ? "green" : "amber",
        },
        { key: "profile", label: "Профиль", icon: UserRound },
        { key: "prices", label: "Прайс-лист", icon: Tags, count: enabledPrices || undefined },
        {
          key: "audience",
          label: "Аудитория",
          icon: ChartPie,
          dot: audienceVerified ? "green" : audiencePending ? "amber" : undefined,
        },
      ],
    },
    {
      group: "Платформа",
      items: [
        { key: "deals", label: "Сделки", icon: Handshake, count: activeDeals.length || undefined },
        { key: "balance", label: "Баланс и выплаты", icon: Wallet },
      ],
    },
  ];

  type NavItem = (typeof nav)[number]["items"][number];

  const activeItem = nav.flatMap((g) => g.items).find((i) => i.key === section) ?? nav[0].items[0];
  const ActiveIcon = activeItem.icon;

  const selectSection = (key: Section) => {
    setSection(key);
    // Выбор из раскрытого списка размонтирует нажатую кнопку — возвращаем
    // фокус на триггер, иначе клавиатура/скринридер выпадают в <body>
    if (navOpen) {
      setNavOpen(false);
      navTriggerRef.current?.focus();
    }
  };

  const dotClass = (dot: NonNullable<NavItem["dot"]>) =>
    `${s.wnavDot} ${dot === "green" ? s.wnavDotGreen : dot === "amber" ? s.wnavDotAmber : s.wnavDotGray}`;

  /* Одна строка навигации — общая для сайдбара (десктоп) и раскрытого списка (мобайл) */
  const renderNavItem = (item: NavItem) => (
    <button
      key={item.key}
      type="button"
      className={`${s.wnavItem} ${section === item.key ? s.wnavItemActive : ""}`.trim()}
      aria-current={section === item.key || undefined}
      onClick={() => selectSection(item.key)}
    >
      <item.icon
        size={16}
        strokeWidth={2}
        className={item.gold && section !== item.key ? s.wnavGold : undefined}
      />
      <span className={s.wnavLabel}>{item.label}</span>
      {item.count != null && <span className={s.wnavCount}>{item.count}</span>}
      {item.dot && <span className={dotClass(item.dot)} />}
    </button>
  );

  return (
    <>
      <header className={s.head}>
        <h1 className={s.greeting}>
          С возвращением, <span className={land.mark}>{displayName}</span>
        </h1>
        <p className={s.sub}>
          Карточка в каталоге, прайс-лист и статистика аудитории — всё управление в одном месте.
        </p>
      </header>

      {profileLoading ? (
        <div className={s.win} aria-hidden="true">
          <div className={s.winBar}>
            <span className={s.winDots}>
              <span className={s.winDot} />
              <span className={s.winDot} />
              <span className={s.winDot} />
            </span>
            <span className={s.winUrl}>marketplace.looneymoon.ru/cabinet</span>
          </div>
          <div className={s.winBody}>
            {/* Мобайл: плейсхолдер строки-переключателя, чтобы контент не прыгал после загрузки */}
            <div className={s.wnavMobile}>
              <span className={ui.skeleton} style={{ display: "block", height: 22, borderRadius: 8, margin: "14px 16px" }} />
            </div>
            <div className={s.wnav}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={ui.skeleton} style={{ height: 36, borderRadius: 10, margin: "2px 10px" }} />
              ))}
            </div>
            <div className={s.pane}>
              <div className={s.paneInner}>
                <span className={ui.skeleton} style={{ height: 180 }} />
                <span className={ui.skeleton} style={{ height: 260 }} />
              </div>
            </div>
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
        <div className={s.win}>
          <div className={s.winBar}>
            <span className={s.winDots}>
              <span className={s.winDot} />
              <span className={s.winDot} />
              <span className={s.winDot} />
            </span>
            <span className={s.winUrl}>marketplace.looneymoon.ru/cabinet</span>
          </div>

          <div className={s.winBody}>
            {/* Мобайл: строка с текущим разделом, тап раскрывает полный список.
                Лента-скролл прятала 4 из 6 разделов за краем экрана. */}
            <div
              className={s.wnavMobile}
              onKeyDown={(e) => {
                if (e.key === "Escape" && navOpen) {
                  setNavOpen(false);
                  navTriggerRef.current?.focus();
                }
              }}
            >
              <button
                ref={navTriggerRef}
                type="button"
                className={s.wnavMobileTrigger}
                aria-expanded={navOpen}
                onClick={() => setNavOpen((open) => !open)}
              >
                <ActiveIcon size={16} strokeWidth={2} />
                <span className={s.srOnly}>Раздел кабинета:</span>
                <span className={s.wnavMobileLabel}>{activeItem.label}</span>
                {activeItem.count != null && <span className={s.wnavCount}>{activeItem.count}</span>}
                {activeItem.dot && <span className={dotClass(activeItem.dot)} />}
                <ChevronDown
                  size={17}
                  strokeWidth={2}
                  className={`${s.wnavMobileChevron} ${navOpen ? s.wnavMobileChevronOpen : ""}`.trim()}
                />
              </button>
              {navOpen && (
                <nav className={s.wnavMobileList} aria-label="Разделы кабинета">
                  {nav.map((group) => (
                    <div key={group.group} className={s.wnavSection}>
                      <span className={s.wnavGroup}>{group.group}</span>
                      {group.items.map(renderNavItem)}
                    </div>
                  ))}
                </nav>
              )}
            </div>

            <nav className={s.wnav} aria-label="Разделы кабинета" data-lenis-prevent>
              {nav.map((group) => (
                <div key={group.group} className={s.wnavSection}>
                  <span className={s.wnavGroup}>{group.group}</span>
                  {group.items.map(renderNavItem)}
                </div>
              ))}
            </nav>

            {/* Разделы скрываются, а не размонтируются: черновики форм
                переживают переключение между пунктами навигации */}
            <div className={s.pane} data-lenis-prevent>
              <div hidden={section !== "controls"} className={s.paneInner}>
                <PremiumCard compact />
                <CardControls profile={profile} />
              </div>
              <div hidden={section !== "profile"} className={s.paneInner}>
                <ProfileEditor key={`profile-${profile.id}`} profile={profile} />
              </div>
              <div hidden={section !== "prices"} className={s.paneInner}>
                <PriceListEditor
                  key={`prices-${profile.id}-${(serviceTypes ?? []).length}`}
                  serviceTypes={serviceTypes ?? []}
                  priceList={profile.price_list_full}
                />
              </div>
              <div hidden={section !== "audience"} className={s.paneInner}>
                <AudienceSection
                  key={`audience-${profile.latest_audience_submission?.id ?? "none"}`}
                  profile={profile}
                />
              </div>
              <div hidden={section !== "deals"} className={s.paneInner}>
                <DealsMini orders={activeDeals} isLoading={ordersLoading} isBlogger limit={8} />
              </div>
              <div hidden={section !== "balance"} className={s.paneInner}>
                <section className={`${ui.card} ${s.panel}`}>
                  <div className={s.balanceCard}>
                    <span className={s.balanceIcon}>
                      <Wallet size={18} />
                    </span>
                    <div className={s.balanceText}>
                      <span className={s.balanceTitle}>Баланс и выплаты</span>
                      Начисления за завершённые сделки и вывод средств — в кабинете на основной
                      платформе looney moon.
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
              </div>
            </div>
          </div>
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
