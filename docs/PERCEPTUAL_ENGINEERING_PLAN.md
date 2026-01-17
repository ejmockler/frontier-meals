# Perceptual Engineering Plan: Frontier Meals Landing Page

> Designing the computational substrate where the interface IS the perceptual experience of understanding, desiring, and joining Frontier Meals.

---

## 1. GROUND: Human State Analysis

### Who Arrives Here?

**Primary Persona: The Frontier Tower Inhabitant**
- Works in the building (AI researcher, biotech founder, crypto dev, artist)
- Time-starved, optimizing for focus and flow
- Values community but doesn't want forced socialization
- Skeptical of corporate polish; drawn to authentic, scrappy energy
- Already pays ~$200-2800/month for workspace; $400/month for daily lunch is reasonable

**Secondary Persona: The Curious Outsider**
- Heard about Frontier Tower's unique ecosystem
- Evaluating whether to join the building/community
- Meal service is a signal of community health

### Cognitive State at Arrival

**Question Stack (in order of urgency):**
1. "What is this?" (0-2 seconds) → Identity recognition
2. "Is this for me?" (2-5 seconds) → Relevance assessment
3. "How does it work?" (5-15 seconds) → Mental model building
4. "What's the catch?" (15-30 seconds) → Risk assessment
5. "How do I start?" (30+ seconds) → Action readiness

**Resource Availability:**
- Attention: Split (likely tabbed browser, Slack pinging)
- Working memory: 3-4 chunks available
- Motivation: Medium (curious but not desperate)
- Time pressure: High (evaluating quickly)

**Emotional State:**
- Slight skepticism (another subscription service?)
- Latent desire for community connection
- Decision fatigue around daily lunch choices
- Hope that this solves a real friction point

### Temporal Context

This is an **evaluation task**, not a flow-state task:
- Scanning, not reading deeply
- Seeking signals, not absorbing content
- Building trust through accumulated micro-validations
- Ready to bounce at first friction point

---

## 2. MAP: Perceptual Primitives Required

### Visual Processing Sequence

```
0-100ms:    Figure-ground separation → "This is a page about food/community"
100-300ms:  Hierarchy parsing → "The main thing is [X], secondary is [Y]"
300-1000ms: Category assignment → "This is a subscription meal service"
1-3s:       Value proposition grasp → "Daily lunch, community, flexible"
3-10s:      Mental model formation → "Subscribe → Telegram → QR → Eat"
10-30s:     Risk/benefit calculation → "Worth $400? What if I skip?"
```

### Attentional Requirements

| Phase | Attention Type | Duration | Interface Need |
|-------|---------------|----------|----------------|
| Hook | Peripheral → Focal | <2s | Hero with strong focal point |
| Interest | Sustained focal | 5-10s | Clear hierarchy, scannable |
| Understanding | Divided (scan) | 10-20s | Chunked sections, visual anchors |
| Decision | Focused deliberation | 30s+ | All info visible, no hunting |

### Memory Architecture

**What users should remember after leaving:**
- "Frontier Meals = daily lunch at Frontier Tower"
- "Manage via Telegram, skip anytime"
- "QR code pickup at noon"
- "75% refund if you cancel in time"

**Spatial memory opportunity:**
- Page layout should be memorable as a "place"
- If they return, they should know where things are
- Sections should have distinct visual identities

### Predictive Processing Alignment

Users predict based on genre conventions (SaaS landing pages):
- Hero → Features → How it works → Social proof → CTA
- **Match this structure** to minimize prediction error
- **Differentiate through visual language** not structure

---

## 3. DESIGN: Computational Substrate

