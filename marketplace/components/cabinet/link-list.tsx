"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ImagePlus, Plus, X } from "lucide-react";

import { api } from "@/lib/api";
import { resolveUploadUrl } from "@/lib/config";

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

export type PortfolioItem = { url: string; cover: string | null };

/**
 * Редактор портфолио: у каждой работы — ссылка и необязательная обложка.
 * Обложка грузится по клику на квадрат слева и показывается в публичной
 * карточке вместо плитки с логотипом площадки.
 */
export function PortfolioListEditor({
  items,
  onChange,
  max,
  onError,
}: {
  items: PortfolioItem[];
  onChange: Dispatch<SetStateAction<PortfolioItem[]>>;
  max: number;
  onError: (message: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadIndex, setUploadIndex] = useState<number | null>(null);
  const pendingIndexRef = useRef<number | null>(null);

  const patchCover = (index: number, cover: string | null) => {
    // Функциональный апдейт: ссылка могла поменяться, пока грузилась обложка
    onChange((prev) => prev.map((item, i) => (i === index ? { ...item, cover } : item)));
  };

  const pickCover = (index: number) => {
    pendingIndexRef.current = index;
    fileRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    const index = pendingIndexRef.current;
    pendingIndexRef.current = null;
    if (!file || index == null) return;
    onError(null);
    setUploadIndex(index);
    try {
      const { url } = await api.uploadImage(file);
      patchCover(index, url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось загрузить обложку");
    } finally {
      setUploadIndex(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={s.linkList}>
      {items.map((item, index) => (
        // Индекс как key безопасен: строки не сортируются, только добавляются/удаляются.
        <div key={index} className={s.linkRow}>
          <span className={s.pfCover}>
            <button
              type="button"
              className={s.pfCoverPick}
              data-uploading={uploadIndex === index || undefined}
              disabled={uploadIndex != null}
              onClick={() => pickCover(index)}
              aria-label={
                item.cover ? `Заменить обложку работы ${index + 1}` : `Добавить обложку работы ${index + 1}`
              }
            >
              {item.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveUploadUrl(item.cover) ?? item.cover} alt="" />
              ) : (
                <ImagePlus size={15} />
              )}
            </button>
            {item.cover && (
              <button
                type="button"
                className={s.pfCoverClear}
                onClick={() => patchCover(index, null)}
                aria-label={`Убрать обложку работы ${index + 1}`}
              >
                <X size={11} />
              </button>
            )}
          </span>
          <input
            className={ui.input}
            type="url"
            inputMode="url"
            value={item.url}
            placeholder="https://ссылка-на-публикацию"
            aria-label={`Портфолио, ссылка ${index + 1}`}
            onChange={(e) =>
              onChange((prev) => prev.map((it, i) => (i === index ? { ...it, url: e.target.value } : it)))
            }
          />
          <button
            type="button"
            className={s.linkRemove}
            onClick={() => onChange((prev) => prev.filter((_, i) => i !== index))}
            aria-label={`Удалить работу ${index + 1}`}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          className={s.addLink}
          onClick={() => onChange((prev) => (prev.length < max ? [...prev, { url: "", cover: null }] : prev))}
        >
          <Plus size={14} /> Добавить работу
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Загрузить обложку работы"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
