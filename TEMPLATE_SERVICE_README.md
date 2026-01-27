# Email Template Retrieval Service - Implementation Guide

## Overview

The email template retrieval service provides a unified interface for email sending that:

1. **Checks database first** for active templates (allowing runtime editing)
2. **Falls back to code templates** if not found in database
3. **Supports variable replacement** using `{{variable_name}}` syntax
4. **Caches templates** for 5 minutes to reduce database load
5. **Logs template source** (DB vs code) for debugging

## Files Created

### `/src/lib/email/templates/index.ts`

The main template service with these exports:

```typescript
// Get template metadata (for inspection)
export async function getTemplate(
  slug: string,
  supabaseServiceKey: string
): Promise<{
  subject: string;
  html: string;
  variables: string[];
  fromDb: boolean;
}>;

// Render template with variables (main function to use)
export async function renderTemplate(
  slug: string,
  variables: Record<string, any>,
  supabaseServiceKey: string
): Promise<{
  subject: string;
  html: string;
  fromDb: boolean;
}>;

// Cache management (optional utilities)
export function clearTemplateCache(slug?: string): void;
export function getTemplateCacheStats(): object;
```

## Usage Examples

### Example 1: QR Daily Email (Updated in `issue-qr.ts`)

**Before:**
```typescript
import { getQRDailyEmail } from '$lib/email/templates/qr-daily';

const { subject, html } = getQRDailyEmail({
  customer_name: customer.name || 'there',
  service_date: today,
  qr_code_base64: base64Content
});
```

**After:**
```typescript
import { renderTemplate } from '$lib/email/templates';

const { subject, html } = await renderTemplate(
  'qr_daily',
  {
    customer_name: customer.name || 'there',
    service_date: today,
    qr_code_base64: base64Content
  },
  config.supabaseServiceKey
);
```

**Benefits:**
- If admin creates a custom QR email template in the database, it will be used automatically
- Falls back to code template if no DB template exists
- Logs which source was used for debugging

### Example 2: Webhook Handler (Pattern for `webhook/+server.ts`)

```typescript
import { renderTemplate } from '$lib/email/templates';
import { getEnv } from '$lib/server/env';

// Inside webhook handler function
const env = await getEnv(event);

const emailTemplate = await renderTemplate(
  'telegram_link',
  {
    customer_name: name,
    telegram_handle: telegramHandle || 'Not provided',
    deep_link: deepLink
  },
  env.SUPABASE_SERVICE_ROLE_KEY
);

await sendEmail({
  to: email,
  subject: emailTemplate.subject,
  html: emailTemplate.html,
  // ... other options
});
```

### Example 3: Dunning Emails

```typescript
let emailSlug: string;
if (attemptCount === 1) {
  emailSlug = 'dunning_soft';
} else if (attemptCount === 2) {
  emailSlug = 'dunning_retry';
} else {
  emailSlug = 'dunning_final';
}

const emailTemplate = await renderTemplate(
  emailSlug,
  {
    customer_name: customer.name,
    amount_due: amountDue,
    update_payment_url: portalSession.url
  },
  env.SUPABASE_SERVICE_ROLE_KEY
);

await sendEmail({
  to: customer.email,
  subject: emailTemplate.subject,
  html: emailTemplate.html,
  tags: [
    { name: 'category', value: emailSlug },
    { name: 'customer_id', value: customer.id }
  ],
  idempotencyKey: `${emailSlug}/${invoice.id}`
});
```

## Database Template Format

When creating templates in the database, use `{{variable_name}}` syntax:

### Subject Example:
```
Your meal QR for {{day_name}}
```

### Body Example:
```html
<p>Hi {{customer_name}}!</p>
<p>Your QR code for {{service_date}} is ready.</p>
<p>Scan at any kiosk before {{expiry_time}}.</p>
```

### Variable Extraction

The service automatically extracts variables from both subject and body:
- `{{customer_name}}` → variable: `customer_name`
- `{{service_date}}` → variable: `service_date`
- Variables with whitespace are trimmed: `{{ name }}` → variable: `name`

## Template Slugs

Currently supported slugs (mapped to code templates as fallback):

| Slug | Purpose | Variables |
|------|---------|-----------|
| `qr_daily` | Daily QR code email | `customer_name`, `service_date`, `qr_code_base64` |
| `telegram_link` | Welcome email with Telegram link | `customer_name`, `telegram_handle`, `deep_link` |
| `dunning_soft` | First payment failure | `customer_name`, `amount_due`, `update_payment_url` |
| `dunning_retry` | Second payment failure | `customer_name`, `update_payment_url` |
| `dunning_final` | Final payment attempt | `customer_name`, `amount_due`, `update_payment_url` |
| `canceled_notice` | Subscription canceled | `customer_name` |
| `admin_magic_link` | Admin login link | `email`, `magic_link` |
| `schedule_change` | Service schedule update | Complex object (see `ScheduleChangeEmailData`) |