### Information Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  HERO: Identity + Value Proposition + Primary CTA           │
│  ├─ "What is this?" answered in <2 seconds                  │
│  ├─ Community imagery (warmth, authenticity)                │
│  └─ Single clear action (Subscribe)                         │
├─────────────────────────────────────────────────────────────┤
│  COMMUNITY: Emotional resonance + Social proof              │
│  ├─ Real photos of real people                              │
│  ├─ "More than lunch" messaging                             │
│  └─ Gallery with hover interactions (engagement signal)     │
├─────────────────────────────────────────────────────────────┤
│  HOW IT WORKS: Mental model construction                    │
│  ├─ 3 steps (fits working memory)                           │
│  ├─ Icons + text (dual coding)                              │
│  └─ Linear progression (causality clear)                    │
├─────────────────────────────────────────────────────────────┤
│  FLEXIBILITY: Risk mitigation + Differentiators             │
│  ├─ Dietary preferences (personalization signal)            │
│  ├─ 75% reimbursement (key promise, high salience)          │
│  └─ Telegram management (modern, low friction)              │
├─────────────────────────────────────────────────────────────┤
│  FOOD: Sensory appeal + Quality signal                      │
│  ├─ Food imagery (appetite trigger)                         │
│  ├─ Variety messaging                                       │
│  └─ Generous portions (value signal)                        │
├─────────────────────────────────────────────────────────────┤
│  BENEFITS: Rational justification                           │
│  ├─ 6 benefits in grid (scannable)                          │
│  ├─ Icons as visual anchors                                 │
│  └─ Short copy (recognition over recall)                    │
├─────────────────────────────────────────────────────────────┤
│  SOCIAL PROOF: Trust + Belonging signal                     │
│  ├─ Large community gathering image                         │
│  └─ "Loved by" framing                                      │
├─────────────────────────────────────────────────────────────┤
│  FINAL CTA: Decision capture                                │
│  ├─ Restate value proposition                               │
│  ├─ Primary + secondary CTAs                                │
│  └─ Exclusivity note (scarcity/belonging)                   │
└─────────────────────────────────────────────────────────────┘
```

### Visual Hierarchy System

**Level 1 - Page Landmarks (Peripheral recognition)**
- Section headings: 2.5-3rem, bold, high contrast
- Hero image: Dominant visual mass
- CTAs: Color accent (orange), consistent placement

**Level 2 - Section Content (Focal engagement)**
- Subheadings: 1.25-1.5rem, medium weight
- Feature cards: Bordered containers with icons
- Images: Supporting, not competing with text

**Level 3 - Details (Active reading)**
- Body text: 1rem, comfortable line height
- Captions: 0.875rem, muted color
- Micro-copy: 0.75rem, very muted

### Color System (Perceptual Roles)

```css
/* Semantic color mapping to perceptual function */

/* Attention capture - Primary actions, key info */
--attract: #E67E50;        /* Frontier orange - warm, energetic */

/* Value signal - Secondary benefits, highlights */
--value: #E8C547;          /* Frontier yellow - optimistic, premium */

/* Trust/stability - Backgrounds, neutral areas */
--ground: #F5F3EF;         /* Warm off-white - approachable, not sterile */

/* Community/growth - Success states, positive outcomes */
--community: #52A675;      /* Muted green - natural, healthy */

/* Information hierarchy */
--text-primary: #1A1816;   /* Near black - maximum readability */
--text-secondary: #5C5A56; /* Medium gray - supporting content */
--text-tertiary: #8E8C87;  /* Light gray - captions, fine print */
```

### Timing System (Perceptual Rhythm)

```typescript
// Single tempo for entire page
const RHYTHM = {
  // Micro-interactions
  INSTANT: 0,           // Direct state changes (checkbox, toggle)
  SNAP: 100,            // Hover states, focus rings
  QUICK: 150,           // Button presses, small reveals

  // Transitions
  STANDARD: 300,        // Section transitions, modals
  DELIBERATE: 500,      // Page-level animations, hero entrance

  // Thresholds
  LOADING_SHOW: 200,    // Delay before showing spinner
  LOADING_HIDE: 300,    // Minimum spinner display time
} as const;

