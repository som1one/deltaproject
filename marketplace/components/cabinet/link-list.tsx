"use client";

import { Plus, X } from "lucide-react";

import ui from "@/components/ui/ui.module.css";
import s from "./cabinet.module.css";

/**
 * Редактор списка ссылок: строки-инпуты с удалением и кнопкой «Добавить».
 * Используется для соцсетей и портфолио в кабинете автора.
 */
export function LinkListEditor({
  items,
  onChange,
  max,
  placeholder,
  addLabel,
  ariaLabel,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  max: number;
  placeholder: string;
  addLabel: string;
  ariaLabel: string;
}) {
  const update = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const add = () => {
    if (items.length < max) onChange([...items, ""]);
  };

  return (
    <div className={s.linkList}>
      {items.map((link, index) => (
        // Индекс как key безопасен: строки не сортируются, только добавляются/удаляются.
        <div key={index} className={s.linkRow}>
          <input
            className={ui.input}
            type="url"
            inputMode="url"
            value={link}
            placeholder={placeholder}
            aria-label={`${ariaLabel}, ссылка ${index + 1}`}
            onChange={(e) => update(index, e.target.value)}
          />
          <button
            type="button"
            className={s.linkRemove}
            onClick={() => remove(index)}
            aria-label={`Удалить ссылку ${index + 1}`}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className={s.addLink} onClick={add}>
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}
