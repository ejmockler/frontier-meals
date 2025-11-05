/**
 * Frontier Meals Design System
 *
 * Inspired by Frontier Tower's raw, industrial, community-built aesthetic.
 * Design philosophy: Scrappy, work-in-progress, functional over luxury,
 * each space has its own personality.
 */

export const designSystem = {
  /**
   * Typography
   * Primary: Plus Jakarta Sans (Frontier Tower's brand font)
   * Fallback to system fonts for performance
   */
  typography: {
    sans: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    weights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
  },

  /**
   * Color Palette
   * Inspired by Frontier Tower's varied floor aesthetics:
   * - Teal and white (arts floor)
   * - Faded yellow (unfinished spaces)
   * - Orange (longevity section)
   * - Neon accents (robotics floor)
   * - Raw industrial neutrals
   */
  colors: {
    // Primary: Industrial neutrals with warmth
    background: {
      raw: '#F5F3EF',        // Warm off-white, like unfinished drywall
      concrete: '#E8E6E1',   // Concrete texture
      warmGray: '#D4D2CD',   // Industrial gray
    },

    // Accent: Bold, varied per context (like each floor having its theme)
    accent: {
      teal: '#2D9B9B',       // Arts floor teal
      orange: '#E67E50',     // Longevity orange
      yellow: '#E8C547',     // Faded yellow (unfinished)
      neon: '#00F5FF',       // Robotics neon
    },

    // Semantic: Functional, not polished
    semantic: {
      success: '#52A675',    // Muted green, not bright
      warning: '#D97F3E',    // Earthy orange
      error: '#C85454',      // Muted red
      info: '#5B8FA8',       // Industrial blue
    },

    // Text: High contrast for functionality
    text: {
      primary: '#1A1816',    // Almost black, warm undertone
      secondary: '#5C5A56',  // Medium gray
      tertiary: '#8E8C87',   // Light gray
      inverse: '#FFFFFF',    // Pure white
    },

    // Borders: Subtle, raw
    border: {
      light: '#D9D7D2',
      medium: '#B8B6B1',
      heavy: '#78766F',
    },
  },

  /**
   * Spacing
   * Functional grid, not overly precious
   */
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
    '4xl': '6rem',   // 96px
    '5xl': '8rem',   // 128px
  },

  /**
   * Border Radius
   * Minimal rounding - more industrial/raw than polished
   */
  radius: {
    none: '0',
    sm: '0.125rem',  // 2px - barely rounded
    md: '0.25rem',   // 4px - subtle
    lg: '0.5rem',    // 8px - moderate
    xl: '0.75rem',   // 12px - max we go
    full: '9999px',  // Pills/circles
  },

  /**
   * Shadows
   * Subtle, grounded - not floating/polished
   */
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(26, 24, 22, 0.05)',
    md: '0 2px 4px -1px rgba(26, 24, 22, 0.1)',
    lg: '0 4px 6px -2px rgba(26, 24, 22, 0.15)',
    xl: '0 8px 12px -4px rgba(26, 24, 22, 0.2)',
  },

  /**
   * Design Principles
   *
   * 1. SCRAPPY OVER POLISHED
   *    - Embrace work-in-progress aesthetic
   *    - Show the raw edges
   *    - Functionality > perfection
   *
   * 2. BOLD OVER SAFE
   *    - Use color confidently
   *    - Each context gets its personality
   *    - Don't default to neutrals
   *
   * 3. INDUSTRIAL OVER CORPORATE
   *    - Materials reference: wood, concrete, metal
   *    - Minimal gloss/shine
   *    - High contrast, clear hierarchy
   *
   * 4. COMMUNITY-BUILT FEEL
   *    - Approachable, not intimidating
   *    - Handcrafted touches
   *    - Transitional, evolving
   *
   * 5. FRONTIER SPIRIT
   *    - Experimental
   *    - Ambitious
   *    - Unafraid of imperfection
   */
} as const;

/**
 * Component-specific design tokens
 */
export const components = {
  kiosk: {
    // Kiosk gets the orange/yellow palette (meal context = longevity/nourishment)
    primary: designSystem.colors.accent.orange,
    secondary: designSystem.colors.accent.yellow,
    success: designSystem.colors.semantic.success,
    error: designSystem.colors.semantic.error,
    background: designSystem.colors.background.raw,
  },

  admin: {
    // Admin gets teal (arts floor = creative work)
    primary: designSystem.colors.accent.teal,
    secondary: designSystem.colors.accent.neon,
    background: designSystem.colors.background.concrete,
  },

  landing: {
    // Landing gets varied palette (representing the whole tower)
    primary: designSystem.colors.accent.teal,
    secondary: designSystem.colors.accent.orange,
    background: designSystem.colors.background.raw,
  },
} as const;