// Easing functions - all physics-based
const EASE = {
  OUT: 'cubic-bezier(0.33, 1, 0.68, 1)',      // Deceleration (default)
  IN_OUT: 'cubic-bezier(0.65, 0, 0.35, 1)',   // Smooth transitions
  SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Playful bounce
} as const;
```

### Typography Scale (Modular)

```css
/* Base: 16px, Scale: 1.25 (major third) */
--text-xs: 0.64rem;    /* 10.24px - fine print */
--text-sm: 0.8rem;     /* 12.8px - captions */
--text-base: 1rem;     /* 16px - body */
--text-lg: 1.25rem;    /* 20px - lead text */
--text-xl: 1.563rem;   /* 25px - section subheads */
--text-2xl: 1.953rem;  /* 31.25px - section heads */
--text-3xl: 2.441rem;  /* 39px - hero subhead */
--text-4xl: 3.052rem;  /* 48.8px - hero headline */
--text-5xl: 3.815rem;  /* 61px - display */
```

### Spacing Scale (8px base)

```css
--space-1: 0.25rem;   /* 4px - tight inline */
--space-2: 0.5rem;    /* 8px - base unit */
--space-3: 0.75rem;   /* 12px - compact */
--space-4: 1rem;      /* 16px - standard */
--space-6: 1.5rem;    /* 24px - comfortable */
--space-8: 2rem;      /* 32px - section padding */
--space-12: 3rem;     /* 48px - section gaps */
--space-16: 4rem;     /* 64px - major section breaks */
--space-24: 6rem;     /* 96px - hero padding */
```

---

## 4. COMPONENT ARCHITECTURE

### Wave 1: Foundation Layer

**Design Tokens** (`src/lib/styles/tokens.css`)
- Complete color system with semantic naming
- Typography scale
- Spacing scale
- Timing constants
- Easing functions

**Base Components:**
- `Section.svelte` - Consistent section wrapper with spacing/backgrounds
- `Container.svelte` - Max-width container with responsive padding
- `Heading.svelte` - Typography component with level prop
- `Text.svelte` - Body text with size/color variants
- `Icon.svelte` - Lucide icon wrapper with consistent sizing

### Wave 2: Section Components

**HeroSection.svelte**
- Split layout (content left, image right on desktop)
- Staggered entrance animation
- Primary CTA (Subscribe) + Secondary CTA (Learn More → scroll)
- Responsive: Stack on mobile, image-first

**CommunityGallery.svelte**
- 3-image grid with hover scale effect
- Lazy loading with blur-up placeholder
- Captions on hover (optional)

**HowItWorks.svelte**
- 3-step horizontal flow (vertical on mobile)
- Numbered icons with connecting line/progression
- Each step: Icon + Title + Description

**FlexibilityFeatures.svelte**
- 2-column feature cards
- Icon + Title + Description format
- Highlight the 75% reimbursement prominently

**FoodShowcase.svelte**
- Image gallery with food photos
- 3 benefit cards (Variety, Dietary, Portions)
- Visual emphasis on food quality

**BenefitsGrid.svelte**
- 6-item grid (3x2 on desktop, 2x3 on tablet, 1x6 on mobile)
- Icon + Title + Short description
- Consistent card styling

**SocialProof.svelte**
- Large community image
- "Loved by" headline
- Optional testimonial quotes (future)

**FinalCTA.svelte**
- Centered layout
- Headline + Subhead + CTAs
- Exclusivity note
- Background differentiation (subtle color shift)

### Wave 3: Integration Layer

**Page Assembly** (`src/routes/+page.svelte`)
- Import and compose all sections
- Connect Subscribe button to Stripe checkout
- Add scroll-to-section for Learn More
- Implement intersection observer for scroll animations

**Data Integration:**
- Pricing from config/environment
- Images from static assets or Cloudflare
- Copy from constants file (easy updates)

### Wave 4: Polish Layer

**Entrance Animations:**
- Hero: Fade-in with slight upward motion
- Sections: Fade-in on scroll (intersection observer)
- Stagger children within sections

**Micro-interactions:**
- Button hover/active states
- Image hover effects
- Card hover elevation

**Performance:**
- Image optimization (WebP, srcset)
- Font loading strategy (display: swap)
- Critical CSS extraction

**Accessibility:**
- Focus states
- Reduced motion support
- Semantic HTML
- ARIA labels where needed

---

## 5. IMPLEMENTATION SPECIFICATIONS

### File Structure

```
src/
├── lib/
│   ├── styles/
│   │   ├── tokens.css          # Design tokens
│   │   └── animations.css      # Keyframe animations
│   ├── components/
│   │   ├── ui/                 # Existing (Button, Card)
│   │   └── landing/            # New landing page components
│   │       ├── Section.svelte
│   │       ├── Container.svelte
│   │       ├── HeroSection.svelte
│   │       ├── CommunityGallery.svelte
│   │       ├── HowItWorks.svelte
│   │       ├── FlexibilityFeatures.svelte
│   │       ├── FoodShowcase.svelte
│   │       ├── BenefitsGrid.svelte
│   │       ├── SocialProof.svelte
│   │       └── FinalCTA.svelte
│   └── data/
│       └── landing-content.ts  # All copy/content
├── routes/
│   └── +page.svelte            # Main landing page
└── static/
    └── images/
        └── landing/            # Optimized landing images
