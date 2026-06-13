---
name: Editorial Exchange
colors:
  surface: '#faf9f7'
  surface-dim: '#dadad8'
  surface-bright: '#faf9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f1'
  surface-container: '#efeeec'
  surface-container-high: '#e9e8e6'
  surface-container-highest: '#e3e2e0'
  on-surface: '#1a1c1b'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#4d635f'
  on-secondary: '#ffffff'
  secondary-container: '#cde5e0'
  on-secondary-container: '#516763'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1c1c'
  on-tertiary-container: '#848483'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#d0e7e3'
  secondary-fixed-dim: '#b4cbc7'
  on-secondary-fixed: '#091f1d'
  on-secondary-fixed-variant: '#364b48'
  tertiary-fixed: '#e4e2e2'
  tertiary-fixed-dim: '#c8c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474747'
  background: '#faf9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e3e2e0'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 64px
    fontWeight: '500'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 40px
    fontWeight: '500'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 64px
  section-gap: 80px
---

## Brand & Style

This design system is built on the principles of **Modern Luxury** and **Architectural Neatness**. It moves away from the frantic energy of typical ad exchanges, instead embracing a "quiet confidence" that treats advertising placements as curated editorial assets. The aesthetic is inspired by high-end boutique commerce and physical broadsheet layouts.

The target audience consists of professional creators and brand marketers who value quality over volume. The emotional response should be one of immediate trust, clarity, and sophistication. 

**Core Design Principles:**
- **Intentional Whitespace:** Margin and padding are used as active design elements to frame content, not just fill gaps.
- **Structural Weight:** Heavy focus on alignment and grid discipline to create a sense of permanence and reliability.
- **Refined Materiality:** Layers are thin and purposeful, avoiding heavy skeuomorphism in favor of subtle depth that mimics premium paper stock and gallery mounting.

## Colors

The palette is rooted in a "Warm Minimalist" spectrum. It avoids the clinical coldness of pure white (#FFFFFF) in favor of **Soft Ivory** and **Light Stone**, providing a softer, more premium reading experience.

- **Primary (#1A1A1A):** Used for primary text and high-impact UI elements. It provides the "ink" on the page.
- **Secondary / Accent (#2D423F):** A Deep Forest Green used sparingly for status indicators, "Trust" badges, and successful transaction states. It signals growth and stability.
- **Tertiary (#4A4A4A):** Graphite grey for secondary labels and metadata, ensuring hierarchy without competing with primary headings.
- **Neutrals (#F9F8F6 / #EFECE7):** These serve as the foundation. The Ivory is the global background, while the Stone is used for subtle container differentiation and hover states.

## Typography

The typography strategy employs a classic "Serif for Voice, Sans for Utility" approach.

1.  **Headlines (EB Garamond):** Used for large display moments and section headers. It provides an editorial, literary feel that elevates the advertising exchange to a "curated marketplace."
2.  **Body & UI (Hanken Grotesk):** A sharp, contemporary sans-serif used for all functional text. It offers high legibility at small sizes and a professional, tech-forward contrast to the serif headings.
3.  **Labels:** All-caps styling with slight letter-spacing is used for category headers and navigation items to maintain architectural order.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy on desktop to preserve the "printed page" feel, transitioning to a fluid model on mobile.

- **The 12-Column Grid:** Elements should align strictly to a 12-column grid. Large editorial cards usually span 4 or 6 columns, while sidebar filters occupy 3.
- **Breathing Room:** We utilize a generous 80px vertical gap between major sections to prevent visual clutter.
- **Alignment:** Consistent left-alignment is preferred for all text blocks to maintain a clean vertical axis, echoing architectural blueprints.
- **Mobile Reflow:** On mobile, the 64px desktop margins collapse to 20px, and column-spans typically expand to full width (12 columns) to maintain legibility.

## Elevation & Depth

To maintain the "quiet luxury" aesthetic, depth is created through **Tonal Layers** and **Soft Ambient Shadows** rather than high-contrast overlays.

- **Base Layer:** The Soft Ivory (#F9F8F6) background.
- **Surface Layer:** Cards and containers use the Light Stone (#EFECE7) or pure white with a very thin (0.5px) border in #1A1A1A at low opacity (10%).
- **Shadows:** We use "Shadowless Depth"—primarily using subtle color shifts to indicate elevation. When a shadow is necessary (e.g., a dropdown), use a large blur radius (24px) with very low opacity (4%) charcoal tint to mimic natural light falling on thick paper.
- **Dividers:** Use 1px solid lines in Light Stone for internal separation, ensuring they never compete with the content.

## Shapes

The shape language is "Softly Structured." We avoid the aggressive roundness of "bubbly" consumer apps in favor of precise, architectural corners.

- **Primary Radius:** 8px (0.5rem) for standard components like input fields and buttons.
- **Container Radius:** 12px (0.75rem) for cards and main content modules, providing a subtle hint of modern softness while maintaining a rectangular, stable profile.
- **Strictness:** Interactive elements never exceed a 12px radius. We avoid pill-shaped buttons to keep the design feeling grounded and professional.

## Components

### Buttons
- **Primary:** Solid #1A1A1A background with White text. Rectangular with 8px radius. High contrast is essential for the "Commerce" aspect.
- **Secondary:** Ghost style with 1px border (#1A1A1A at 20% opacity). Transitions to a solid Light Stone fill on hover.

### Cards
- **Marketplace Listings:** Use a white background, 12px radius, and a 0.5px border. The header of the card should use the serif font at a medium size. 
- **Hover State:** Cards should subtly lift using a very soft shadow and a slight increase in border opacity.

### Input Fields
- **Styling:** Minimalist design with a 1px bottom-border only, or a very light 4-sided border in Light Stone. 
- **Focus:** Transition to a #1A1A1A bottom-border. No heavy "glow" effects.

### Chips & Tags
- **Style:** Small, 4px radius, using Light Stone background with Charcoal text. Used for "Niche" categories (e.g., *Lifestyle*, *Fintech*).

### List Items
- **Marketplace Rows:** High padding (24px) with a 1px divider. Ensure clear metadata alignment (Audience Size, Price, Rating) using the Sans-Serif font.

### Progress Indicators
- **Trust Score:** Use the Deep Forest Green (#2D423F) for positive metrics and progress bars to reinforce the "Trust" narrative.