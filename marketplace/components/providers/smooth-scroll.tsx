"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Плавное («масляное») инерционное пролистывание страницы (Lenis).
 * Использует нативный скролл, поэтому position: sticky и scroll-reveal
 * (IntersectionObserver) продолжают работать. На тач-устройствах —
 * нативный скролл. Отключается при prefers-reduced-motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.6,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Плавный переход к якорям (#how и т.п.) на текущей странице
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      const [path, hash] = href.split("#");
      if (!hash) return;
      if (path && path !== "" && path !== "/" && path !== window.location.pathname) return;
      const el = document.getElementById(hash);
      if (!el) return;
      event.preventDefault();
      lenis.scrollTo(el, { offset: -84, duration: 1.3 });
      window.history.pushState(null, "", `#${hash}`);
    };
    document.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick);
      lenis.destroy();
    };
  }, []);

  return null;
}
