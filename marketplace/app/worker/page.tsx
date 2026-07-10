"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { CopyButton } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { appConfig } from "@/lib/config";
import { formatDate, formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
import type { WorkerCommission, WorkerReferral, WorkerStats } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import land from "@/components/landing/landing.module.css";
import styles from "./worker.module.css";

export default function WorkerPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isWorker, userRole } = useAuth();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/auth/login?next=/worker");
    }
  }, [isAuthenticated, isHydrated, router]);

  const enabled = isHydrated && isAuthenticated && isWorker;

  const statsQuery = useQuery<WorkerStats>({
    queryKey: ["worker-stats"],
    queryFn: () => api.getWorkerStats(),
    enabled,
  });

  const linkQuery = useQuery<{ referral_url: string }>({
    queryKey: ["worker-referral-link"],
    queryFn: () => api.getWorkerReferralLink(),
    enabled,
  });

  const referralsQuery = useQuery<{ items: WorkerReferral[]; total: number }>({
    queryKey: ["worker-referrals"],
    queryFn: () => api.getWorkerReferrals("?page_size=50"),
    enabled,
  });

  const commissionsQuery = useQuery<{ items: WorkerCommission[]; total: number }>({
    queryKey: ["worker-commissions"],
    queryFn: () => api.getWorkerCommissions("?page_size=50"),
    enabled,
  });

  /* Скелет до гидрации / пока роль не подтянулась из /me / при редиректе */
  if (!isHydrated || !isAuthenticated || userRole === null) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={styles.head} aria-hidden="true">
            <span className={ui.skeleton} style={{ height: 44, width: 320, display: "block" }} />
            <span
              className={ui.skeleton}
              style={{ height: 16, width: 420, display: "block", marginTop: 14 }}
            />
          </div>
          <div className={styles.statsGrid} aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={ui.skeleton} style={{ height: 96 }} />
            ))}
          </div>
        </div>
      </MarketShell>
    );
  }

  /* Залогинен, но не воркер */
  if (!isWorker) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={styles.guardWrap}>
            <div className={ui.notice}>
              Раздел для воркеров. Здесь партнёры платформы следят за приведёнными
              заказчиками и начислениями.
            </div>
            <Link href="/" className={ui.btnLine}>
              На главную
            </Link>
          </div>
        </div>
      </MarketShell>
    );
  }

  const stats = statsQuery.data;
  const referralUrl = linkQuery.data?.referral_url ?? "";
  const referrals = referralsQuery.data?.items ?? [];
  const commissions = commissionsQuery.data?.items ?? [];

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <h1 className={styles.headTitle}>
            Кабинет <span className={land.mark}>воркера</span>
          </h1>
          <p className={styles.headSub}>
            Приводите заказчиков — получайте процент с каждой их сделки.
          </p>
        </header>

        {/* ── Статистика ── */}
        {statsQuery.isLoading ? (
          <div className={styles.statsGrid} aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={ui.skeleton} style={{ height: 96 }} />
            ))}
          </div>
        ) : statsQuery.error ? (
          <div className={ui.noticeDanger} style={{ marginBottom: 28 }}>
            Не удалось загрузить статистику. Обновите страницу.
          </div>
        ) : (
          <div className={styles.statsGrid}>
            <div className={styles.statTile}>
              <div className={styles.statValue}>{formatMoney(stats?.total_earnings_kopeks)}</div>
              <div className={styles.statLabel}>Заработано всего</div>
            </div>
            <div className={styles.statTile}>
              <div className={styles.statValue}>{formatMoney(stats?.balance_kopeks)}</div>
              <div className={styles.statLabel}>Баланс</div>
            </div>
            <div className={styles.statTile}>
              <div className={styles.statValue}>{stats?.referral_count ?? 0}</div>
              <div className={styles.statLabel}>Приведено заказчиков</div>
            </div>
          </div>
        )}

        {/* ── Реферальная ссылка ── */}
        <section className={`${land.win} ${styles.refWin}`}>
          <div className={land.winBar}>
            <span className={land.winDots}>
              <span className={land.winDot} />
              <span className={land.winDot} />
              <span className={land.winDot} />
            </span>
            <span className={land.winUrl}>ваша-реферальная-ссылка</span>
          </div>
          <div className={land.winBody}>
            <h2 className={styles.refTitle}>Ваша реферальная ссылка</h2>
            <p className={styles.refSub}>
              Каждый заказчик, который зарегистрируется по ней, закрепляется за вами навсегда.
            </p>
            <div className={styles.refRow}>
              <input
                className={`${ui.input} ${styles.refInput}`}
                value={linkQuery.isLoading ? "Загружаем ссылку…" : referralUrl}
                readOnly
                aria-label="Реферальная ссылка"
                onFocus={(e) => e.currentTarget.select()}
              />
              {referralUrl && <CopyButton value={referralUrl} label="Копировать" />}
            </div>
            {linkQuery.error ? (
              <p className={styles.refSub}>Не удалось получить ссылку — обновите страницу.</p>
            ) : null}
            <div className={styles.refSteps}>
              <div className={styles.refStep}>
                <span className={styles.refStepNo}>1</span>
                <span className={styles.refStepText}>
                  <strong>Поделитесь ссылкой</strong>
                  Отправьте её заказчику в любом удобном канале.
                </span>
              </div>
              <div className={styles.refStep}>
                <span className={styles.refStepNo}>2</span>
                <span className={styles.refStepText}>
                  <strong>Заказчик регистрируется</strong>
                  Регистрация по ссылке — и он уже в вашей команде.
                </span>
              </div>
              <div className={styles.refStep}>
                <span className={styles.refStepNo}>3</span>
                <span className={styles.refStepText}>
                  <strong>Процент капает сам</strong>
                  С каждой его сделки — автоматически, без напоминаний.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Приведённые заказчики ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Приведённые заказчики</h2>
          {referralsQuery.isLoading ? (
            <span className={ui.skeleton} style={{ height: 120, display: "block" }} />
          ) : referralsQuery.error ? (
            <div className={ui.noticeDanger}>Не удалось загрузить список. Обновите страницу.</div>
          ) : referrals.length === 0 ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Пока никого</h3>
              <p className={ui.emptyText}>
                Поделитесь реферальной ссылкой — первый заказчик появится здесь.
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Заказчик</th>
                  <th>Дата регистрации</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.client_id}>
                    <td>{r.client_name}</td>
                    <td className={`${styles.cellMono} ${styles.cellMuted}`}>
                      {formatDate(r.registered_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Начисления ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Начисления</h2>
          {commissionsQuery.isLoading ? (
            <span className={ui.skeleton} style={{ height: 120, display: "block" }} />
          ) : commissionsQuery.error ? (
            <div className={ui.noticeDanger}>
              Не удалось загрузить начисления. Обновите страницу.
            </div>
          ) : commissions.length === 0 ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Начислений пока нет</h3>
              <p className={ui.emptyText}>
                Как только приведённый заказчик закроет первую сделку, комиссия появится здесь.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.commTableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>№ заказа</th>
                      <th>Заказчик</th>
                      <th className={styles.cellRight}>Сумма заказа</th>
                      <th className={styles.cellRight}>Ставка</th>
                      <th className={styles.cellRight}>Ваша комиссия</th>
                      <th className={styles.cellRight}>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c) => (
                      <tr key={`${c.order_id}-${c.date}`}>
                        <td className={styles.cellMono}>№ {dealNo(c.order_id, c.date)}</td>
                        <td>{c.client_name}</td>
                        <td className={`${styles.cellMono} ${styles.cellRight}`}>
                          {formatMoney(c.order_amount_kopeks)}
                        </td>
                        <td className={`${styles.cellMono} ${styles.cellMuted} ${styles.cellRight}`}>
                          {c.commission_pct}%
                        </td>
                        <td className={`${styles.cellCommission} ${styles.cellRight}`}>
                          +{formatMoney(c.commission_amount_kopeks)}
                        </td>
                        <td className={`${styles.cellMono} ${styles.cellMuted} ${styles.cellRight}`}>
                          {formatDate(c.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.commCards}>
                {commissions.map((c) => (
                  <div key={`${c.order_id}-${c.date}`} className={styles.commCard}>
                    <div className={styles.commCardTop}>
                      <span className={styles.commCardNo}>№ {dealNo(c.order_id, c.date)}</span>
                      <span className={styles.commCardDate}>{formatDate(c.date)}</span>
                    </div>
                    <div className={styles.commCardClient}>{c.client_name}</div>
                    <div className={styles.commCardRow}>
                      <span className={styles.commCardKey}>Сумма заказа</span>
                      <span className={styles.cellMono}>{formatMoney(c.order_amount_kopeks)}</span>
                    </div>
                    <div className={styles.commCardRow}>
                      <span className={styles.commCardKey}>Ставка</span>
                      <span className={styles.cellMono}>{c.commission_pct}%</span>
                    </div>
                    <div className={styles.commCardRow}>
                      <span className={styles.commCardKey}>Ваша комиссия</span>
                      <span className={styles.cellCommission}>
                        +{formatMoney(c.commission_amount_kopeks)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Вывод средств ── */}
        <section className={styles.payout}>
          <div>
            <div className={styles.payoutTitle}>Вывод средств</div>
            <p className={styles.payoutText}>
              Заработанное выводится в кабинете на основной платформе — там же реквизиты и
              история выплат.
            </p>
          </div>
          <a
            href={`${appConfig.mainAppUrl}/cabinet`}
            target="_blank"
            rel="noopener noreferrer"
            className={ui.btnPrimary}
          >
            Открыть кабинет
          </a>
        </section>
      </div>
    </MarketShell>
  );
}
