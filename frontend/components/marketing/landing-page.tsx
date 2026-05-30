"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { useSessionTarget } from "@/lib/use-session-target";
import styles from "@/components/marketing/landing.module.css";

const QUOTE = "«Великое рождается из тишины, а не из шума».";
const AUTHOR = "Томас Карлейль";

const manifestoLines: { strong: string; soft: string }[] = [
  { strong: "Прозрачные сделки", soft: "от первой переписки до выплаты." },
  { strong: "Точные расчёты", soft: "без таблиц и калькуляторов." },
  { strong: "Защищённая сеть", soft: "блогеров, работников и рефералов." },
  { strong: "Одна платформа", soft: "вместо десятка чатов и документов." },
];

const processSteps: { num: string; title: string; text: string }[] = [
  {
    num: "01",
    title: "Работник находит продавца",
    text: "Пишет по готовым скриптам, согласовывает рекламу и заводит сделку в системе.",
  },
  {
    num: "02",
    title: "Блогер принимает интеграцию",
    text: "Видит заявку, согласовывает контакты и сумму, выпускает рекламу.",
  },
  {
    num: "03",
    title: "Администратор подтверждает",
    text: "Каждая сделка проходит проверку. После статуса «Оплачена» включается распределение.",
  },
  {
    num: "04",
    title: "Система считает выплаты",
    text: "Доли работника, блогера, реферала и платформы попадают на балансы автоматически.",
  },
];

/* =========================================================
   Intro overlay - typewriter reveal
   Each character pops in (opacity only) to feel like typing.
   After full reveal, the whole panel dissolves quickly.
   ========================================================= */

