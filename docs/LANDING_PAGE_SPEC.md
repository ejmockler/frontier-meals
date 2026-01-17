# Frontier Meals Landing Page Specification

> Comprehensive documentation for leveling up the Frontier Meals landing page, carrying over the best elements from the existing frontiermeals.com site while integrating with the Frontier Tower ecosystem.

---

## Table of Contents

1. [Current Website Analysis](#current-website-analysis)
2. [Image Assets](#image-assets)
3. [Copy & Messaging](#copy--messaging)
4. [Key Promises & Features](#key-promises--features)
5. [Page Structure](#page-structure)
6. [Frontier Tower Context](#frontier-tower-context)
7. [Existing Codebase State](#existing-codebase-state)
8. [Recommendations for Elevation](#recommendations-for-elevation)

---

## Current Website Analysis

**Live URL:** https://www.frontiermeals.com/
**Title:** Frontier Meals - Healthy Lunch Subscription at Frontier Tower
**Tech Stack:** Next.js (deployed on Vercel with Cloudflare)

### Overall Vibe
- Clean, modern, community-focused
- Emphasis on connection and convenience
- Purple/lavender accent colors with white backgrounds
- Warm photography featuring real community members
- Aspirational but approachable tone

---

## Image Assets

### Primary Images (Vercel Blob Storage)

| Image | URL | Alt Text | Dimensions |
|-------|-----|----------|------------|
| Hero Image | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200662-HQFfRd2Z4gPG3ljmEXUyUjE0nloFcf.jpg` | Community lunch at Frontier Tower | 721x1280 (portrait) |
| Rooftop Celebration | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200669-3OJsxxylnIzoiAMD77cSkKTswFhtqJ.jpg` | Rooftop lunch celebration | 1280x721 (landscape) |
| Happy Participants | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200666-DyxleDlwvQzpN9OayA4YU6t7Wzwy3N.jpg` | Happy lunch participants | 1280x721 (landscape) |
| Community Dining | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200667-RZSaHGNEe6SjXw5E26xLapbul5Eba1.jpg` | Community dining together | 721x1280 (portrait) |
| Buffet Spread | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200663-KZyruamr2U9AOVdjLHOHv8EctmOco5.jpg` | Fresh buffet spread | - |
| Serving Meals | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200664-VKJLnV5EtqY3xyFpS0X4GLPD5KpmcK.jpg` | Serving delicious meals | - |
| Large Gathering | `https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1000200670-F1eWw4Wy3YdjbKOzfxcryC5O8eQ3Z1.jpg` | Large community gathering | 1280x960 |

### Image Themes
- **Community focus**: Multiple people dining together, socializing
- **Rooftop setting**: Outdoor dining with SF views
- **Food presentation**: Buffet-style spreads, fresh ingredients
- **Diversity**: Mix of people, ages, backgrounds
- **Energy**: Vibrant, active, celebratory atmosphere

---

## Copy & Messaging

### Hero Section
**Headline:** "Frontier Meals"
**Subhead:** "Healthy lunches delivered daily to Frontier Tower. Subscribe once, show up at noon, and enjoy community dining or grab and go."

**CTAs:**
- "Start Your Subscription" (primary)
- "Learn More" (secondary)

### Section: Join Our Community
**Headline:** "Join Our Community"
**Subhead:** "More than just lunch—it's about connecting with your colleagues"

### Section: How It Works
**Headline:** "How It Works"
**Subhead:** "Three simple steps to never worry about lunch again"

**Steps:**
1. **Subscribe on Stripe** - "Sign up for a monthly subscription. Unlimited weekday lunches with one simple payment."
2. **Manage on Telegram** - "Set your dietary preferences and cancel specific meals if needed—all through Telegram."
3. **Get Your QR Code** - "Receive your unique QR code via email at noon. Scan, pick up, and enjoy your meal."

### Section: Dietary & Flexibility Features
**Dietary Preferences:**
> "Choose from: I eat anything, Vegetarian, Vegan, or Pescatarian. Let us know about any food allergies and we'll accommodate your needs."

**Flexible Cancellation (CRITICAL PROMISE):**
> "Can't make it? Cancel by Friday 9am PST before the meal and receive a **75% reimbursement** for that day."

### Section: Fresh, Healthy, Delicious
**Headline:** "Fresh, Healthy, Delicious"
**Subhead:** "Every meal is carefully prepared with fresh ingredients and balanced nutrition in mind. From hearty mains to fresh salads and sides, there's something for everyone."

**Feature Cards:**
- **Variety Every Day** - "Different menu options to keep things interesting"
- **Dietary Accommodations** - "Options for various dietary preferences and needs"
- **Generous Portions** - "Satisfying meals that keep you energized all afternoon"

### Section: Why Frontier Meals?
**Benefits Grid (6 items):**
1. **Healthy & Fresh** - "Nutritious meals prepared daily with quality ingredients"
2. **Save Time** - "No more lunch planning or waiting in lines"
3. **Build Community** - "Connect with colleagues over shared meals"
4. **Flexible Options** - "Dine in with the community or grab and go"
5. **Weekday Service** - "Available every weekday, excluding holidays"
6. **Simple Pickup** - "Just scan your QR code and you're all set"

### Section: Social Proof
**Headline:** "Loved by the Frontier Tower Community"
*(Features large community gathering image)*

### Section: Final CTA
**Headline:** "Ready to simplify your lunch routine?"
**Subhead:** "Join Frontier Meals today and never think about lunch again. Healthy meals, great community, zero hassle."

**CTAs:**
- "Subscribe Now" (primary)
- "Contact Us" (secondary)

**Footer note:** "Available exclusively at Frontier Tower"

### Footer
> "© 2025 Frontier Meals. Serving Frontier Tower weekdays at noon."

---

## Key Promises & Features

### MUST PRESERVE (Contractual/Important)

1. **75% Reimbursement for Skips**
   - Cancel by Friday 9am PST before the meal
   - Receive 75% reimbursement for that day
   - *This is a key selling point and likely a binding promise*

2. **Dietary Preferences Supported**
   - I eat anything
   - Vegetarian
   - Vegan
   - Pescatarian
   - Food allergy accommodations

3. **Service Details**
   - Weekday service (Monday-Friday)
   - Excludes holidays
   - Pickup at noon
   - QR code delivered via email at noon

4. **Management via Telegram**
   - Set dietary preferences
   - Cancel specific meals
   - Bot-based interface

5. **Unlimited Weekday Lunches**
   - Monthly subscription model
   - One simple payment

### Value Propositions
- Time savings (no lunch planning/waiting)
- Community building (shared meals with colleagues)
- Health focus (fresh, balanced nutrition)
- Flexibility (dine in OR grab and go)
- Simplicity (scan QR, pick up, done)

---

## Page Structure

### Current frontiermeals.com Layout

```
┌─────────────────────────────────────────┐
│  HERO                                   │
│  - H1: Frontier Meals                   │
│  - Subhead + 2 CTAs                     │
│  - Hero image (portrait, right side)    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  JOIN OUR COMMUNITY                     │
│  - 3-image gallery (hover effects)      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  HOW IT WORKS                           │
│  - 3 numbered steps with icons          │
│  - 2 feature cards (dietary + cancel)   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  FRESH, HEALTHY, DELICIOUS              │
│  - 3 feature cards                      │
│  - 2 food images                        │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  WHY FRONTIER MEALS?                    │
│  - 6-item benefits grid                 │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  SOCIAL PROOF                           │
│  - Large community gathering image      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  FINAL CTA                              │
│  - Headline + subhead                   │
│  - 2 CTAs                               │
│  - Exclusivity note                     │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  FOOTER                                 │
└─────────────────────────────────────────┘
```

### Design Elements
- **Colors:** Purple/lavender accents, white backgrounds, dark text
- **Typography:** Clean sans-serif, bold headlines
- **Imagery:** Warm, authentic community photos
- **Interactions:** Hover scale effects on gallery images
- **Layout:** Full-width sections, generous whitespace

---

## Frontier Tower Context

### About the Building
- **Location:** 995 Market Street, San Francisco (Mid-Market)
- **Size:** 16 floors
- **Concept:** "Vertical village" for frontier technology and creative arts
- **Ownership:** Three German entrepreneurs (Jakob Drzazga, Christian Nagel, Christian Peters)
- **Purchase:** $11 million in March 2025

### Themed Floors
- AI research
- Cryptocurrency
- Biotech
- Neuroscience/Neurotech
- Longevity
- Deep-tech
- Human coordination
- Arts & music

### Amenities
- Coworking lounge
- Gym (free for members)
- Meditation space
- Events floor
- Rooftop area
- Recording studio
- Robotics floor (humanoid robots to borrow)
- Biotech lab
- Implant studio (biohacking)
- Nightclub in basement
- Planned daycare space

### Community Vibe
- Scrappy, authentic over polished
- DIY ethos (build furniture together, source from Facebook Marketplace)
- Blends serious research with experimentation and celebration
- Events like "BioPunk raves"
- Focus on cross-pollination between disciplines

### Pricing Context
- Coworking: $219/month
- Private offices: $700–$2,800/month
- Annual memberships: $1,980–$2,280

### Current State
- ~200 members
- Capacity for several hundred more
- Still building out (work in progress)

**Sources:**
- [SF Standard - First Look at Frontier Tower](https://sfstandard.com/2025/05/18/first-look-frontier-tower-san-francisco-vertical-village/)
- [CoworkingMag - Frontier Tower Listing](https://coworkingmag.com/listings/coworking-property/us/ca/san-francisco/frontier-tower/)

---

## Existing Codebase State

### Current Landing Page (`src/routes/+page.svelte`)
- Minimal, functional design
- Single-card subscription flow
- Frontier texture background (`#F5F3EF`)
- Orange/yellow accent colors (`#E67E50`, `#E8C547`)
- Direct Stripe checkout integration
- **Pricing shown:** $13.33/day ($400/month)

### Current Features Listed
- Daily QR code for kiosk pickup
- Manage preferences via Telegram bot
- Skip days you won't need a meal
- Dietary preferences supported

### Missing from Current Page
- Community imagery/photography
- Social proof section
- Detailed "How It Works" flow
- 75% reimbursement promise
- Dietary options spelled out
- Multiple CTAs/sections
- "Join Our Community" messaging
- Benefits grid
- Exclusivity/Frontier Tower branding

---

## Recommendations for Elevation

### Must Include
1. **75% reimbursement policy** - Prominently display this key differentiator
2. **Community photography** - Use the real images showing people at Frontier Tower
3. **Dietary options** - List all four preferences clearly
4. **Frontier Tower integration** - Reference the building, its vibe, the community
5. **How It Works** - Clear 3-step process visualization

### Design Suggestions
1. **Adopt warmer color palette** - The existing site uses purple; our brand uses orange/yellow. Consider a blend or evolution.
2. **Add photography sections** - Community gallery, food images, gathering shots
3. **Social proof** - Large community image section
4. **Multiple CTAs** - Don't just one card; guide users through the story
5. **Rooftop/SF context** - Leverage the unique Frontier Tower setting

### Content Gaps to Address
1. **Pricing transparency** - Current site doesn't show price; we show $400/month
2. **Cancellation deadline** - Friday 9am PST (need to verify this matches our implementation)
3. **Holiday exclusions** - Clarify which holidays
4. **Contact method** - Current site has "Contact Us" button (we have Telegram link)

### Technical Considerations
1. **Images hosted on Vercel Blob** - May need to migrate to Cloudflare or keep references
2. **Buttons on current site are non-functional** - Our implementation has working Stripe checkout
3. **Mobile responsiveness** - Current site is responsive; maintain this

---

## Assets Captured

### Screenshots
- `.playwright-mcp/frontiermeals-hero.png` - Hero viewport
- `.playwright-mcp/frontiermeals-full-page.png` - Full page screenshot

### Downloaded Images (Local)
All images have been downloaded to `docs/images/`:

| Local Filename | Original Alt Text | Size |
|----------------|-------------------|------|
| `hero-community-lunch.jpg` | Community lunch at Frontier Tower | 171KB |
| `rooftop-celebration.jpg` | Rooftop lunch celebration | 147KB |
| `happy-participants.jpg` | Happy lunch participants | 180KB |
| `community-dining.jpg` | Community dining together | 145KB |
| `buffet-spread.jpg` | Fresh buffet spread | 170KB |
| `serving-meals.jpg` | Serving delicious meals | 176KB |
| `large-gathering.jpg` | Large community gathering | 260KB |

---

## Next Steps

1. ~~Download image assets~~ **DONE** - Images saved to `docs/images/`
2. Migrate images to Cloudflare R2 or static assets for production
3. Design new landing page incorporating best elements from both sites
4. Verify 75% reimbursement logic matches our actual implementation
5. Integrate Frontier Tower branding/context (vertical village, deep tech, community)
6. Add community photography sections using downloaded images
7. Implement proper "How It Works" 3-step visualization
8. Add benefits grid and social proof sections
9. Ensure mobile responsiveness matches or exceeds current site
10. Update copy to blend current site's warmth with our brand voice
