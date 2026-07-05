/* Мотив «Реестр»: детерминированные номера записей и сделок.
   Номера выводятся из уже существующих id — бэкенд не меняется. */

/** Стабильный хеш строки в беззнаковое 32-битное число. */
const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Год из даты создания либо текущий. */
const yearOf = (createdAt?: string | null): number => {
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return new Date().getFullYear();
};

/** № сделки: LM-2026-0147 — стабильно для одного и того же заказа. */
export const dealNo = (id: string, createdAt?: string | null): string => {
  const n = (hash(id) % 9999) + 1;
  return `LM-${yearOf(createdAt)}-${String(n).padStart(4, "0")}`;
};

/** Провизорный № будущей сделки для профиля автора (обещание процесса). */
export const provisionalDealNo = (bloggerId: string): string => {
  const n = (hash(`draft:${bloggerId}`) % 9999) + 1;
  return `LM-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
};

/** Номер записи в указателе: 01, 02, … (двузначный минимум). */
export const recordNo = (index: number): string => String(index + 1).padStart(2, "0");
