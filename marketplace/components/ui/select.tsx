"use client";

import { type KeyboardEvent as ReactKbdEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import styles from "./select.module.css";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
  leadingIcon?: ReactNode;
};

type Coords = { left: number; top: number; width: number; up: boolean };

/**
 * Кастомный дропдаун в стиле сайта — замена нативному <select>, у которого
 * список опций рисует ОС и его нельзя привести к нашей палитре. Меню летит
 * в портал (position: fixed), поэтому его не режет липкий тулбар и лента
 * фильтров с overflow.
 */
export function Select({ value, onChange, options, ariaLabel, className, leadingIcon }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const estH = Math.min(320, options.length * 40 + 12);
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < estH + gap && r.top > spaceBelow;
    setCoords({ left: r.left, top: up ? r.top - gap : r.bottom + gap, width: r.width, up });
  };

  const openMenu = () => {
    setActive(selectedIndex);
    place();
    setOpen(true);
  };

  const close = (focusTrigger = false) => {
    setOpen(false);
    setCoords(null);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (v: string) => {
    onChange(v);
    close(true);
  };

  // Меню — position: fixed, поэтому при скролле/ресайзе держим его под триггером
  // (перепозиционируем, а не закрываем — иначе микро-скролл Lenis схлопывает его).
  // Закрытие — только по клику вне, Escape или выбору.
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Держим активную опцию в поле зрения при навигации с клавиатуры.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onTriggerKey = (e: ReactKbdEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return;
    e.preventDefault();
    if (!open) {
      openMenu();
      return;
    }
    if (e.key === "Enter" || e.key === " ") choose(options[active]?.value ?? value);
    else if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
    else setActive((i) => Math.max(0, i - 1));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-open={open || undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        {leadingIcon && (
          <span className={styles.leading} aria-hidden>
            {leadingIcon}
          </span>
        )}
        <span className={styles.label}>{selected?.label}</span>
        <ChevronDown className={styles.chevron} size={16} strokeWidth={2} aria-hidden />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            data-lenis-prevent
            data-up={coords.up || undefined}
            style={{
              left: coords.left,
              width: coords.width,
              ...(coords.up
                ? { bottom: window.innerHeight - coords.top }
                : { top: coords.top }),
            }}
          >
            {options.map((o, i) => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  data-idx={i}
                  data-active={i === active || undefined}
                  className={styles.option}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                >
                  <span className={styles.check} aria-hidden>
                    {isSel && <Check size={13} strokeWidth={2.75} />}
                  </span>
                  <span className={styles.optLabel}>{o.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
