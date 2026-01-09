# Email Block Editor System

A perceptually-engineered email template system that converts semantic blocks into production-quality HTML emails matching the existing template patterns.

## Architecture

The email editor system consists of four main components:

### 1. Types (`types.ts`)

Defines the semantic block structure and template architecture:

- **EmailBlock Union**: 13 block types (greeting, paragraph, infobox, button, steplist, code, image, divider, spacer, heading, list, link, custom)
- **EmailTemplate**: Top-level template structure with metadata, color scheme, header, blocks, footer, and variables
- **TemplateVariable**: Variable definitions with types and example values
- **RenderContext**: Runtime context for rendering blocks to HTML

**Perceptual Principles:**
- Same block + same data = identical HTML (deterministic, no hidden state)
- Block types match mental models (greeting, button, info box)
- Constrained choices prevent chaos (4 paragraph styles, not infinite)

### 2. Renderer (`renderer.ts`)

Converts semantic blocks to HTML using the existing template system from `base.ts`:

```typescript
import { renderTemplate, renderBlock } from './renderer';

const template: EmailTemplate = {
  slug: 'test-email',
  name: 'Test Email',
  colorScheme: 'green',
  subject: 'Hello {{customer_name}}!',
  header: {
    emoji: '🍽️',
    title: 'Your Meal Awaits',
    subtitle: 'Fresh food, delivered daily'
  },
  blocks: [
    {
      type: 'greeting',
      id: 'greeting-1',
      nameVariable: '{{customer_name}}'
    },
    {
      type: 'paragraph',
      id: 'para-1',
      content: 'Your meal for {{service_date}} is ready!',
      style: 'normal'
    },
    {
      type: 'button',
      id: 'btn-1',
      label: 'View Details',
      urlVariable: '{{detail_url}}'
    }
  ],
  footer: { type: 'support' },
  variables: [
    { name: 'customer_name', label: 'Customer Name', type: 'string', exampleValue: 'Alex' },
    { name: 'service_date', label: 'Service Date', type: 'date', exampleValue: '2025-01-15' },
    { name: 'detail_url', label: 'Detail URL', type: 'url', exampleValue: 'https://example.com' }
  ]
};

const { subject, html } = renderTemplate(template, {
  customer_name: 'Alex',
  service_date: '2025-01-15',
  detail_url: 'https://frontiermeals.com/details/abc123'
});
```

**Output HTML matches existing template patterns exactly:**
- Uses `buildEmailHTML()` from base.ts
- Applies inline styles from `styles` and `tokens`
- Renders to production-ready email HTML

### 3. Parser (`parser.ts`)

Reverse-engineers existing template source code to extract template structure:

```typescript
import { parseExistingTemplate } from './parser';

const sourceCode = `
import { buildEmailHTML, brandColors, styles } from './base';

export interface QRDailyEmailData {
  customer_name: string;
  service_date: string;
}

