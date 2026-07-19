"use client";

import { useEffect, useRef, type RefObject } from "react";
import Lenis from "lenis";

/**
 * Вложенный Lenis для скролл-контейнеров чата: то же «масляное»
 * инерционное пролистывание, что и у страницы. Корневой инстанс сюда
 * не дотягивается из-за data-lenis-prevent (атрибут на самом wrapper
 * вложенного инстанса его собственные события не глушит — Lenis
 * проверяет только узлы ниже wrapper). Тач остаётся нативным;
 * при prefers-reduced-motion инстанс не создаётся.
 */
export function useNestedLenis(ref: RefObject<HTMLElement | null>, ready = true) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      wrapper: el,
      content: el,
      // Высота ленты меняется с каждым сообщением: считаем limit прямо
      // из scrollHeight контейнера, без отдельного content-элемента.
      naiveDimensions: true,
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [ref, ready]);

  return lenisRef;
}