```

### Critical Copy (Preserved from Original)

```typescript
// src/lib/data/landing-content.ts

export const LANDING_CONTENT = {
  hero: {
    headline: 'Frontier Meals',
    subhead: 'Healthy lunches delivered daily to Frontier Tower. Subscribe once, show up at noon, and enjoy community dining or grab and go.',
    primaryCta: 'Start Your Subscription',
    secondaryCta: 'Learn More',
  },

  community: {
    headline: 'Join Our Community',
    subhead: "More than just lunch—it's about connecting with your colleagues",
  },

  howItWorks: {
    headline: 'How It Works',
    subhead: 'Three simple steps to never worry about lunch again',
    steps: [
      {
        number: 1,
        title: 'Subscribe on Stripe',
        description: 'Sign up for a monthly subscription. Unlimited weekday lunches with one simple payment.',
        icon: 'CreditCard',
      },
      {
        number: 2,
        title: 'Manage on Telegram',
        description: 'Set your dietary preferences and cancel specific meals if needed—all through Telegram.',
        icon: 'MessageCircle',
      },
      {
        number: 3,
        title: 'Get Your QR Code',
        description: 'Receive your unique QR code via email at noon. Scan, pick up, and enjoy your meal.',
        icon: 'QrCode',
      },
    ],
  },

  flexibility: {
    dietary: {
      title: 'Dietary Preferences',
      description: 'Choose from: I eat anything, Vegetarian, Vegan, or Pescatarian. Let us know about any food allergies and we\'ll accommodate your needs.',
      icon: 'Leaf',
    },
    cancellation: {
      title: 'Flexible Cancellation',
      description: 'Can\'t make it? Cancel by Friday 9am PST before the meal and receive a 75% reimbursement for that day.',
      icon: 'CalendarX',
      highlight: true, // Visual emphasis
    },
  },

  food: {
    headline: 'Fresh, Healthy, Delicious',
    subhead: 'Every meal is carefully prepared with fresh ingredients and balanced nutrition in mind. From hearty mains to fresh salads and sides, there\'s something for everyone.',
    features: [
      { title: 'Variety Every Day', description: 'Different menu options to keep things interesting', icon: 'Utensils' },
      { title: 'Dietary Accommodations', description: 'Options for various dietary preferences and needs', icon: 'Heart' },
      { title: 'Generous Portions', description: 'Satisfying meals that keep you energized all afternoon', icon: 'Package' },
    ],
  },

  benefits: {
    headline: 'Why Frontier Meals?',
    items: [
      { title: 'Healthy & Fresh', description: 'Nutritious meals prepared daily with quality ingredients', icon: 'Sparkles' },
      { title: 'Save Time', description: 'No more lunch planning or waiting in lines', icon: 'Clock' },
      { title: 'Build Community', description: 'Connect with colleagues over shared meals', icon: 'Users' },
      { title: 'Flexible Options', description: 'Dine in with the community or grab and go', icon: 'ArrowLeftRight' },
      { title: 'Weekday Service', description: 'Available every weekday, excluding holidays', icon: 'Calendar' },
      { title: 'Simple Pickup', description: 'Just scan your QR code and you\'re all set', icon: 'ScanLine' },
    ],
  },

  socialProof: {
    headline: 'Loved by the Frontier Tower Community',
  },

  finalCta: {
    headline: 'Ready to simplify your lunch routine?',
    subhead: 'Join Frontier Meals today and never think about lunch again. Healthy meals, great community, zero hassle.',
    primaryCta: 'Subscribe Now',
    secondaryCta: 'Contact Us',
    exclusivityNote: 'Available exclusively at Frontier Tower',
  },

  pricing: {
    monthly: 400,
    daily: 13.33,
    currency: 'USD',
  },

  contact: {
    telegram: '@noahchonlee',
    telegramUrl: 'https://t.me/noahchonlee',
  },

  footer: {
    copyright: '© 2025 Frontier Meals. Serving Frontier Tower weekdays at noon.',
  },
} as const;
```

### Image Assets

```typescript
// src/lib/data/landing-images.ts

