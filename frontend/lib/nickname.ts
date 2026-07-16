/**
 * Ник блогера — правила один в один с BloggerLoginRequest на бэкенде
 * (schemas/auth.py): 3–32 символа, латиница/цифры/._-, по краям буква или цифра.
 * Проверяем до запроса, чтобы пользователь видел человеческую подсказку,
 * а не сырую ошибку pydantic «String should match pattern…».
 */

export const NICKNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$/;

/** Пробелы по краям и телеграмная привычка писать «@ник» — не повод падать. */
export const normalizeNickname = (raw: string): string => raw.trim().replace(/^@+/, "");

/** null — ник валиден, иначе готовое сообщение для формы. */
export const nicknameIssue = (nickname: string): string | null => {
  if (!nickname) return "Введите никнейм — его выдаёт администратор.";
  if (nickname.length < 3 || nickname.length > 32) return "Ник — от 3 до 32 символов.";
  if (/[А-Яа-яЁё]/.test(nickname)) return "Ник набирается латиницей — кириллица не подойдёт.";
  if (/[^A-Za-z0-9._-]/.test(nickname)) {
    return "В нике допустимы только латиница, цифры, точка, дефис и подчёркивание.";
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return "Ник должен начинаться и заканчиваться буквой или цифрой.";
  }
  return null;
};
