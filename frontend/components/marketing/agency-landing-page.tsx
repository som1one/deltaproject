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

import { AgencyNav } from "@/components/marketing/agency-nav";
import { SiteFooter } from "@/components/common/site-footer";

/* =========================================================
   Moon artwork
   Inline SVG of the full Moon, near side: the maria follow the
   real arrangement (Procellarum along the west, Imbrium and
   Serenitatis up top, Crisium as the lone oval by the east limb),
   plus the Tycho ray crater to the south. Lighting is face-on
   with gentle limb darkening — a full moon, not a half-lit ball.
   ========================================================= */

const HeroMoonArt = () => (
  <svg
    className={styles.heroMoonSvg}
    viewBox="0 0 520 520"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient id="lm-base" cx="40%" cy="34%" r="72%">
        <stop offset="0%" stopColor="#efede6" />
        <stop offset="38%" stopColor="#dfdcd2" />
        <stop offset="60%" stopColor="#ccc8bb" />
        <stop offset="78%" stopColor="#b1ac9e" />
        <stop offset="90%" stopColor="#948f82" />
        <stop offset="100%" stopColor="#7b766a" />
      </radialGradient>

      {/* A whisper of shade toward the lower-right keeps the disc
         spherical without drowning half of it in darkness */}
      <radialGradient id="lm-term" cx="34%" cy="30%" r="105%">
        <stop offset="0%" stopColor="#0b0908" stopOpacity="0" />
        <stop offset="58%" stopColor="#0b0908" stopOpacity="0" />
        <stop offset="72%" stopColor="#100e0b" stopOpacity="0.1" />
        <stop offset="86%" stopColor="#0a0908" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#060505" stopOpacity="0.34" />
      </radialGradient>

      <radialGradient id="lm-sheen" cx="36%" cy="30%" r="46%">
        <stop offset="0%" stopColor="#fdfdf9" stopOpacity="0.14" />
        <stop offset="50%" stopColor="#fdfdf9" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#fdfdf9" stopOpacity="0" />
      </radialGradient>

      {/* Shared crater shading: shallow bowl, faint far rim */}
      <radialGradient id="lm-crater">
        <stop offset="0%" stopColor="#000000" stopOpacity="0.03" />
        <stop offset="52%" stopColor="#000000" stopOpacity="0.09" />
        <stop offset="70%" stopColor="#000000" stopOpacity="0.22" />
        <stop offset="80%" stopColor="#000000" stopOpacity="0.1" />
        <stop offset="86%" stopColor="#f6f5ef" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#f6f5ef" stopOpacity="0" />
      </radialGradient>

      {/* Maria coastlines: a light warp for organic edges, then soften.
         The displacement is kept small so shapes stay recognizable. */}
      <filter id="lm-maria" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="11" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="22" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="5.5" />
      </filter>

      {/* Soft halo behind the bright ray craters */}
      <filter id="lm-soft" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="6" />
      </filter>

      {/* Large-scale tonal mottling of the surface */}
      <filter id="lm-mottle" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" seed="7" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.75" intercept="0.14" />
          <feFuncG type="linear" slope="0.75" intercept="0.14" />
          <feFuncB type="linear" slope="0.75" intercept="0.14" />
          <feFuncA type="linear" slope="0" intercept="1" />
        </feComponentTransfer>
      </filter>

      {/* Fine regolith relief, lit from the top-left */}
      <filter id="lm-relief" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="3" seed="21" stitchTiles="stitch" result="noise" />
        <feDiffuseLighting in="noise" lightingColor="#ffffff" surfaceScale="1.8" diffuseConstant="0.62" result="lit">
          <feDistantLight azimuth="225" elevation="58" />
        </feDiffuseLighting>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0" intercept="1" />
        </feComponentTransfer>
      </filter>

      <clipPath id="lm-clip">
        <circle cx="260" cy="260" r="260" />
      </clipPath>
    </defs>

    <g clipPath="url(#lm-clip)" style={{ isolation: "isolate" }}>
      <circle cx="260" cy="260" r="260" fill="url(#lm-base)" />

      {/* Maria, laid out after the near side (north up). Every mare is a
         round impact basin, so the complexes are unions of overlapping
         circles: west — Imbrium into Oceanus Procellarum, Humorum,
         Nubium; east — Serenitatis into Tranquillitatis, Nectaris,
         Fecunditatis; Crisium alone by the east limb */}
      <g filter="url(#lm-maria)" fill="#5b574d" opacity="0.36" style={{ mixBlendMode: "multiply" }}>
        <circle cx="190" cy="130" r="55" />
        <circle cx="150" cy="185" r="32" />
        <circle cx="118" cy="225" r="38" />
        <circle cx="112" cy="280" r="34" />
        <circle cx="135" cy="320" r="26" />
        <circle cx="150" cy="340" r="20" />
        <circle cx="185" cy="280" r="14" />
        <circle cx="180" cy="310" r="18" />
        <circle cx="205" cy="330" r="27" />
        <circle cx="298" cy="132" r="42" />
        <circle cx="345" cy="195" r="40" />
        <circle cx="320" cy="215" r="22" />
        <circle cx="332" cy="255" r="14" />
        <circle cx="328" cy="288" r="19" />
        <circle cx="375" cy="225" r="16" />
        <circle cx="392" cy="258" r="26" />
        <ellipse cx="424" cy="148" rx="28" ry="22" transform="rotate(-15 424 148)" />
      </g>

      {/* Darker basin cores give the plains internal depth */}
      <g filter="url(#lm-maria)" fill="#5b574d" opacity="0.16" style={{ mixBlendMode: "multiply" }}>
        <circle cx="190" cy="135" r="34" />
        <circle cx="345" cy="200" r="24" />
        <circle cx="115" cy="255" r="22" />
        <circle cx="392" cy="260" r="14" />
        <ellipse cx="424" cy="148" rx="16" ry="12" transform="rotate(-15 424 148)" />
      </g>

      <rect width="520" height="520" filter="url(#lm-mottle)" opacity="0.42" style={{ mixBlendMode: "soft-light" }} />
      <rect width="520" height="520" filter="url(#lm-relief)" opacity="0.3" style={{ mixBlendMode: "soft-light" }} />

      {/* Tycho — bright collar, pit and a fan of faint rays */}
      <g>
        <circle cx="242" cy="402" r="16" fill="#f2f1ea" opacity="0.12" filter="url(#lm-soft)" />
        <g stroke="#f2f1ea" strokeWidth="2.5" strokeLinecap="round">
          <line x1="228" y1="386" x2="150" y2="296" opacity="0.055" />
          <line x1="240" y1="380" x2="226" y2="282" opacity="0.07" />
          <line x1="252" y1="384" x2="306" y2="286" opacity="0.06" />
          <line x1="258" y1="394" x2="352" y2="344" opacity="0.05" />
          <line x1="222" y1="398" x2="140" y2="378" opacity="0.05" />
          <line x1="256" y1="408" x2="322" y2="436" opacity="0.055" />
          <line x1="234" y1="412" x2="196" y2="452" opacity="0.05" />
        </g>
        <circle cx="242" cy="402" r="7" fill="url(#lm-crater)" />
        <circle cx="242" cy="402" r="2.4" fill="#efeee7" opacity="0.2" />
      </g>

      {/* Copernicus and Kepler — small ray craters in the west */}
      <g>
        <circle cx="196" cy="214" r="12" fill="#f2f1ea" opacity="0.08" filter="url(#lm-soft)" />
        <circle cx="196" cy="214" r="6.5" fill="url(#lm-crater)" />
        <circle cx="126" cy="236" r="9" fill="#f2f1ea" opacity="0.06" filter="url(#lm-soft)" />
        <circle cx="126" cy="236" r="4.5" fill="url(#lm-crater)" />
      </g>

      {/* Southern highlands — the heavily cratered band along the bottom */}
      <g>
        <circle cx="452" cy="216" r="4" fill="url(#lm-crater)" />
        <circle cx="76" cy="176" r="3.5" fill="url(#lm-crater)" />
        <circle cx="416" cy="348" r="4.5" fill="url(#lm-crater)" />
        <circle cx="330" cy="384" r="3.5" fill="url(#lm-crater)" />
        <circle cx="160" cy="392" r="5" fill="url(#lm-crater)" />
        <circle cx="190" cy="424" r="3.5" fill="url(#lm-crater)" />
        <circle cx="218" cy="448" r="4.5" fill="url(#lm-crater)" />
        <circle cx="252" cy="468" r="3" fill="url(#lm-crater)" />
        <circle cx="282" cy="442" r="5.5" fill="url(#lm-crater)" />
        <circle cx="308" cy="464" r="3.5" fill="url(#lm-crater)" />
        <circle cx="342" cy="446" r="4" fill="url(#lm-crater)" />
        <circle cx="372" cy="416" r="5" fill="url(#lm-crater)" />
        <circle cx="300" cy="416" r="3" fill="url(#lm-crater)" />
        <circle cx="146" cy="360" r="3" fill="url(#lm-crater)" />
      </g>

      {/* Face-on lighting: gentle shade to lower-right, sheen at top-left */}
      <circle cx="260" cy="260" r="260" fill="url(#lm-term)" />
      <circle cx="260" cy="260" r="260" fill="url(#lm-sheen)" style={{ mixBlendMode: "screen" }} />
    </g>
  </svg>
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
          <div className={styles.heroMoonAnchor} aria-hidden>
            <motion.div
              className={styles.heroMoonStage}
              style={{ y: moonY, opacity: moonOpacity, scale: moonScale, filter: moonBlur }}
            >
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
                    <HeroMoonArt />
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
                Платформа, которая объединяет <em>работников</em> и <em>блогеров</em> в единую экосистему.
              </h2>
            </header>
          </AnimatedSection>
          
          <StaggerGroup className={styles.aboutGrid}>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Единое окно</h3>
                <p className={styles.aboutCardText}>
                  Больше никаких таблиц, разрозненных чатов и потерянных оплат. Все этапы сделки, от первого контакта до выплаты, проходят в одном месте.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Автоматизация</h3>
                <p className={styles.aboutCardText}>
                  Система сама рассчитывает доли каждого участника (работника, блогера и реферала) и распределяет балансы автоматически после подтверждения.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className={styles.aboutCard}>
                <div className={styles.aboutCardGlow} aria-hidden />
                <h3 className={styles.aboutCardTitle}>Прозрачность</h3>
                <p className={styles.aboutCardText}>
                  Каждая сделка прозрачна и защищена. Вы всегда знаете, на каком этапе находится интеграция и когда поступят средства.
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

      <SiteFooter />
    </main>
  );
};
