"use client";

/* Временная страница: проверка шапки модалки «Профиль» (шрифт заголовка + баннер). Удаляется после проверки. */

import { CalendarDays, Handshake, UserRound } from "lucide-react";

import { Modal, Portrait } from "@/components/ui/bits";

import ui from "@/components/ui/ui.module.css";
import st from "@/components/chat/chat.module.css";

export default function DevPeek() {
  return (
    <Modal open onClose={() => {}} title="Профиль" maxWidth={420}>
      <div className={st.peek}>
        <div className={st.peekHero} aria-hidden="true" />
        <Portrait name="Артур Чуль" photoUrl={null} className={st.peekAvatar} monoSize={32} />
        <span className={st.peekName}>Артур Чуль</span>
        <span className={st.peekRoleChip}>
          <UserRound size={13} strokeWidth={2.2} />
          Заказчик
        </span>
        <span className={st.peekNoReviews}>Отзывов пока нет</span>

        <div className={st.peekTiles}>
          <div className={st.peekTile}>
            <span className={`${st.peekTileIcon} ${st.peekTileGreen}`}>
              <Handshake size={17} strokeWidth={2} />
            </span>
            <span className={st.peekTileMeta}>
              <span className={st.peekTileValue}>0</span>
              <span className={st.peekTileLabel}>сделок завершено</span>
            </span>
          </div>
          <div className={st.peekTile}>
            <span className={`${st.peekTileIcon} ${st.peekTileViolet}`}>
              <CalendarDays size={17} strokeWidth={2} />
            </span>
            <span className={st.peekTileMeta}>
              <span className={st.peekTileValue}>Недавно</span>
              <span className={st.peekTileLabel}>на платформе</span>
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
