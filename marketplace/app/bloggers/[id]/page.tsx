"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { Avatar } from "@/components/ui/bits";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatAudience, formatMoney } from "@/lib/format";
import type { BloggerProfileFull, Order } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./blogger.module.css";

const ShieldIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const DEFAULT_BRIEF = "Здравствуйте! Хотим обсудить рекламную интеграцию. Расскажу о продукте и пожеланиях к формату.";

export default function BloggerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isHydrated, isAuthenticated, isClient, isBlogger } = useAuth();

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
        throw new Error("Укажите корректную сумму заказа");
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
      setFormError(err.message || "Не удалось создать заказ");
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
            ← В каталог
          </Link>

          {isLoading ? (
            <div className={styles.layout}>
              <div>
                <div className={ui.skeleton} style={{ height: 120, borderRadius: 20 }} />
                <div className={ui.skeleton} style={{ height: 260, borderRadius: 20, marginTop: 26 }} />
              </div>
              <div className={ui.skeleton} style={{ height: 420, borderRadius: 28 }} />
            </div>
          ) : error || !blogger ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Профиль не найден</h3>
              <p className={ui.muted}>Возможно, автор скрыл свою страницу или ссылка устарела.</p>
              <Link href="/catalog" className={ui.btnSecondary} style={{ marginTop: 18 }}>
                Вернуться в каталог
              </Link>
            </div>
          ) : (
            <div className={styles.layout}>
              <article>
                <header className={styles.profileHead}>
                  <Avatar name={blogger.name} photoUrl={blogger.photo_url} size={92} />
                  <div className={styles.headMeta}>
                    <div className={styles.tagRow}>
                      <span className={ui.badgeBronze}>{categoryLabel(blogger.category)}</span>
                      {blogger.orders_enabled ? (
                        <span className={ui.badgeSuccess}>Принимает заказы</span>
                      ) : (
                        <span className={ui.badge}>Заказы приостановлены</span>
                      )}
                    </div>
                    <h1 className={styles.name}>{blogger.name}</h1>
                  </div>
                </header>

                <div className={styles.statsRow}>
                  <div className={styles.statCard}>
                    <div className={styles.statCardValue}>{formatAudience(blogger.subscriber_count)}</div>
                    <div className={styles.statCardLabel}>подписчиков</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statCardValue}>{formatMoney(blogger.average_price_kopeks)}</div>
                    <div className={styles.statCardLabel}>средняя цена</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statCardValue}>{categoryLabel(blogger.category)}</div>
                    <div className={styles.statCardLabel}>ниша</div>
                  </div>
                </div>

                {blogger.description && (
                  <>
                    <h2 className={styles.blockTitle}>Об авторе</h2>
                    <p className={styles.description}>{blogger.description}</p>
                  </>
                )}

                {blogger.social_links.length > 0 && (
                  <>
                    <h2 className={styles.blockTitle}>Площадки</h2>
                    <div className={styles.linkList}>
                      {blogger.social_links.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.linkItem}>
                          {link}
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {blogger.portfolio_links.length > 0 && (
                  <>
                    <h2 className={styles.blockTitle}>Портфолио</h2>
                    <div className={styles.linkList}>
                      {blogger.portfolio_links.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.linkItem}>
                          {link}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <aside className={styles.orderPanel}>
                <span className={ui.eyebrow}>Новый заказ</span>
                <div className={styles.orderPrice}>
                  <span className={styles.orderPriceValue}>{formatMoney(blogger.average_price_kopeks)}</span>
                  <span className={styles.orderPriceHint}>ориентир за интеграцию</span>
                </div>

                {isHydrated && isBlogger ? (
                  <div className={ui.notice}>
                    Вы вошли как блогер. Заказы могут оформлять только заказчики —
                    ваши входящие заказы находятся в разделе «Заказы блогера».
                  </div>
                ) : !blogger.orders_enabled ? (
                  <div className={ui.notice}>
                    Автор временно не принимает новые заказы. Загляните позже или выберите другого автора в каталоге.
                  </div>
                ) : (
                  <form className={ui.form} onSubmit={handleSubmit}>
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>Бюджет интеграции</span>
                      <span className={styles.amountRow}>
                        <input
                          className={ui.input}
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
                    <button className={ui.btnPrimary} type="submit" disabled={orderMutation.isPending}>
                      {orderMutation.isPending
                        ? "Создаём заказ…"
                        : isAuthenticated
                          ? "Оформить заказ"
                          : "Войти и оформить заказ"}
                    </button>
                    {isHydrated && !isAuthenticated && (
                      <p className={ui.fine} style={{ textAlign: "center" }}>
                        Нужен аккаунт заказчика —{" "}
                        <Link href={`/auth/register?next=/bloggers/${bloggerUserId}`} style={{ color: "var(--bronze-deep)", fontWeight: 600 }}>
                          создать за минуту
                        </Link>
                      </p>
                    )}
                    <p className={styles.secureNote}>
                      <ShieldIcon />
                      Оплата уходит на счёт платформы и передаётся автору только после того,
                      как вы подтвердите результат.
                    </p>
                  </form>
                )}

                {isHydrated && isClient && (
                  <p className={ui.fine} style={{ marginTop: 14 }}>
                    После оформления вы получите реквизиты для оплаты в карточке заказа.
                  </p>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