export function getQRDailyEmail(data: QRDailyEmailData) {
  const subject = \`Your meal QR for \${data.service_date}\`;
  const scheme = brandColors.green;
  // ...
}
`;

const result = parseExistingTemplate(sourceCode);
if (result.template) {
  console.log('Parsed template:', result.template);
  // Can now edit in block editor
}
```

**Parsing extracts:**
- Color scheme (brandColors.X)
- Subject and preheader
- Header (emoji, title, subtitle)
- Variables from interface
- Footer type
- Blocks (limited - heuristic-based)

### 4. Registry (`registry.ts`)

Central catalog of all email templates in the system:

```typescript
import { EMAIL_TEMPLATES, listTemplates, loadTemplateMetadata } from './registry';

// List all templates
const templates = listTemplates();
// [{ slug: 'qr-daily', name: 'Daily QR Code', ... }, ...]

// Load metadata for specific template
const metadata = await loadTemplateMetadata('qr-daily');
// { slug, name, description, colorScheme, variables }
```

**Registry includes:**
- qr-daily - Daily QR code email
- telegram-link - Telegram onboarding
- dunning-soft/retry/final - Payment failure notices
- canceled-notice - Subscription cancellation
- schedule-change - Service schedule updates
- admin-magic-link - Admin authentication

## Block Types Reference

### GreetingBlock
Personalized greeting at email start.

```typescript
{
  type: 'greeting',
  id: 'greeting-1',
  nameVariable: '{{customer_name}}',
  prefix: 'Hi' // optional, default: "Hi"
}
```

Renders: `<p style="${styles.pLead}">Hi Alex,</p>`

### ParagraphBlock
Body text with semantic styling.

```typescript
{
  type: 'paragraph',
  id: 'para-1',
  content: 'Your meal for <strong>{{service_date}}</strong> is ready!',
  style: 'normal' // lead | normal | muted | small
}
```

Renders: `<p style="${styles.p}">Your meal for <strong>2025-01-15</strong> is ready!</p>`

### InfoBoxBlock
Colored callout for important information.

```typescript
{
  type: 'infobox',
  id: 'info-1',
  boxType: 'warning', // success | warning | error | info
  title: '⏰ Expires Tonight',
  content: 'Redeem before 11:59 PM PT',
  icon: '⏰' // optional
}
```

Renders: Color-coded box with border and background.

### ButtonBlock
Primary call-to-action.

```typescript
{
  type: 'button',
  id: 'btn-1',
  label: 'Update Payment Method',
  urlVariable: '{{update_payment_url}}',
  colorScheme: 'red', // optional override
  align: 'center' // center | left | right
}
```

Renders: Table-wrapped button with full inline styles.

### StepListBlock
Numbered sequential instructions.

```typescript
{
  type: 'steplist',
  id: 'steps-1',
  title: 'What happens next:', // optional
  steps: [
    { title: 'Connect on Telegram', description: 'Click the button above' },
    { title: 'Set your preferences', description: 'Tell us your diet' }
  ],
  background: 'subtle' // subtle | none
}
```

Renders: Numbered badges with titles and descriptions.

### CodeBlock
Display code or technical values.

```typescript
{
  type: 'code',
  id: 'code-1',
  content: '{{api_key}}',
  style: 'inline', // inline | block
  label: 'Your API Key:' // optional, for block style
}
```

Renders: Monospace font with gray background.

### ImageBlock
Embedded images (QR codes, illustrations).

```typescript
{
  type: 'image',
  id: 'img-1',
  cid: 'qr-code', // for cid:qr-code
  alt: 'Your QR code for Monday',
  width: 280,
  height: 280,
  bordered: true, // optional
  caption: 'Scan at any kiosk', // optional
  align: 'center' // optional
}
```

Renders: Responsive image with optional border container.

### HeadingBlock
Section headings.

```typescript
{
  type: 'heading',
  id: 'h-1',
  content: 'Affected Dates',
  level: 'h2' // h2 | h3
}
```

### ListBlock
Bulleted or numbered lists.

```typescript
{
  type: 'list',
  id: 'list-1',
  title: 'Common causes:', // optional
  items: ['Card expiration', 'Insufficient funds', 'Billing address change'],
  listStyle: 'bulleted' // bulleted | numbered
}
```

### LinkBlock
Standalone link (less prominent than button).

```typescript
{
  type: 'link',
  id: 'link-1',
  label: 'View on website',
  url: '{{website_url}}',
  colorScheme: 'teal', // optional
  align: 'center' // optional
}
```

### DividerBlock
Horizontal rule between sections.

```typescript
{
  type: 'divider',
  id: 'div-1',
  style: 'light' // light | medium
}
```

### SpacerBlock
Vertical spacing.

```typescript
{
  type: 'spacer',
  id: 'space-1',
  size: 'xl' // sm | md | lg | xl | 2xl
}
```

### CustomHtmlBlock
Escape hatch for advanced patterns.

```typescript
{
  type: 'custom',
  id: 'custom-1',
  html: '<div>...</div>',
  description: 'Custom pricing table'
}
```

## Color Schemes

Six semantic color schemes from `base.ts`:

- **orange** - Primary brand color
- **teal** - Informational/neutral
- **green** - Success/positive
- **amber** - Warning/caution
- **red** - Critical/urgent
- **gray** - Neutral/minimal

Each scheme provides:
- Primary color (header gradient, buttons)
- Dark variant (gradient end)
- onPrimary color (text on colored backgrounds)
- Link color (AAA contrast on white)

## Variable System

Template variables use `{{variable_name}}` syntax:

```typescript
{
  name: 'customer_name',
  label: 'Customer Name',
  type: 'string', // string | url | date | number | base64
  exampleValue: 'Alex',
  description: 'Customer first name' // optional
}
```

Variables are replaced at render time:
- In subject line
- In preheader
- In header title/subtitle
- In block content (paragraphs, buttons, etc.)

## Code Generation

Generate TypeScript code for templates:

```typescript
import { generateTemplateCode } from './renderer';

const code = generateTemplateCode(template);
// Produces:
// import { buildEmailHTML, brandColors, ... } from './base';
// export interface TestEmailData { ... }
// export function getTestEmail(data: TestEmailData) { ... }
```

Output matches existing template file patterns for consistency.

## Perceptual Engineering Principles

1. **Output matches mental model**: Each block type produces HTML that looks like what users expect (button looks clickable, info box stands out)

2. **Deterministic rendering**: Same block + same data = identical HTML every time. No hidden state.

3. **Instant preview updates**: Block changes should feel immediate (<100ms perceived latency)

4. **Consistency**: Same block always renders the same way across all templates

5. **Recognition over recall**: Block picker shows available options, users don't memorize syntax

6. **Constrained choices**: Limited options prevent decision paralysis (4 paragraph styles, not infinite)

7. **Visual hierarchy through contrast**: Uses type scale and color, not opacity tricks

## Integration with Existing System

The editor system uses the existing email infrastructure:

- **base.ts**: Color schemes, style tokens, component generators
- **buildEmailHTML()**: Master template builder
- **Existing templates**: Compatible with qr-daily, dunning, etc.

All rendered HTML uses the same inline styles, table structures, and patterns as hand-written templates.

## Usage Examples

### Create a new template from scratch

```typescript
import { renderTemplate } from '$lib/email/editor';

const newTemplate: EmailTemplate = {
  slug: 'welcome-email',
  name: 'Welcome Email',
  colorScheme: 'teal',
  subject: 'Welcome to Frontier Meals, {{customer_name}}!',
  preheader: 'Get started with your fresh meal subscription',
  header: {
    emoji: '👋',
    title: 'Welcome!',
    subtitle: 'Let\'s get you started'
  },
  blocks: [
    {
      type: 'greeting',
      id: '1',
      nameVariable: '{{customer_name}}'
    },
    {
      type: 'paragraph',
      id: '2',
      content: 'We\'re excited to serve you fresh meals every day.',
      style: 'lead'
    },
    {
      type: 'button',
      id: '3',
      label: 'Complete Your Profile',
      urlVariable: '{{profile_url}}'
    }
  ],
  footer: { type: 'support' },
  variables: [
    { name: 'customer_name', label: 'Customer Name', type: 'string', exampleValue: 'Alex' },
    { name: 'profile_url', label: 'Profile URL', type: 'url', exampleValue: 'https://frontiermeals.com/profile' }
  ]
};

const output = renderTemplate(newTemplate, {
  customer_name: 'Jordan',
  profile_url: 'https://frontiermeals.com/profile/abc123'
});

console.log(output.subject); // "Welcome to Frontier Meals, Jordan!"
// output.html is production-ready email HTML
```

### Parse and modify existing template

```typescript
import { parseExistingTemplate, renderTemplate } from '$lib/email/editor';
import { readFileSync } from 'fs';

const sourceCode = readFileSync('src/lib/email/templates/qr-daily.ts', 'utf-8');
const result = parseExistingTemplate(sourceCode);

if (result.template) {
  // Modify the template
  result.template.blocks.push({
    type: 'paragraph',
    id: 'new-para',
    content: 'Don\'t forget to check your allergies!',
    style: 'muted'
  });

  // Render modified version
  const output = renderTemplate(result.template, {
    customer_name: 'Taylor',
    service_date: '2025-01-20',
    qr_code_base64: '...'
  });
}
```

### Export template to code

```typescript
import { generateTemplateCode } from '$lib/email/editor';

const code = generateTemplateCode(template);
writeFileSync('src/lib/email/templates/new-template.ts', code);
```

## Type Safety

The system is fully type-safe:

```typescript
const block: EmailBlock = {
  type: 'greeting',
  id: 'g1',
  nameVariable: '{{customer_name}}'
};

// TypeScript ensures all required fields are present
// and types are correct

const context: RenderContext = {
  template,
  data: { customer_name: 'Alex' },
  colorScheme: brandColors.green
};

// renderBlock is type-safe
const html = renderBlock(block, context);
```

## Future Enhancements

Potential improvements:

1. **Full parser**: Complete block extraction from existing templates
2. **Validation**: Catch missing variables, invalid URLs, etc.
3. **Preview UI**: Live preview with instant updates
4. **Block library**: Pre-built block combinations
5. **A/B testing**: Compare template variations
6. **Analytics**: Track which blocks get clicked

## License

Internal Frontier Meals system. All rights reserved.
