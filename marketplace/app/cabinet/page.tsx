"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCabinet } from "@/components/cabinet/blogger-cabinet";
import { ClientCabinet } from "@/components/cabinet/client-cabinet";
import { useAuth } from "@/lib/auth-context";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/cabinet/cabinet.module.css";

/**
 * /cabinet — ролевой кабинет.
 * Автор → центр управления карточкой, заказчик → хаб по сделкам,
 * воркер → свой кабинет /worker.
 */
export default function CabinetPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger, isWorker, userRole } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated) {
      router.replace("/auth/login?next=/cabinet");
      return;
    }
    if (isWorker) router.replace("/worker");
  }, [isAuthenticated, isHydrated, isWorker, router]);

  // Скелет: до гидрации, до редиректа и пока роль не подтянулась из /me.
  if (!isHydrated || !isAuthenticated || isWorker || !userRole) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={s.head}>
            <div className={ui.skeleton} style={{ height: 128, width: "100%", maxWidth: 460 }} />
          </div>
          <div className={s.layout}>
            <div className={s.col}>
              <div className={ui.skeleton} style={{ height: 220 }} />
            </div>
            <div className={s.col}>
              <div className={ui.skeleton} style={{ height: 160 }} />
            </div>
          </div>
        </div>
      </MarketShell>
    );
  }

  return (
    <MarketShell>
      <div className={shell.pageContainer}>{isBlogger ? <BloggerCabinet /> : <ClientCabinet />}</div>
    </MarketShell>
  );
}
