# Landing Page Components

Base layout components for the Frontier Meals landing page, built with Svelte 5 and the Frontier Tower aesthetic: **scrappy over polished, bold over safe, industrial over corporate**.

## Components

### Section
Section wrapper with consistent spacing and background variants.

```svelte
<Section background="elevated" spacing="normal">
  <Container>
    <!-- content -->
  </Container>
</Section>
```

**Props:**
- `id?: string` - Section ID for anchor links
- `background?: 'default' | 'elevated' | 'recessed'` - Background color variant
- `spacing?: 'normal' | 'compact' | 'spacious'` - Vertical padding
- `class?: string` - Additional CSS classes

### Container
Max-width container with responsive padding.

```svelte
<Container size="default">
  <!-- content -->
</Container>
```

**Props:**
- `size?: 'default' | 'narrow' | 'wide'` - Max width variant
- `class?: string` - Additional CSS classes

### Heading
Typography component with perceptual hierarchy.

```svelte
<Heading level={1} align="center">
  Welcome to Frontier Meals
</Heading>
```

**Props:**
- `level: 1 | 2 | 3 | 4` - Visual hierarchy level
- `as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'` - Semantic HTML element (defaults to matching level)
- `align?: 'left' | 'center' | 'right'` - Text alignment
- `class?: string` - Additional CSS classes

### Text
Body text with size and color variants.

```svelte
<Text size="lg" color="secondary">
  Your daily lunch, delivered fresh.
</Text>
```

**Props:**
- `size?: 'sm' | 'base' | 'lg' | 'xl'` - Font size
- `color?: 'primary' | 'secondary' | 'tertiary' | 'inverse'` - Text color
- `as?: 'p' | 'span' | 'div'` - HTML element
- `align?: 'left' | 'center' | 'right'` - Text alignment
- `class?: string` - Additional CSS classes

### FeatureCard
Reusable card for features with optional icon and highlight state.

```svelte
<FeatureCard
  title="75% Reimbursed"
  description="Frontier covers 75% of your meal cost"
  icon="💰"
  highlight={true}
/>
```

**Props:**
- `title: string` - Card title
- `description: string` - Card description
- `icon?: string` - Icon (emoji or Lucide icon name)
- `highlight?: boolean` - Highlight state for key features
- `class?: string` - Additional CSS classes

### SectionHeader
Combines heading and subheading for section intros.

```svelte
<SectionHeader
  headline="How It Works"
  subhead="Three simple steps to better lunches"
  align="center"
/>
```

**Props:**
- `headline: string` - Main heading
- `subhead?: string` - Optional subheading
- `align?: 'left' | 'center'` - Text alignment
- `class?: string` - Additional CSS classes

## Example Usage

```svelte
<script>
  import {
    Section,
    Container,
    SectionHeader,
    FeatureCard
  } from '$lib/components/landing';
</script>

<Section background="elevated" spacing="normal">
  <Container>
    <SectionHeader
      headline="Why Frontier Meals?"
      subhead="Better food, better prices, better community"
    />

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <FeatureCard
        title="75% Reimbursed"
        description="Frontier covers 75% of your meal cost"
        icon="💰"
        highlight={true}
      />
      <FeatureCard
        title="Local Restaurants"
        description="Support SF's best neighborhood spots"
        icon="🍜"
      />
      <FeatureCard
        title="Daily Variety"
        description="New menus from different restaurants"
        icon="📅"
      />
    </div>
  </Container>
</Section>
```

## Design Principles

1. **Svelte 5 First**: Uses runes (`$props`, `$state`, `$derived`) and `{@render children()}`
2. **Industrial Aesthetic**: Minimal border radius (4-8px), bold typography, tight tracking
3. **Snappy Interactions**: 150-300ms transitions, no sluggish animations
4. **Frontier Palette**: Orange (#E67E50), Yellow (#E8C547), warm grays
5. **Composable**: Components work together seamlessly

## Color Reference

- **Primary Text**: `#1A1816`
- **Secondary Text**: `#5C5A56`
- **Tertiary Text**: `#8E8C87`
- **Orange**: `#E67E50`
- **Yellow**: `#E8C547`
- **Background Default**: `#F5F3EF`
- **Background Elevated**: `#FFFFFF`
- **Background Recessed**: `#E8E6E1`
- **Border Light**: `#D9D7D2`
- **Border Medium**: `#B8B6B1`
