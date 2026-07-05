"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { Portrait } from "@/components/ui/bits";
import { Reveal } from "@/components/ui/motion";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatAudience, formatDate, formatMoney } from "@/lib/format";
import { provisionalDealNo, recordNo } from "@/lib/registry";
import type { BloggerProfileFull, Order } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./blogger.module.css";

const ShieldIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const genderLabel = (value: string | null): string => {
  if (value === "female") return "Женская";
  if (value === "male") return "Мужская";
  if (value === "other") return "Смешанная";
  return "Не указана";
};

const DEFAULT_BRIEF =
  "Здравствуйте! Хотим обсудить рекламную интеграцию: расскажу о продукте и пожеланиях к формату.";

export default function BloggerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();

  const bloggerUserId = params.id;

  const { data: blogger, isLoading, error } = useQuery<BloggerProfileFull>({
    queryKey: ["blogger-profile", bloggerUserId],
    queryFn: () => api.getBlogger(bloggerUserId),
    enabled: Boolean(bloggerUserId),
  });

  const [amountRub, setAmountRub] = useState("");
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (blogger && amountRub === "") {
      setAmountRub(String(Math.round(blogger.average_price_kopeks / 100)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogger]);

  const orderMutation = useMutation({
    mutationFn: async (): Promise<Order> => {
      const rub = Number(amountRub.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(rub) || rub < 1) {
        throw new Error("Укажите корректную сумму сделки");
      }
      return api.createOrder({
        blogger_id: bloggerUserId,
        message: brief.trim(),
        amount_kopeks: Math.round(rub * 100),
      });
    },
    onSuccess: (order) => {
      router.push(`/orders/${order.id}`);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/auth/login?next=/bloggers/${bloggerUserId}`);
        return;
      }
      setFormError(err.message || "Не удалось создать сделку");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!isAuthenticated) {
      router.push(`/auth/login?next=/bloggers/${bloggerUserId}`);
      return;
    }
    orderMutation.mutate();
  };

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <div className={styles.wrap}>
          <Link href="/catalog" className={styles.backLink}>
            ← В указатель авторов
          </Link>

          {isLoading ? (
            <div className={styles.layout}>
              <div className={ui.skeleton} style={{ aspectRatio: "4 / 5", maxWidth: 460 }} />
              <div className={ui.skeleton} style={{ height: 440 }} />
            </div>
          ) : error || !blogger ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Досье не найдено</h3>
              <p className={ui.emptyText}>Возможно, автор скрыл страницу или ссылка устарела.</p>
              <Link href="/catalog" className={ui.btnLine}>
                Вернуться в каталог
              </Link>
            </div>
          ) : (
            <>
              <Reveal as="header" className={styles.header}>
                <span className={ui.brow}>Досье автора</span>
                <h1 className={styles.name}>{blogger.name}</h1>
                <div className={styles.tagRow}>
                  <span className={styles.nicheTag}>{categoryLabel(blogger.category)}</span>
                  {blogger.orders_enabled ? (
                    <span className={ui.stampActive}>Принимает сделки</span>
                  ) : (
                    <span className={ui.stampMuted}>Сделки приостановлены</span>
                  )}
                </div>
              </Reveal>

              <div className={styles.layout}>
                {/* Левая колонка — портрет и нарратив */}
                <div>
                  <Portrait
                    name={blogger.name}
                    photoUrl={blogger.photo_url}
                    className={styles.portrait}
                    monoSize={88}
                  />

                  {blogger.description && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Об авторе</h2>
                      <p className={styles.description}>{blogger.description}</p>
                    </section>
                  )}

                  {blogger.social_links.length > 0 && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Площадки</h2>
                      <div className={styles.linkList}>
                        {blogger.social_links.map((link, i) => (
                          <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.linkItem}>
                            <span className={styles.linkNum}>{recordNo(i)}</span>
                            <span className={styles.linkUrl}>{link.replace(/^https?:\/\//, "")}</span>
                            <span className={styles.linkArrow}>↗</span>
                          </a>
                        ))}
                      </div>
                    </section>
                  )}

                  {blogger.portfolio_links.length > 0 && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Портфолио публикаций</h2>
                      <div className={styles.linkList}>
                        {blogger.portfolio_links.map((link, i) => (
                          <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.linkItem}>
                            <span className={styles.linkNum}>{recordNo(i)}</span>
                            <span className={styles.linkUrl}>{link.replace(/^https?:\/\//, "")}</span>
                            <span className={styles.linkArrow}>↗</span>
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Правая колонка — факты и сделка */}
                <aside className={styles.orderCard}>
                  <div className={styles.orderHead}>
                    <span className={styles.orderBrow}>Новая сделка</span>
                    <span className={styles.orderDealNo}>№&nbsp;{provisionalDealNo(bloggerUserId)}</span>
                  </div>

                  <div className={styles.orderPrice}>
                    <span className={styles.orderPriceValue}>{formatMoney(blogger.average_price_kopeks)}</span>
                    <span className={styles.orderPriceHint}>Ориентир за интеграцию</span>
                  </div>

                  <div className={`${ui.defList} ${styles.facts}`}>
                    <div className={ui.defRow}>
                      <span className={ui.defKey}>Охват</span>
                      <span className={`${ui.defValue} ${ui.mono}`}>{formatAudience(blogger.subscriber_count)}</span>
                    </div>
                    <div className={ui.defRow}>
                      <span className={ui.defKey}>Ниша</span>
                      <span className={ui.defValue}>{categoryLabel(blogger.category)}</span>
                    </div>
                    <div className={ui.defRow}>
                      <span className={ui.defKey}>Аудитория</span>
                      <span className={ui.defValue}>{genderLabel(blogger.gender)}</span>
                    </div>
                    <div className={ui.defRow}>
                      <span className={ui.defKey}>В реестре с</span>
                      <span className={`${ui.defValue} ${ui.mono}`}>{formatDate(blogger.created_at)}</span>
                    </div>
                  </div>

                  {isHydrated && isBlogger ? (
                    <div className={ui.notice}>
                      Вы вошли как автор. Сделки оформляют заказчики — ваши входящие
                      находятся в разделе «Входящие».
                    </div>
                  ) : !blogger.orders_enabled ? (
                    <div className={ui.notice}>
                      Автор временно не принимает сделки. Загляните позже или выберите другого в указателе.
                    </div>
                  ) : (
                    <form className={ui.form} onSubmit={handleSubmit}>
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>Бюджет интеграции</span>
                        <span className={styles.amountRow}>
                          <input
                            className={`${ui.input} ${ui.mono}`}
                            inputMode="numeric"
                            required
                            value={amountRub}
                            onChange={(e) => setAmountRub(e.target.value.replace(/[^\d\s.,]/g, ""))}
                            aria-label="Сумма в рублях"
                          />
                          <span className={styles.amountSuffix}>₽</span>
                        </span>
                      </label>
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>Бриф для автора</span>
                        <textarea
                          className={ui.textarea}
                          maxLength={1000}
                          minLength={1}
                          required
                          value={brief}
                          onChange={(e) => setBrief(e.target.value)}
                        />
                      </label>
                      {formError && <div className={ui.noticeDanger}>{formError}</div>}
                      <button className={`${ui.btnPrimary} ${ui.btnBlock}`} type="submit" disabled={orderMutation.isPending}>
                        {orderMutation.isPending
                          ? "Создаём сделку…"
                          : isAuthenticated
                            ? "Создать заказ"
                            : "Войти и создать заказ"}
                      </button>
                      {isHydrated && !isAuthenticated && (
                        <p className={ui.fine} style={{ textAlign: "center" }}>
                          Нужен аккаунт заказчика —{" "}
                          <Link href={`/auth/register?next=/bloggers/${bloggerUserId}`} className={ui.link}>
                            создать за минуту
                          </Link>
                        </p>
                      )}
                      <p className={styles.secureNote}>
                        <ShieldIcon />
                        Оплата удерживается на счёте платформы и переходит автору только
                        после того, как вы подтвердите публикацию.
                      </p>
                    </form>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
