/**
 * Браузерные уведомления о новых сообщениях в чате.
 *
 * Флаг в localStorage: "1" — включены, "0" — выключены пользователем,
 * отсутствует — пользователь ещё не решил (при заходе в чат спросим).
 * Уведомление показывается только когда вкладка не в фокусе.
 */

const FLAG_KEY = "mp-chat-notify";

export const notificationsSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export const chatNotifyFlag = (): string | null =>
  typeof window === "undefined" ? null : window.localStorage.getItem(FLAG_KEY);

export const setChatNotifyFlag = (on: boolean): void => {
  window.localStorage.setItem(FLAG_KEY, on ? "1" : "0");
};

/** Включены ли уведомления фактически: флаг + разрешение браузера. */
export const chatNotificationsActive = (): boolean =>
  notificationsSupported() &&
  Notification.permission === "granted" &&
  chatNotifyFlag() !== "0";

/** Запросить разрешение браузера; при выдаче — включить флаг. */
export const requestChatNotifications = async (): Promise<NotificationPermission> => {
  if (!notificationsSupported()) return "denied";
  const permission = await Notification.requestPermission();
  if (permission === "granted" && chatNotifyFlag() !== "0") setChatNotifyFlag(true);
  return permission;
};

/** Показать уведомление о сообщении (только для фоновой вкладки). */
export const showChatNotification = (
  title: string,
  body: string,
  partnerId: string,
): void => {
  if (!chatNotificationsActive()) return;
  if (document.hasFocus()) return; // вкладка перед глазами — не дублируем
  try {
    const notification = new Notification(title, {
      body,
      tag: `mp-chat-${partnerId}`, // новое сообщение заменяет старое, не спамим
      icon: "/icon.png",
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = `/chats/${partnerId}`;
      notification.close();
    };
  } catch {
    // Notification может бросить в нестандартных окружениях — молча пропускаем
  }
};