## Caching Behavior

Templates are cached for **5 minutes** to reduce database load:

- Cache key: template slug
- Cache includes: subject, html, variables list, source (DB/code)
- Cache automatically expires after 5 minutes
- Manual cache clearing available via `clearTemplateCache(slug)`

### Cache Monitoring

```typescript
import { getTemplateCacheStats } from '$lib/email/templates';

const stats = getTemplateCacheStats();
// {
//   size: 3,
//   entries: [
//     { slug: 'qr_daily', fromDb: true, age: 120, variables: ['customer_name', 'service_date'] },
//     { slug: 'telegram_link', fromDb: false, age: 45, variables: [] },
//     ...
//   ]
// }
```

## Migration Path for Other Email Senders

Files that need updating:

1. **`src/routes/api/stripe/webhook/+server.ts`** (lines 256-274, 571-590, etc.)
   - Update telegram_link, dunning_soft, dunning_retry, dunning_final, canceled_notice

2. **`src/routes/api/admin/magic-link/+server.ts`** (if exists)
   - Update admin_magic_link

3. **Any schedule change notification code**
   - Update schedule_change

### Migration Template

```typescript
// OLD
import { getTemplateNameEmail } from '$lib/email/templates/template-name';
const { subject, html } = getTemplateNameEmail({ ...data });

// NEW
import { renderTemplate } from '$lib/email/templates';
const { subject, html } = await renderTemplate(
  'template_slug',
  { ...data },
  supabaseServiceKey
);
```

## Error Handling

The service throws errors in these cases:

1. **Template not found**: No DB template and no code fallback
   ```
   Error: Template not found: unknown_slug (not in database or code templates)
   ```

2. **Code template render error**: Exception in template function
   ```
   Error: Failed to render code template: qr_daily - [original error message]
   ```

3. **Database errors**: Supabase query failures are propagated

## Logging

The service logs these events to console:

- `[Template] Cache hit for slug: {slug}` - Template served from cache
- `[Template] Using DB template: {slug} (version {version})` - Database template used
- `[Template] Using code template (fallback): {slug}` - Code template used
- `[Template] Rendering DB template: {slug} with variables: [...]` - DB template rendering
- `[Template] Rendering code template: {slug} with variables: [...]` - Code template rendering
- `[Template] Variable not provided: {varName}` - Warning when variable missing
- `[Template] Cleared cache for: {slug}` - Manual cache clear
- `[Template] Cleared all template cache` - Manual cache clear all

## Testing Recommendations

### Unit Tests (to be created)

```typescript
// Test 1: Code template fallback
const result = await renderTemplate('qr_daily', { ... }, serviceKey);
expect(result.fromDb).toBe(false);

// Test 2: Variable replacement
// Create DB template with {{name}} placeholder
const result = await renderTemplate('test_slug', { name: 'John' }, serviceKey);
expect(result.html).toContain('John');
expect(result.html).not.toContain('{{name}}');

// Test 3: Cache behavior
await renderTemplate('qr_daily', { ... }, serviceKey);
const stats1 = getTemplateCacheStats();
expect(stats1.size).toBe(1);
```

### Integration Tests

1. Create a test template in database with `is_active = true`
2. Call `renderTemplate()` with that slug
3. Verify it uses DB version (check logs or `fromDb` flag)
4. Update template in database
5. Wait for cache expiry (5 min) or call `clearTemplateCache()`
6. Verify updated content is used

## Database Schema Reference

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff_accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, version)
);

CREATE INDEX idx_template_slug_active
  ON email_templates(slug, is_active)
  WHERE is_active = TRUE;
```

## Performance Characteristics

- **First call**: Database query (~50-100ms) + template render
- **Cached calls**: In-memory lookup (~1ms) + template render
- **Cache miss rate**: ~2% after 5 min TTL (estimated)
- **Memory footprint**: ~2-5KB per cached template

## Future Enhancements

Potential improvements (not implemented):

1. **Preview API**: Render template with sample data for admin preview
2. **Variable validation**: Check that all required variables are provided
3. **A/B testing**: Support multiple active templates with traffic split
4. **Template analytics**: Track open rates, click rates per template version
5. **Rollback**: Quick rollback to previous template version
6. **Warm cache**: Pre-load frequently used templates on server start
