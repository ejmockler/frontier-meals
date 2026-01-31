# PII-Safe Logging Developer Guide

## Quick Start

### Import the Utility

```typescript
import { redactPII } from '$lib/utils/logging';
```

### Basic Usage

```typescript
// ❌ NEVER do this
console.log('User registered:', { email, name, phone });

// ✅ ALWAYS do this
console.log('User registered:', redactPII({ email, name, phone }));
// Output: { email: '***@example.com', name: '[REDACTED]', phone: '[REDACTED]' }
```

## Common Patterns

### 1. Webhook Event Logging

```typescript
// PayPal/Stripe webhook data
console.log('[Webhook] Event received:',
  redactPII({
    customer_id: customerId,
    email: customerEmail,
    subscription_id: subscriptionId
  })
);
// Output: {
//   customer_id: 'cus_ABCD...',
//   email: '***@gmail.com',
//   subscription_id: 'sub_1234...'
// }
```

### 2. Database Operation Logging

```typescript
// Creating/updating customer records
console.log('[DB] Creating customer:',
  redactPII({
    email: customer.email,
    name: customer.name,
    paypal_payer_id: customer.paypal_payer_id
  })
);
```

### 3. Audit Log Metadata

```typescript
// Store only domain, not full email
await supabase.from('audit_log').insert({
  actor: 'system',
  action: 'subscription_created',
  subject: `customer:${customerId}`,
  metadata: {
    email_domain: email.split('@')[1] || 'unknown',
    subscription_id: redactPII({ subscription_id: subId }).subscription_id
  }
});
```

## What Gets Redacted?

### Automatically Redacted Fields

| Field Pattern | Redaction | Example |
|---------------|-----------|---------|
| `email`, `*_email`, `email_*` | Domain only | `***@gmail.com` |
| `name`, `*_name`, `given_name`, `surname` | Full | `[REDACTED]` |
| `payer_id`, `customer_id`, `subscription_id` | Prefix (8 chars) | `PAYPAL12...` |
| `address`, `phone`, `ssn`, `credit_card` | Full | `[REDACTED]` |

### Fields NOT Redacted

- `amount`, `currency`, `price`
- `status`, `state`, `type`
- `created_at`, `updated_at`, `expires_at`
- `quantity`, `count`, `total`
- UUIDs (considered non-sensitive identifiers)

## Custom Redaction

### Add Custom Fields

```typescript
redactPII(
  { api_key: 'sk_live_1234567890' },
  {
    fullRedact: ['api_key'],  // Fully redact
    prefixRedact: ['token']    // Show prefix only
  }
);
```

### Custom Redaction Function

```typescript
redactPII(
  { credit_card: '4111111111111111' },
  {
    custom: {
      credit_card: (value) => `****-****-****-${String(value).slice(-4)}`
    }
  }
);
// Output: { credit_card: '****-****-****-1111' }
```

## Nested Objects

Redaction works recursively:

```typescript
const data = {
  customer: {
    email: 'user@example.com',
    name: 'John Doe',
    metadata: {
      referral_email: 'friend@example.com'
    }
  },
  subscriptions: [
    { id: 'sub_123456789', email: 'admin@company.com' }
  ]
};

console.log(redactPII(data));
// Output: {
//   customer: {
//     email: '***@example.com',
//     name: '[REDACTED]',
//     metadata: { referral_email: '***@example.com' }
//   },
//   subscriptions: [
//     { id: 'sub_1234...', email: '***@company.com' }
//   ]
// }
```

## When to Use

### ✅ ALWAYS Use for:

1. **Webhook handlers** - PayPal, Stripe, any external service
2. **Database operations** - Creating/updating users, customers
3. **Authentication flows** - Login, registration, password reset
4. **Error logging** - When errors contain user data
5. **Audit logs** - Any audit trail with customer info
6. **Admin actions** - Staff operations on customer records

### ⚠️ SOMETIMES Use for:

1. **Internal service logs** - If they might be accessed by external parties
2. **Temporary debugging** - Remove after debugging is complete
3. **Analytics events** - Depends on analytics provider compliance

### ❌ NEVER Skip for:

1. **Production logs** - ALWAYS redact in production
2. **Third-party integrations** - Never send raw PII to logging services
3. **Error tracking** - Sentry, Rollbar, etc. should never see raw PII

## Email Sending

**Email sending is OK** - Don't redact data being sent TO the customer:

```typescript
// ✅ OK - Sending email to the customer
await sendEmail({
  to: customer.email,        // NOT redacted - this is the recipient
  subject: 'Welcome!',
  html: `Hello ${customer.name}!`  // NOT redacted - going to customer
});

// ❌ BAD - Logging email details
console.log('Sent email to:', customer.email);  // PII VIOLATION!

// ✅ GOOD - Log redacted version
console.log('Sent email to:', redactPII({ email: customer.email }));
```

## Testing

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { redactPII } from '$lib/utils/logging';

describe('Feature X logging', () => {
  it('should redact customer PII in logs', () => {
    const logData = {
      email: 'customer@example.com',
      name: 'Jane Doe'
    };

    const redacted = redactPII(logData);

    expect(redacted.email).toBe('***@example.com');
    expect(redacted.name).toBe('[REDACTED]');
  });
});
```

## Common Mistakes

### ❌ Logging PII in Error Messages

```typescript
// BAD
throw new Error(`Customer ${email} not found`);

// GOOD
throw new Error(`Customer not found`);
// Then log separately with redaction
console.log('[Error] Customer lookup failed:', redactPII({ email }));
```

### ❌ Redacting Data You Need

```typescript
// BAD - Don't redact data you're about to USE
const redacted = redactPII({ email: customer.email });
await sendEmail({ to: redacted.email }); // Sends to '***@example.com' - WRONG!

// GOOD - Only redact for LOGGING
await sendEmail({ to: customer.email }); // Use actual email
console.log('Email sent:', redactPII({ email: customer.email })); // Log redacted
```

### ❌ Over-Redacting Operational Data

```typescript
// BAD - Over-redacting
console.log('Payment processed:',
  redactPII({ amount: 29.99, currency: 'USD' })
);
// amount and currency get redacted unnecessarily

// GOOD - Only redact PII
console.log('Payment processed:', {
  amount: 29.99,        // Not PII - keep
  currency: 'USD',      // Not PII - keep
  ...redactPII({ email, name })  // PII - redact
});
```

## Checklist

Before committing code with logging:

- [ ] No raw `email` values in `console.log`
- [ ] No raw `name` values in `console.log`
- [ ] No raw `payer_id` / `customer_id` in `console.log`
- [ ] Used `redactPII()` wrapper for any customer data
- [ ] Audit log metadata doesn't contain full email
- [ ] Error messages don't expose PII
- [ ] Tests verify PII redaction works

## References

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST SP 800-122 - PII Protection](https://csrc.nist.gov/publications/detail/sp/800-122/final)
- [GDPR Article 5 - Data Minimization](https://gdpr-info.eu/art-5-gdpr/)

---

**Need help?** Ask in #engineering-security or consult the Security Engineering team.
