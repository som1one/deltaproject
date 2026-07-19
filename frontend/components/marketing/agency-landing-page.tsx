"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { useSessionTarget } from "@/lib/use-session-target";
import styles from "@/components/marketing/landing.module.css";

const QUOTE = "«Великое рождается из тишины, а не из шума».";
const AUTHOR = "Томас Карлейль";



const processSteps: { num: string; title: string; text: string }[] = [
  {
    num: "01",
    title: "Получите ссылку",
    text: "Зарегистрируйтесь через Telegram — в кабинете уже ждут персональная реферальная ссылка и готовые скрипты сообщений.",
  },
  {
    num: "02",
    title: "Пригласите заказчика",
    text: "Находите тех, кому нужна реклама у блогеров, пишите по скриптам и отправляйте ссылку. Заказчик привязывается к вам навсегда.",
  },
  {
    num: "03",
    title: "Заказчик покупает рекламу",
    text: "Он выбирает блогера в каталоге маркетплейса и оплачивает заказ через площадку. Деньги держатся в эскроу до выполнения.",
  },
  {
    num: "04",
    title: "Комиссия на балансе",
    text: "После завершения заказа система начисляет ваш процент автоматически. Выводите на карту в любой момент.",
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

import { AgencyNav } from "@/components/marketing/agency-nav";
import { SiteFooter } from "@/components/common/site-footer";

/* =========================================================
   Money stack artwork
   CSS-3D banded stack of real US $100 bills: the top face and
   the loose bills use the public-domain series-2009 obverse
   scan (Wikimedia Commons), wrapped by a mustard $10,000 strap
   over paper-edge sides. The stack slowly spins on its axis.
   ========================================================= */

const BillArt = () => (
  <img
    className={styles.moneyBillArt}
    src="/images/usd-100-front.jpg"
    alt=""
    aria-hidden="true"
    draggable={false}
  />
);

const HeroMoneyStack = () => (
  <div className={styles.moneyScene}>
    <div className={styles.moneyFloat}>
      <div className={styles.moneyStack}>
        {/* Cuboid: top bill, bottom sheet, four paper edges */}
        <div className={`${styles.moneyFace} ${styles.moneyTop}`}>
          <BillArt />
        </div>
        <div className={`${styles.moneyFace} ${styles.moneyBottom}`} />
        <div className={`${styles.moneyFace} ${styles.moneyEdgeFront}`} />
        <div className={`${styles.moneyFace} ${styles.moneyEdgeBack}`} />
        <div className={`${styles.moneyFace} ${styles.moneyEdgeLeft}`} />
        <div className={`${styles.moneyFace} ${styles.moneyEdgeRight}`} />

        {/* Currency strap wrapping the middle of the stack */}
        <div className={`${styles.moneyBand} ${styles.moneyBandTop}`}>
          <span className={styles.moneyBandSign}>$10,000</span>
        </div>
        <div className={`${styles.moneyBand} ${styles.moneyBandBottom}`} />
        <div className={`${styles.moneyBand} ${styles.moneyBandFront}`} />
        <div className={`${styles.moneyBand} ${styles.moneyBandBack}`} />

        {/* Two loose bills tucked under the strap */}
        <div className={`${styles.moneyLoose} ${styles.moneyLoose1}`}>
          <BillArt />
        </div>
        <div className={`${styles.moneyLoose} ${styles.moneyLoose2}`}>
          <BillArt />
        </div>
      </div>
    </div>
  </div>
);

/* =========================================================
   Main landing
   ========================================================= */

export const AgencyLandingPage = () => {
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

  // Smooth the raw scroll progress with a spring so the money stack glides
  // instead of tracking the wheel 1-to-1.
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 22,
    mass: 0.6,
    restDelta: 0.001,
  });

  // The stack flies up, fades, blurs and shrinks slightly as the user scrolls.
  // Eased keyframes so motion accelerates gently rather than starting hard.
  const packY = useTransform(
    smoothProgress,
    [0, 0.25, 0.6, 1],
    reduceMotion ? [0, 0, 0, 0] : [0, -60, -260, -780],
  );
  const packOpacity = useTransform(smoothProgress, [0, 0.5, 0.85, 1], [1, 0.85, 0.2, 0]);
  const packScale = useTransform(
    smoothProgress,
    [0, 1],
    reduceMotion ? [1, 1] : [1, 0.7],
  );
  const packBlur = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    reduceMotion ? ["blur(0px)", "blur(0px)", "blur(0px)"] : ["blur(0px)", "blur(2px)", "blur(8px)"],
  );

  const heroPackEntryInitial = reduceMotion
    ? { opacity: 0 }
    : { y: "-120vh", opacity: 0, filter: "blur(8px)" };

  const heroPackEntryAnimate = reduceMotion
    ? { opacity: 1 }
    : { y: 0, opacity: 1, filter: "blur(0px)" };

  const heroPackEntryTransition = reduceMotion
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

      <AgencyNav />

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

        {/* Stars layer — full-screen, behind content but above overlays */}
        {!introVisible ? (
          <motion.div
            key="stars-fullscreen"
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
            <div className={styles.heroStars2} />
            <div className={styles.shootingStarsLayer}>
              <div className={`${styles.shootingStar} ${styles.shootingStar1}`} />
              <div className={`${styles.shootingStar} ${styles.shootingStar2}`} />
              <div className={`${styles.shootingStar} ${styles.shootingStar3}`} />
              <div className={`${styles.shootingStar} ${styles.shootingStar4}`} />
              <div className={`${styles.shootingStar} ${styles.shootingStar5}`} />
            </div>
          </motion.div>
        ) : null}

        <div className={styles.heroContent}>
          <div className={styles.heroMoneyAnchor} aria-hidden>
            <motion.div
              className={styles.heroMoneyStage}
              style={{ y: packY, opacity: packOpacity, scale: packScale, filter: packBlur }}
            >
              {!introVisible ? (
                <motion.div
                  key="money-entry"
                  className={styles.heroMoneyEntry}
                  initial={heroPackEntryInitial}
                  animate={heroPackEntryAnimate}
                  transition={heroPackEntryTransition}
                >
                  <div className={styles.heroMoneyHalo} />
                  <HeroMoneyStack />
                </motion.div>
              ) : null}
            </motion.div>
          </div>

          <h1 className={styles.heroTitle} aria-label="moneymaxxxing">
            {/* SVG text stretched to a fixed textLength scales with the
               container, so the wordmark can never overflow the viewport. */}
            <svg
              className={styles.heroTitleSvg}
              viewBox="0 0 600 148"
              aria-hidden="true"
              focusable="false"
            >
              <text
                x="300"
                y="102"
                textAnchor="middle"
                textLength="576"
                lengthAdjust="spacingAndGlyphs"
              >
                moneymaxxxing
              </text>
            </svg>
          </h1>

          <div className={styles.heroAuthorWrap}>
            <span className={styles.heroAuthorOrn} aria-hidden />
            <p className={styles.heroAuthor}>сообщество по ворку</p>
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

      {/* ---------- What is it ---------- */}
      <section className={styles.aboutPlatform} id="about">
        <div className={styles.aboutPlatformInner}>
          <AnimatedSection>
            <header className={styles.aboutHeader}>
              <p className={styles.aboutEyebrow}>Что это</p>
              <h2 className={styles.aboutTitle}>
                Сообщество, где быстро находят деньги в интернете — без вложений и опыта.
              </h2>
            </header>
          </AnimatedSection>
          
          <StaggerGroup className={styles.aboutGrid}>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Быстрый старт</h3>
                <p className={styles.aboutCardText}>
                  Никаких вложений и собеседований. Регистрация через Telegram занимает минуту — персональная ссылка и готовые скрипты сообщений сразу в кабинете.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Автоматизация</h3>
                <p className={styles.aboutCardText}>
                  Приведённый заказчик привязывается к вам навсегда. Процент с каждого его оплаченного заказа система начисляет на баланс сама — без переговоров о долях.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Прозрачность</h3>
                <p className={styles.aboutCardText}>
                  Оплата заказов проходит через площадку и держится в эскроу. Баланс, история операций и статус каждой выплаты — всегда перед глазами в кабинете.
                </p>
              </div>
            </StaggerItem>
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
              <h3 className={styles.roleCardTitle}>Получайте заказы на интеграции с оплатой через эскроу</h3>
              <p className={styles.roleCardLead}>
                Ваш профиль — в каталоге маркетплейса, заказчики приходят сами. Согласовывайте детали
                во встроенном чате, деньги приходят на баланс после выполнения — без переписок о предоплате.
              </p>
              <div className={styles.roleCardSpacer} />
              <span className={styles.roleCardCta}>
                {isLoggedIn ? "Открыть кабинет" : "Войти в кабинет блогера"}
              </span>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link href={isLoggedIn ? (session.href as string) : "/register"} className={styles.roleCard}>
              <p className={styles.roleCardEyebrow}>Роль · Воркер</p>
              <span className={styles.roleCardScript}>Я воркер</span>
              <h3 className={styles.roleCardTitle}>Приводите заказчиков и зарабатывайте на каждом их заказе</h3>
              <p className={styles.roleCardLead}>
                Делитесь реферальной ссылкой по готовым скриптам. Заказчик привязывается к вам
                навсегда — комиссия с каждого его заказа начисляется автоматически.
              </p>
              <div className={styles.roleCardSpacer} />
              <span className={styles.roleCardCta}>
                {isLoggedIn ? "Открыть кабинет" : "Начать как воркер"}
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
            <h2 className={styles.processTitle}>От регистрации до выплаты — четыре шага</h2>
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

      <SiteFooter />
    </main>
  );
};