export const LANDING_IMAGES = {
  hero: {
    src: '/images/landing/hero-community-lunch.jpg',
    alt: 'Community lunch at Frontier Tower',
    width: 721,
    height: 1280,
  },
  community: [
    {
      src: '/images/landing/rooftop-celebration.jpg',
      alt: 'Rooftop lunch celebration',
      width: 1280,
      height: 721,
    },
    {
      src: '/images/landing/happy-participants.jpg',
      alt: 'Happy lunch participants',
      width: 1280,
      height: 721,
    },
    {
      src: '/images/landing/community-dining.jpg',
      alt: 'Community dining together',
      width: 721,
      height: 1280,
    },
  ],
  food: [
    {
      src: '/images/landing/buffet-spread.jpg',
      alt: 'Fresh buffet spread',
    },
    {
      src: '/images/landing/serving-meals.jpg',
      alt: 'Serving delicious meals',
    },
  ],
  socialProof: {
    src: '/images/landing/large-gathering.jpg',
    alt: 'Large community gathering',
    width: 1280,
    height: 960,
  },
} as const;
```

---

## 6. VALIDATION CRITERIA

### Cognitive Load Checklist
- [ ] User grasps value proposition in <5 seconds
- [ ] Mental model (Subscribe → Telegram → QR) clear without re-reading
- [ ] 75% reimbursement promise is unmissable
- [ ] No hidden information required for decision
- [ ] Working memory never exceeds 4 chunks

### Perceptual Fidelity Checklist
- [ ] Visual hierarchy matches information priority
- [ ] All timing uses consistent RHYTHM constants
- [ ] Animations use physics-based easing (ease-out default)
- [ ] Color usage is semantic, not decorative
- [ ] Space between elements encodes relationships

### Beauty Checklist
- [ ] Eye lands and knows where to go in <200ms
- [ ] Proportions derive from modular scale
- [ ] No visual noise (every element earns its place)
- [ ] Feels like Frontier Tower aesthetic (scrappy, bold, warm)
- [ ] Interface disappears; user sees content, not chrome

### Technical Checklist
- [ ] Lighthouse performance >90
- [ ] Core Web Vitals pass
- [ ] Works without JavaScript (basic content)
- [ ] Accessible (WCAG AA)
- [ ] Mobile-first responsive

---

## 7. DELEGATION STRATEGY

### Wave 1: Foundation (2 agents in parallel)

**Agent 1A: Design Tokens & Base Styles**
- Create `src/lib/styles/tokens.css` with complete token system
- Update `src/app.css` to import tokens
- Add animation keyframes in `src/lib/styles/animations.css`

**Agent 1B: Base Components**
- Create `Section.svelte`, `Container.svelte`
- Create `Heading.svelte`, `Text.svelte` typography components
- Ensure components use design tokens

### Wave 2: Section Components (3 agents in parallel)

**Agent 2A: Hero + Community**
- `HeroSection.svelte` with split layout
- `CommunityGallery.svelte` with hover effects
- Responsive behavior

**Agent 2B: How It Works + Flexibility**
- `HowItWorks.svelte` with 3-step flow
- `FlexibilityFeatures.svelte` with 75% highlight
- Icons integration

**Agent 2C: Food + Benefits + Social Proof**
- `FoodShowcase.svelte` with image gallery
- `BenefitsGrid.svelte` with 6-item grid
- `SocialProof.svelte` with large image

### Wave 3: Integration (1 agent)

**Agent 3A: Page Assembly**
- Rewrite `src/routes/+page.svelte` using all components
- Wire up Stripe checkout to primary CTAs
- Add smooth scroll for "Learn More"
- Create `src/lib/data/landing-content.ts`
- Move images to `static/images/landing/`

### Wave 4: Polish (2 agents in parallel)

**Agent 4A: Animations & Interactions**
- Entrance animations with intersection observer
- Hover/active states refinement
- Reduced motion support

**Agent 4B: Performance & Accessibility**
- Image optimization
- Focus management
- ARIA labels
- Lighthouse audit fixes

---

## 8. CONTEXT ENGINEERING FOR AGENTS

Each agent receives:

1. **This document** (full perceptual engineering context)
2. **LANDING_PAGE_SPEC.md** (original site analysis)
3. **Relevant existing files** (app.css, button.svelte, etc.)
4. **Specific task scope** with explicit deliverables
5. **Validation criteria** for their specific work

**Critical context points for all agents:**
- Frontier Tower aesthetic: scrappy > polished, bold > safe
- Timing constants must use RHYTHM system
- Colors must be semantic (--attract, --value, --ground)
- 75% reimbursement is THE key differentiator
- Real community photos are the authenticity signal
- Interface should feel like "a space to think inside"