const IntroOverlay = ({ onFinish }: { onFinish: () => void }) => {
  // Split into words first so wrapping happens only on whitespace.
  // Inside each word characters stagger one-by-one for a typewriter feel.
  const tokens = useMemo(() => {
    const parts = QUOTE.split(/(\s+)/);
    let charIndex = 0;
    return parts.map((part) => {
      const isSpace = /^\s+$/.test(part);
      const chars = Array.from(part).map((char) => ({ char, idx: charIndex++ }));
      return { isSpace, chars };
    });
  }, []);
  const totalChars = useMemo(
    () => tokens.reduce((acc, token) => acc + token.chars.length, 0),
    [tokens],
  );

  // Approximate timing: stagger * count + small tail after the last character.
  const quoteRevealMs = 150 + totalChars * 28 + 220;
  const authorDwellMs = 600;
  const exitMs = 520;

  useEffect(() => {
    const timeoutId = window.setTimeout(onFinish, quoteRevealMs + authorDwellMs + exitMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authorDwellMs, exitMs, onFinish, quoteRevealMs]);

  return (
    <div
      className={styles.intro}
      style={{
        animationDelay: `${quoteRevealMs + authorDwellMs}ms`,
        animationDuration: `${exitMs}ms`,
      }}
    >
      <button type="button" className={styles.introSkip} onClick={onFinish}>
        Пропустить
      </button>

      <div className={styles.introInner}>
        <p className={styles.introQuote}>
          {tokens.map((token, tokenIdx) =>
            token.isSpace ? (
              <span key={`space-${tokenIdx}`} className={styles.introSpace}>
                {token.chars.map(({ char }) => char).join("")}
              </span>
            ) : (
              <span key={`word-${tokenIdx}`} className={styles.introWord}>
                {token.chars.map(({ char, idx }) => (
                  <span
                    key={`${char}-${idx}`}
                    className={styles.introChar}
                    style={{ animationDelay: `${150 + idx * 28}ms` }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            ),
          )}
        </p>

        <div className={styles.introAuthorSlot}>
          <div className={styles.introAuthorWrap} style={{ animationDelay: `${quoteRevealMs}ms` }}>
            <span className={styles.introAuthorOrn} aria-hidden />
            <p className={styles.introAuthor}>{AUTHOR}</p>
            <span className={styles.introAuthorOrn} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
};

const TopBar = ({ session }: { session: ReturnType<typeof useSessionTarget> }) => {
  const isLoggedIn = session.ready && session.isAuthenticated && Boolean(session.href);
  const accountHref = isLoggedIn ? (session.href as string) : "/register";
  const accountLabel = isLoggedIn ? (session.label as string) : "Войти";

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarRow}>
        <Link href="/" className={styles.topBarBrand}>
          <span className={styles.topBarMark}>looney moon</span>
          <span className={styles.topBarSub}>агентство</span>
        </Link>
        <nav className={styles.topBarLinks}>
          <Link href="#manifest">О платформе</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contacts">Контакты</Link>
          <Link href={accountHref}>{accountLabel}</Link>
        </nav>
      </div>

      {/* Mobile nav row - lives inside the same sticky header */}
      <nav className={styles.mobileNav} aria-label="Мобильная навигация">
        <Link href="#manifest">О платформе</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/contacts">Контакты</Link>
        <Link href={accountHref} className={styles.mobileNavCta}>
          {accountLabel}
        </Link>
      </nav>
    </header>
  );
};

/* =========================================================
   Main landing
   ========================================================= */

export const LandingPage = () => {
  const [introVisible, setIntroVisible] = useState(true);
  // `useReducedMotion()` can be `null` on the first render. Normalise to a
  // real boolean so motion props below are stable from the very first frame.
  const reduceMotion = useReducedMotion() ?? false;

  const heroRef = useRef<HTMLElement | null>(null);
  // Track scroll progress while the hero section moves out of view.
  // start: hero top hits viewport top -> 0
  // end:   hero bottom hits viewport top -> 1
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  // Smooth the raw scroll progress with a spring so the moon glides
  // instead of tracking the wheel 1-to-1.
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 22,
    mass: 0.6,
    restDelta: 0.001,
  });

  // Moon flies up, fades, blurs and shrinks slightly as the user scrolls.
  // Eased keyframes so motion accelerates gently rather than starting hard.
  const moonY = useTransform(
    smoothProgress,
    [0, 0.25, 0.6, 1],
    reduceMotion ? [0, 0, 0, 0] : [0, -60, -260, -780],
  );
  const moonOpacity = useTransform(smoothProgress, [0, 0.5, 0.85, 1], [1, 0.85, 0.2, 0]);
  const moonScale = useTransform(
    smoothProgress,
    [0, 1],
    reduceMotion ? [1, 1] : [1, 0.7],
  );
  const moonBlur = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    reduceMotion ? ["blur(0px)", "blur(0px)", "blur(0px)"] : ["blur(0px)", "blur(2px)", "blur(8px)"],
  );

  const heroMoonEntryInitial = reduceMotion
    ? { opacity: 0 }
    : { y: "-120vh", opacity: 0, filter: "blur(8px)" };

  const heroMoonEntryAnimate = reduceMotion
    ? { opacity: 1 }
    : { y: 0, opacity: 1, filter: "blur(0px)" };

  const heroMoonEntryTransition = reduceMotion
    ? { duration: 0.4 }
    : { duration: 1.6, ease: [0.16, 0.84, 0.3, 1] as const };

  const finishIntro = useCallback(() => {
    setIntroVisible(false);
  }, []);

  const session = useSessionTarget();
  const isLoggedIn = session.ready && session.isAuthenticated && Boolean(session.href);

  const primaryCtaHref = isLoggedIn ? (session.href as string) : "/register";
  const primaryCtaLabel = isLoggedIn ? (session.label as string) : "Начать зарабатывать";
  const secondaryCtaHref = isLoggedIn ? (session.href as string) : "/blogger/login";
  const secondaryCtaLabel = isLoggedIn ? "К моему кабинету" : "Стать блогером";

  return (
    <main className={styles.page}>
      {introVisible ? <IntroOverlay key="intro" onFinish={finishIntro} /> : null}

      <TopBar session={session} />

      {/* ---------- Hero ---------- */}
      <section className={styles.hero} ref={heroRef}>
        <video
          className={styles.heroVideo}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          poster="/images/hero-poster.jpg"
        >
          <source src="/videos/hero.mp4" type="video/mp4" />
        </video>

        <div className={styles.heroOverlay} aria-hidden />
        <div className={styles.heroVignette} aria-hidden />
        <div className={styles.heroNoise} aria-hidden />

        <div className={styles.heroContent}>
          <div className={styles.heroMoonAnchor} aria-hidden>
            <motion.div
              className={styles.heroMoonStage}
              style={{ y: moonY, opacity: moonOpacity, scale: moonScale, filter: moonBlur }}
            >
              {!introVisible ? (
                <motion.div
                  key="stars"
                  className={styles.heroStarsLayer}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: reduceMotion ? 0 : 1.8,
                    delay: reduceMotion ? 0 : 0.45,
                    ease: [0.16, 0.84, 0.3, 1] as const,
                  }}
                >
                  <div className={styles.heroStars} />
                </motion.div>
              ) : null}
              {!introVisible ? (
                <motion.div
                  key="moon-entry"
                  className={styles.heroMoonEntry}
                  initial={heroMoonEntryInitial}
                  animate={heroMoonEntryAnimate}
                  transition={heroMoonEntryTransition}
                >
                  <div className={styles.heroMoonHalo} />
                  <div className={styles.heroMoon}>
                    <span className={styles.heroMoonShade} />
                    <span className={styles.heroMoonCraters} />
                  </div>
                </motion.div>
              ) : null}
            </motion.div>
          </div>

          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleAccent}>looney moon</span>
          </h1>

          <div className={styles.heroAuthorWrap}>
            <span className={styles.heroAuthorOrn} aria-hidden />
            <p className={styles.heroAuthor}>платформа где делаются деньги</p>
            <span className={styles.heroAuthorOrn} aria-hidden />
          </div>

          <div className={styles.heroActions}>
            <Link href={primaryCtaHref} className={styles.heroActionPrimary}>
              {primaryCtaLabel}
            </Link>
            <Link href={secondaryCtaHref} className={styles.heroActionGhost}>
              {secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Manifesto ---------- */}
      <section className={styles.manifesto} id="manifest">
        <div className={styles.manifestoInner}>
          <AnimatedSection>
            <p className={styles.processEyebrow}>Что вы получаете</p>
          </AnimatedSection>

          <StaggerGroup className={styles.manifestoLines}>
            {manifestoLines.map((line, idx) => (
              <StaggerItem key={idx}>
                <p className={styles.manifestoLine}>
                  <strong>{line.strong}</strong>
                  {line.soft ? <span>{` ${line.soft}`}</span> : null}
                </p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ---------- Role picker ---------- */}
      <section className={styles.rolePickerSection}>
        <AnimatedSection>
          <header className={styles.rolePickerHeader}>
            <p className={styles.rolePickerEyebrow}>Выберите роль</p>
            <h2 className={styles.rolePickerTitle}>
              Здесь два пути. <em>Оба ведут к деньгам.</em>
            </h2>
          </header>
        </AnimatedSection>

        <StaggerGroup className={styles.rolePicker}>
          <StaggerItem>
            <Link href={isLoggedIn ? (session.href as string) : "/blogger/login"} className={styles.roleCard}>
              <p className={styles.roleCardEyebrow}>Роль · Блогер</p>
              <span className={styles.roleCardScript}>Я блогер</span>
              <h3 className={styles.roleCardTitle}>Получайте интеграции и стройте сеть работников</h3>
              <p className={styles.roleCardLead}>
                Принимайте заявки, выпускайте рекламу, делитесь реферальной ссылкой. Сеть приведённых
                работников приносит вам пассивную долю с каждой их сделки.
              </p>
              <div className={styles.roleCardSpacer} />
              <span className={styles.roleCardCta}>
                {isLoggedIn ? "Открыть кабинет" : "Войти в кабинет блогера"}
              </span>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link href={isLoggedIn ? (session.href as string) : "/register"} className={styles.roleCard}>
              <p className={styles.roleCardEyebrow}>Роль · Работник</p>
              <span className={styles.roleCardScript}>Я работник</span>
              <h3 className={styles.roleCardTitle}>Находите продавцов, закрывайте сделки и зарабатывайте</h3>
              <p className={styles.roleCardLead}>
                Пишите рекламодателям маркетплейсов, согласовывайте интеграции с блогером и получайте
                свою долю автоматически - после подтверждения администратора.
              </p>
              <div className={styles.roleCardSpacer} />
              <span className={styles.roleCardCta}>
                {isLoggedIn ? "Открыть кабинет" : "Начать как работник"}
              </span>
            </Link>
          </StaggerItem>
        </StaggerGroup>
      </section>

      {/* ---------- Process ---------- */}
      <section className={styles.processSection}>
        <AnimatedSection>
          <header className={styles.processHeader}>
            <p className={styles.processEyebrow}>Как устроена платформа</p>
            <h2 className={styles.processTitle}>Каждая сделка проходит ровно четыре шага</h2>
          </header>
        </AnimatedSection>

        <StaggerGroup className={styles.processGrid}>
          {processSteps.map((step) => (
            <StaggerItem key={step.num}>
              <article className={styles.processCard}>
                <span className={styles.processNum}>{step.num}</span>
                <h3 className={styles.processCardTitle}>{step.title}</h3>
                <p className={styles.processCardText}>{step.text}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>looney moon · {new Date().getFullYear()}</span>
          <div className={styles.footerLinks}>
            <Link href="/faq">FAQ</Link>
            <Link href="/contacts">Контакты</Link>
            {isLoggedIn ? (
              <Link href={session.href as string}>{session.label}</Link>
            ) : (
              <Link href="/register">Войти через Telegram</Link>
            )}
          </div>
        </div>
      </footer>

      {/* ---------- Mobile bottom nav ---------- */}
      <nav className={styles.bottomNav} aria-label="Мобильная навигация">
        <Link href="#manifest">О платформе</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/contacts">Контакты</Link>
        {isLoggedIn ? (
          <Link href={session.href as string} className={styles.bottomNavCta}>
            {session.label}
          </Link>
        ) : (
          <Link href="/register" className={styles.bottomNavCta}>
            Войти
          </Link>
        )}
      </nav>
    </main>
  );
};
