"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdMarketplaceShell, PageHeader, stitchStyles as styles } from "@/components/marketplace/stitch-marketplace";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";
import { appConfig } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

type ReferralInfo = {
  referral_link: string;
  total_earnings_kopeks: number;
};

type ReferredClient = {
  id: string;
  name: string;
  registered_at: string;
};

type ClientsResponse = {
  items: ReferredClient[];
  total: number;
};

type CommissionEntry = {
  id: string;
  client_name: string;
  commission_amount_kopeks: number;
  commission_pct: string;
  created_at: string;
};

type CommissionsResponse = {
  items: CommissionEntry[];
  total: number;
};

export default function WorkerMarketplacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated, isHydrated } = useAuth();
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/marketplace/auth/login?next=/worker/marketplace");
  }, [isAuthenticated, isHydrated, router]);

  const headers = { Authorization: `Bearer ${accessToken}` };

  const { data: referralInfo, isLoading } = useQuery<ReferralInfo>({
    queryKey: ["worker-marketplace-referral"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/referral/info`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить реферальную ссылку");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: clients } = useQuery<ClientsResponse>({
    queryKey: ["worker-marketplace-clients"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/referral/clients`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить клиентов");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: commissions } = useQuery<CommissionsResponse>({
    queryKey: ["worker-marketplace-commissions"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/referral/commissions`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить комиссии");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(withdrawAmount.replace(",", "."));
      if (!Number.isFinite(amount) || amount < 1) throw new Error("Минимальная сумма вывода — 1 ₽");
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/withdrawals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kopeks: Math.round(amount * 100) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось создать вывод");
      }
      return response.json();
    },
    onSuccess: () => {
      setMessage("Запрос на вывод создан.");
      setWithdrawAmount("");
      queryClient.invalidateQueries({ queryKey: ["worker-marketplace-referral"] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const copyLink = async () => {
    if (!referralInfo?.referral_link) return;
    await navigator.clipboard.writeText(referralInfo.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <AdMarketplaceShell>
      <main className={styles.main}>
        <PageHeader
          eyebrow="Партнёрский кабинет"
          title="Клиенты и комиссии"
          lead="Приглашайте клиентов на биржу и получайте комиссию с каждого оплаченного заказа."
        />

        {isLoading && <LoadingSpinner text="Загружаем кабинет..." />}
        {message && <p className={message.includes("создан") ? styles.successText : styles.errorText}>{message}</p>}

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.metricLabel}>Всего заработано</span>
            <span className={styles.statValue}>{formatMoney(referralInfo?.total_earnings_kopeks ?? 0)}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.metricLabel}>Приведено клиентов</span>
            <span className={styles.statValue}>{clients?.total ?? 0}</span>
          </div>
        </section>

        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Реферальная ссылка</h2>
            <div className={styles.copyRow} style={{ marginTop: 16 }}>
              <input className={styles.lineInput} readOnly value={referralInfo?.referral_link ?? ""} />
              <button className={styles.primaryButton} onClick={copyLink} type="button">
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>

            <form
              className={styles.form}
              style={{ marginTop: 28 }}
              onSubmit={(event) => {
                event.preventDefault();
                withdrawMutation.mutate();
              }}
            >
              <h3 className={styles.cardTitle}>Вывод средств</h3>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Сумма в рублях</span>
                <input
                  className={styles.lineInput}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                />
              </label>
              <button className={styles.secondaryButton} disabled={withdrawMutation.isPending} type="submit">
                {withdrawMutation.isPending ? "Отправка..." : "Вывести"}
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>История комиссий</h2>
            <div className={styles.list} style={{ marginTop: 16 }}>
              {commissions?.items.length === 0 && <p className={styles.emptyText}>Начислений пока нет.</p>}
              {commissions?.items.map((entry) => (
                <div className={styles.rowItem} key={entry.id}>
                  <div>
                    <strong>{entry.client_name}</strong>
                    <p className={styles.muted}>{entry.commission_pct}% · {formatDateTime(entry.created_at)}</p>
                  </div>
                  <strong>+{formatMoney(entry.commission_amount_kopeks)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdMarketplaceShell>
  );
}
