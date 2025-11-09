# Critical Fixes Specification - IEEE Standard Format

**Document Version:** 1.0
**Date:** 2025-11-08
**Project:** Frontier Meals - Production Stability Fixes
**Classification:** Internal Engineering Specification

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2025-11-08 | Engineering Team | Initial specification for critical production fixes |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Scope](#2-scope)
3. [References](#3-references)
4. [Definitions and Acronyms](#4-definitions-and-acronyms)
5. [System Overview](#5-system-overview)
6. [Requirements](#6-requirements)
7. [Detailed Design Specifications](#7-detailed-design-specifications)
8. [Testing Requirements](#8-testing-requirements)
9. [Deployment Procedures](#9-deployment-procedures)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the technical requirements, design, and implementation details for three critical production fixes identified through brutalist code analysis and user flow testing:

1. **FIX-002**: Auto-generate Telegram link on handle update
2. **FIX-003**: QR code generation race condition prevention
3. **FIX-004**: Email delivery retry mechanism

### 1.2 Document Conventions

- **SHALL**: Indicates mandatory requirement
- **SHOULD**: Indicates recommended requirement
- **MAY**: Indicates optional requirement
- **MUST NOT**: Indicates prohibited action

### 1.3 Intended Audience

- Backend Engineers
- Database Administrators
- QA Engineers
- DevOps Engineers

### 1.4 Product Scope

These fixes address critical user-facing failures in the Frontier Meals subscription service that result in:
- Customer payment without service delivery
- Data corruption under concurrent load
- Silent email failures causing onboarding drop-off

---

## 2. Scope

### 2.1 In Scope

- Handle update endpoint modification to generate new Telegram deep links
- Database schema modification for atomic QR token generation
- Email retry queue table and processing logic
- Integration with existing Supabase PostgreSQL database
- Cloudflare Pages cron job modifications

### 2.2 Out of Scope

- New external service integrations (Redis, message queues, etc.)
- UI/UX changes beyond functional requirements
- Performance optimization beyond preventing race conditions
- Monitoring/alerting infrastructure (future phase)

---

## 3. References

### 3.1 Internal Documents

- `docs/BRUTALIST-FIXES-LEAN.md` - Lean implementation strategy
- `specs/01-DATA-MODEL.md` - Database schema specification
- `specs/02-API-CONTRACTS.md` - API endpoint contracts

### 3.2 External Standards

- RFC 7231: HTTP/1.1 Semantics and Content
- PostgreSQL 14 Documentation: Constraints and Transactions
- ISO/IEC 9126: Software Quality Characteristics

---

## 4. Definitions and Acronyms

### 4.1 Definitions

| Term | Definition |
|------|------------|
| Deep Link Token | UUID-based one-time token for Telegram bot authentication |
| Handle Update | User-initiated correction of Telegram username |
| QR Token | JWT containing customer ID and service date for meal redemption |
| Race Condition | Concurrent execution resulting in non-deterministic data state |
| Idempotency | Property ensuring duplicate operations produce identical results |

### 4.2 Acronyms

| Acronym | Expansion |
|---------|-----------|
| API | Application Programming Interface |
| CRUD | Create, Read, Update, Delete |
| JWT | JSON Web Token |
| PT | Pacific Time |
| QR | Quick Response (code) |
| UUID | Universally Unique Identifier |

---

## 5. System Overview

### 5.1 Architecture Context

```
┌─────────────┐
│   Stripe    │──────┐
│  (Payment)  │      │
└─────────────┘      │
                     ▼
┌─────────────┐  ┌──────────────────┐  ┌─────────────┐
│   Resend    │◄─│  SvelteKit App   │─►│  Supabase   │
│   (Email)   │  │  (Cloudflare)    │  │ (Postgres)  │
└─────────────┘  └──────────────────┘  └─────────────┘
                     │
                     ▼
                 ┌─────────────┐
                 │  Telegram   │
                 │     Bot     │
                 └─────────────┘
```

### 5.2 Data Flow

**Current State (FIX-001 Completed):**
1. User completes Stripe checkout
2. Token generated and passed in success URL
3. User clicks deep link → Telegram bot authenticates
4. User completes onboarding via bot

**Remaining Issues:**
- Handle correction breaks token chain (FIX-002)
- Concurrent QR generation creates duplicates (FIX-003)
- Email failures are silent (FIX-004)

---

## 6. Requirements

### 6.1 Functional Requirements

#### 6.1.1 FIX-002: Handle Update Token Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-002-001 | System SHALL generate a new deep link token when user updates Telegram handle | P0 |
| FR-002-002 | System SHALL display the new deep link token to user in the success response | P0 |
| FR-002-003 | System SHALL store the hashed token in `telegram_deep_link_tokens` table | P0 |
| FR-002-004 | System SHALL set token expiration to 7 days from creation | P1 |
| FR-002-005 | System MAY send email with new token as backup notification | P2 |

#### 6.1.2 FIX-003: QR Race Condition Prevention

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-003-001 | System SHALL prevent duplicate QR tokens for same customer and date | P0 |
| FR-003-002 | System SHALL use database constraints to enforce uniqueness | P0 |
| FR-003-003 | System SHALL handle constraint violations gracefully without throwing | P0 |
| FR-003-004 | System SHALL log when duplicate generation is prevented | P1 |
| FR-003-005 | System MUST NOT send duplicate QR emails to customers | P0 |

#### 6.1.3 FIX-004: Email Retry Mechanism

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-004-001 | System SHALL queue failed email sends for retry | P0 |
| FR-004-002 | System SHALL retry failed emails with exponential backoff | P0 |
| FR-004-003 | System SHALL limit retry attempts to maximum of 5 | P1 |
| FR-004-004 | System SHALL mark emails as abandoned after max retries | P1 |
| FR-004-005 | System SHOULD log all retry attempts with timestamps | P2 |

### 6.2 Non-Functional Requirements

#### 6.2.1 Performance

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Handle update endpoint SHALL respond within 2 seconds | p95 < 2s |
| NFR-002 | QR cron job SHALL process 1000 customers within 5 minutes | throughput ≥ 200/min |
| NFR-003 | Email retry cron SHALL process 100 queued emails within 1 minute | throughput ≥ 100/min |

#### 6.2.2 Reliability

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-004 | QR token generation SHALL be 100% collision-free | 0 duplicates |
| NFR-005 | Email retry SHALL achieve 99.9% eventual delivery | delivery rate ≥ 99.9% |
| NFR-006 | Handle update SHALL succeed 99.99% of attempts | success rate ≥ 99.99% |

#### 6.2.3 Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-007 | Tokens SHALL be hashed using SHA-256 before storage | `sha256(token)` |
| NFR-008 | Tokens SHALL use cryptographically secure random generation | `crypto.randomUUID()` |
| NFR-009 | Email retry queue MUST NOT log sensitive customer data | Sanitized logs only |

---

## 7. Detailed Design Specifications

### 7.1 FIX-002: Handle Update Token Generation

#### 7.1.1 Endpoint Specification

**Endpoint:** `POST /api/handle/consume`

**Current Behavior:**
```typescript
// User updates handle
UPDATE customers SET telegram_handle = @newHandle WHERE id = @customerId;
// Response: { success: true }
```

**New Behavior:**
```typescript
// User updates handle
UPDATE customers SET telegram_handle = @newHandle WHERE id = @customerId;

// Generate new token
const newToken = randomUUID();
const tokenHash = await sha256(newToken);

// Store token
INSERT INTO telegram_deep_link_tokens (
  customer_id,
  token_hash,
  expires_at
) VALUES (
  @customerId,
  @tokenHash,
  NOW() + INTERVAL '7 days'
);

// Response: {
//   success: true,
//   telegram_link: `https://t.me/frontiermealsbot?start=${newToken}`
// }
```

#### 7.1.2 State Diagram

```
┌─────────────────┐
│  User Submits   │
│  Handle Update  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Token  │──────► [INVALID] ──► Return 400 Error
└────────┬────────┘
         │ [VALID]
         ▼
┌─────────────────┐
│ Update Handle   │──────► [FAIL] ──► Return 500 Error
└────────┬────────┘
         │ [SUCCESS]
         ▼
┌─────────────────┐
│ Generate New    │
│  Deep Link      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Store Token    │──────► [FAIL] ──► Log Warning, Continue
│   in Database   │
└────────┬────────┘
         │ [SUCCESS]
         ▼
┌─────────────────┐
│ Return Success  │
│  with Link      │
└─────────────────┘
```

#### 7.1.3 Database Operations

**Transaction Boundary:**
```sql
BEGIN;

-- Operation 1: Mark old token as used
UPDATE handle_update_tokens
SET used_at = NOW()
WHERE token_hash = @oldTokenHash
  AND used_at IS NULL;

-- Verify exactly 1 row updated
IF row_count != 1 THEN
  ROLLBACK;
  RAISE EXCEPTION 'Token already used or invalid';
END IF;

-- Operation 2: Update customer handle
UPDATE customers
SET telegram_handle = @newHandle
WHERE id = @customerId;

COMMIT;

-- Operation 3: Create new deep link token (outside transaction)
INSERT INTO telegram_deep_link_tokens (
  customer_id,
  token_hash,
  expires_at
) VALUES (
  @customerId,
  @newTokenHash,
  NOW() + INTERVAL '7 days'
);
```

**Rationale for Transaction Boundary:**
- Handle update and token marking are atomic
- New deep link creation is non-critical (can be retried)
- Failure to create new token doesn't invalidate handle update

#### 7.1.4 API Response Schema

**Success Response (200 OK):**
```json
{
  "success": true,
  "telegram_link": "https://t.me/frontiermealsbot?start=550e8400-e29b-41d4-a716-446655440000",
  "expires_at": "2025-11-15T12:00:00Z"
}
```

**Error Responses:**

```json
// 400 Bad Request - Invalid token
{
  "error": "This link has already been used",
  "code": "ALREADY_USED"
}

// 400 Bad Request - Expired token
{
  "error": "This link has expired",
  "code": "EXPIRED"
}

// 400 Bad Request - Invalid handle format
{
  "error": "Invalid handle format",
  "code": "INVALID_HANDLE_FORMAT",
  "details": "Handle must start with @ and be 2-32 characters"
}

// 500 Internal Server Error
{
  "error": "Database error",
  "code": "DATABASE_ERROR"
}
```

#### 7.1.5 Frontend Changes

**File:** `src/routes/handle/update/[token]/+page.svelte`

**Current Success State:**
```svelte
{:else}
  <h2>Handle updated!</h2>
  <p>Your Telegram handle has been updated to {@formattedHandle}</p>
  <a href="https://t.me/frontiermealsbot">Open Telegram Bot →</a>
{/if}
```

**New Success State:**
```svelte
{:else}
  <h2>Handle updated! ✅</h2>
  <p>Your Telegram handle has been updated to <strong>{formattedHandle}</strong></p>

  {#if result.telegram_link}
    <div class="telegram-link-box">
      <h3>Connect Your Telegram Account</h3>
      <p>Click below to complete the connection:</p>

      <a href={result.telegram_link} class="big-button">
        Open Telegram Bot →
      </a>

      <button on:click={() => copyToClipboard(result.telegram_link)}>
        Copy Link
      </button>

      <code>{result.telegram_link}</code>

      <p class="expiry">This link expires in 7 days</p>
    </div>
  {:else}
    <p>Check your email for your Telegram connection link.</p>
  {/if}
{/if}
```

#### 7.1.6 Implementation Checklist

- [ ] Add token generation logic to `/api/handle/consume`
- [ ] Update response schema to include `telegram_link`
- [ ] Modify frontend to display link in success state
- [ ] Add copy-to-clipboard functionality
- [ ] Update error handling for token creation failures
- [ ] Add integration test for complete flow
- [ ] Update API documentation

---

### 7.2 FIX-003: QR Race Condition Prevention

#### 7.2.1 Problem Analysis

**Current Code:**
```typescript
// Generate JTI
const jti = randomUUID();  // "abc-123"

// Generate JWT
const jwt = await signJWT({ jti });

// Upsert to database
await supabase.from('qr_tokens').upsert({
  customer_id,
  service_date,
  jti
}, { onConflict: 'customer_id,service_date' });

// Send email
await sendQREmail(jwt);
```

**Race Condition Scenario:**

```
Time    Process A                    Process B
----    ---------                    ---------
T0      jti_A = "abc-123"
T1      jwt_A = sign({ jti_A })
T2      upsert({ jti: "abc-123" })
T3                                   jti_B = "def-456"
T4                                   jwt_B = sign({ jti_B })
T5      sendEmail(jwt_A)
T6                                   upsert({ jti: "def-456" })  ← OVERWRITES
T7                                   sendEmail(jwt_B)

Result: Customer has jwt_A in email, but DB has jti_B
        QR redemption FAILS because jti_A not found
```

#### 7.2.2 Solution Design

**Strategy:** Insert-only with unique constraint

**Database Constraint:**
```sql
ALTER TABLE qr_tokens
ADD CONSTRAINT qr_tokens_customer_date_unique
UNIQUE (customer_id, service_date);
```

**New Code:**
```typescript
// Check if QR already exists (idempotency)
const { data: existing } = await supabase
  .from('qr_tokens')
  .select('jti')
  .eq('customer_id', customer_id)
  .eq('service_date', today)
  .maybeSingle();

if (existing) {
  console.log('[QR] Already issued, skipping');
  continue;  // Skip this customer
}

// Generate JTI
const jti = randomUUID();

// Generate JWT
const jwt = await signJWT({ jti });

// INSERT (not upsert) - will fail on duplicate
const { error } = await supabase
  .from('qr_tokens')
  .insert({
    customer_id,
    service_date: today,
    jti,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString()
  });

// Handle constraint violation gracefully
if (error?.code === '23505') {  // unique_violation
  console.log('[QR] Race condition detected, another process created token');
  continue;  // Skip sending email
}

if (error) {
  console.error('[QR] Database error:', error);
  continue;  // Skip this customer, don't fail entire job
}

// Only send email if insert succeeded
await sendQREmail(customer.email, jwt);
```

#### 7.2.3 Sequence Diagram

```
Customer    Cron Job A         Database         Cron Job B        Email Service
   |            |                  |                 |                  |
   |            |─── SELECT ──────►|                 |                  |
   |            |◄── (no rows) ────|                 |                  |
   |            |                  |                 |                  |
   |            |                  |◄─── SELECT ─────|                  |
   |            |                  |──── (no rows) ─►|                  |
   |            |                  |                 |                  |
   |            |─── INSERT ──────►|                 |                  |
   |            |◄── SUCCESS ──────|                 |                  |
   |            |                  |                 |                  |
   |            |                  |◄─── INSERT ─────|                  |
   |            |                  |──── ERROR ─────►|                  |
   |            |                  |   (23505)       |                  |
   |            |                  |                 |                  |
   |            |─────────── Send Email ────────────────────────────────►|
   |◄───────────────────────────── QR Code ───────────────────────────────|
   |            |                  |                 |                  |
   |            |                  |               [SKIPPED]            |
```

#### 7.2.4 Database Migration

**File:** `supabase/migrations/20251108000020_qr_unique_constraint.sql`

```sql
-- Add unique constraint to prevent duplicate QR tokens
-- This prevents race conditions when cron runs concurrently

-- First, check for existing duplicates (shouldn't be any)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT customer_id, service_date, COUNT(*)
    FROM qr_tokens
    GROUP BY customer_id, service_date
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate QR tokens. Must be cleaned before adding constraint.', duplicate_count;
  END IF;
END $$;

-- Add unique constraint
ALTER TABLE qr_tokens
ADD CONSTRAINT qr_tokens_customer_date_unique
UNIQUE (customer_id, service_date);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_qr_tokens_customer_date
ON qr_tokens(customer_id, service_date);

-- Comments
COMMENT ON CONSTRAINT qr_tokens_customer_date_unique ON qr_tokens
IS 'Prevents duplicate QR tokens for same customer and date (race condition protection)';
```

#### 7.2.5 Error Handling Matrix

| Scenario | Error Code | Action | Log Level | User Impact |
|----------|------------|--------|-----------|-------------|
| QR already exists (pre-check) | N/A | Skip customer | INFO | None |
| Constraint violation on insert | 23505 | Skip customer | WARN | None |
| Database connection timeout | 57014 | Skip customer, retry job | ERROR | Delayed QR |
| JWT signing failure | N/A | Skip customer | ERROR | No QR today |
| Email send failure | N/A | Queue for retry | WARN | Delayed QR |
| Invalid customer data | N/A | Skip customer | ERROR | None |

#### 7.2.6 Testing Scenarios

**Unit Tests:**

```typescript
describe('QR Generation - Race Condition', () => {
  test('INSERT fails gracefully on duplicate', async () => {
    // Create first token
    const result1 = await createQRToken(customerId, today);
    expect(result1.success).toBe(true);

    // Attempt duplicate
    const result2 = await createQRToken(customerId, today);
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('DUPLICATE');
  });

  test('Pre-check prevents unnecessary operations', async () => {
    // Create token
    await createQRToken(customerId, today);

    // Attempt again with pre-check
    const result = await processCustomer(customer, today);
    expect(result.status).toBe('SKIPPED');
    expect(result.reason).toBe('QR_EXISTS');
  });
});
```

**Integration Tests:**

```typescript
describe('QR Generation - Concurrent Execution', () => {
  test('Concurrent cron executions create single token', async () => {
    const customer = createTestCustomer();

    // Run two cron jobs simultaneously
    const [result1, result2] = await Promise.all([
      runQRCron([customer]),
      runQRCron([customer])
    ]);

    // Verify only one token created
    const tokens = await getQRTokens(customer.id, today);
    expect(tokens.length).toBe(1);

    // Verify only one email sent
    const emails = await getEmailsSent(customer.email);
    expect(emails.length).toBe(1);
  });
});
```

**Load Tests:**

```bash
# Simulate 100 concurrent cron runs
for i in {1..100}; do
  curl -X GET "https://frontiermeals.com/api/cron/issue-qr" \
    -H "Authorization: Bearer $CRON_SECRET" &
done
wait

# Verify no duplicates in database
psql -c "
  SELECT customer_id, service_date, COUNT(*)
  FROM qr_tokens
  WHERE service_date = CURRENT_DATE
  GROUP BY customer_id, service_date
  HAVING COUNT(*) > 1;
"
# Expected: 0 rows
```

#### 7.2.7 Implementation Checklist

- [ ] Create database migration for unique constraint
- [ ] Run migration on staging database
- [ ] Verify no existing duplicates
- [ ] Update QR cron to use INSERT instead of UPSERT
- [ ] Add pre-check for existing tokens
- [ ] Add error handling for constraint violations
- [ ] Write unit tests for race condition scenarios
- [ ] Write integration tests for concurrent execution
- [ ] Run load test with 100 concurrent cron executions
- [ ] Verify monitoring alerts for skipped customers
- [ ] Update runbook with troubleshooting steps

---

### 7.3 FIX-004: Email Retry Mechanism

#### 7.3.1 Architecture Overview

**Components:**

1. **Email Retry Table** - Stores failed emails for retry
2. **Send Email Function** - Modified to queue failures
3. **Retry Cron Job** - Processes queued emails
4. **Cleanup Function** - Removes old emails

```
┌─────────────────┐
│ Webhook/Cron    │
│  Tries to Send  │
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │ Resend │ ─────► SUCCESS ────► Done
    │  API   │
    └────────┘
         │
         │ FAILURE
         ▼
┌─────────────────┐
│ Insert into     │
│ email_retry     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Retry Cron Job  │─────►│   Resend     │
│  (Every 5 min)  │      │     API      │
└─────────────────┘      └──────────────┘
         │                       │
         │ ◄─────────────────────┘
         │       SUCCESS/FAIL
         ▼
┌─────────────────┐
│ Update Status   │
│  & Schedule     │
│   Next Retry    │
└─────────────────┘
```

#### 7.3.2 Database Schema

**Table:** `email_retry`

```sql
CREATE TABLE email_retry (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,

  -- Email Content
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  template_type TEXT NOT NULL,

  -- Retry Logic
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'abandoned')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,

  -- Metadata
  tags JSONB DEFAULT '[]'::jsonb,
  idempotency_key TEXT UNIQUE
);

-- Indexes for query performance
CREATE INDEX idx_email_retry_pending
  ON email_retry(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_email_retry_customer
  ON email_retry(customer_id);

CREATE INDEX idx_email_retry_created
  ON email_retry(created_at);

-- Auto-cleanup trigger
CREATE OR REPLACE FUNCTION cleanup_old_email_retry()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete sent/abandoned emails older than 30 days
  DELETE FROM email_retry
  WHERE status IN ('sent', 'abandoned')
    AND created_at < NOW() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_email_retry
  AFTER INSERT ON email_retry
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_email_retry();
```

**Field Specifications:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| customer_id | UUID | FOREIGN KEY | Reference to customers table |
| email_to | TEXT | NOT NULL | Recipient email address |
| subject | TEXT | NOT NULL | Email subject line |
| html | TEXT | NOT NULL | Email HTML body |
| template_type | TEXT | NOT NULL | Template identifier (welcome, dunning, etc.) |
| attempts | INT | DEFAULT 0 | Number of send attempts made |
| max_attempts | INT | DEFAULT 5 | Maximum retry attempts before abandoning |
| next_attempt_at | TIMESTAMPTZ | NOT NULL | When to next attempt send |
| last_attempt_at | TIMESTAMPTZ | NULL | Timestamp of last attempt |
| last_error | TEXT | NULL | Error message from last failed attempt |
| status | TEXT | CHECK constraint | Current status: pending, sent, abandoned |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | When email was queued |
| sent_at | TIMESTAMPTZ | NULL | When email was successfully sent |
| tags | JSONB | DEFAULT '[]' | Resend API tags for categorization |
| idempotency_key | TEXT | UNIQUE | Prevents duplicate queue entries |

#### 7.3.3 Retry Algorithm

**Exponential Backoff Schedule:**

| Attempt | Wait Time | Cumulative Time | Rationale |
|---------|-----------|-----------------|-----------|
| 1 | 0 min | 0 min | Immediate first attempt |
| 2 | 5 min | 5 min | Quick retry for transient errors |
| 3 | 15 min | 20 min | Medium wait for service recovery |
| 4 | 60 min | 1h 20min | Longer wait for extended outages |
| 5 | 240 min | 5h 20min | Final attempt before abandonment |

**Backoff Calculation:**
```typescript
function calculateNextAttempt(currentAttempts: number): Date {
  const backoffMinutes = [0, 5, 15, 60, 240];
  const waitMinutes = backoffMinutes[Math.min(currentAttempts, backoffMinutes.length - 1)];
  return new Date(Date.now() + waitMinutes * 60 * 1000);
}
```

**Pseudocode:**
```
FUNCTION retryEmail(emailRecord):
  IF emailRecord.attempts >= emailRecord.max_attempts THEN
    UPDATE email_retry
    SET status = 'abandoned'
    WHERE id = emailRecord.id

    ALERT ops team via Telegram
    RETURN 'ABANDONED'
  END IF

  TRY
    CALL Resend API with emailRecord.html

    UPDATE email_retry
    SET status = 'sent',
        sent_at = NOW()
    WHERE id = emailRecord.id

    RETURN 'SENT'

  CATCH error
    nextAttempt = calculateNextAttempt(emailRecord.attempts + 1)

    UPDATE email_retry
    SET attempts = attempts + 1,
        last_attempt_at = NOW(),
        last_error = error.message,
        next_attempt_at = nextAttempt
    WHERE id = emailRecord.id

    RETURN 'RETRY_SCHEDULED'
  END TRY
END FUNCTION
```

#### 7.3.4 Modified Send Email Function

**File:** `src/lib/email/send.ts`

**Current Implementation:**
```typescript
export async function sendEmail(params: EmailParams) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Frontier Meals <meals@frontiermeals.com>',
      to: [params.to],
      subject: params.subject,
      html: params.html,
      tags: params.tags
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error: ${response.status}`);
  }

  return await response.json();
}
```

**New Implementation:**
```typescript
import { getSupabase } from '$lib/db/supabase';

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
  customerId?: string;
  templateType?: string;
  idempotencyKey?: string;
}

export async function sendEmail(params: EmailParams): Promise<{ id: string } | null> {
  try {
    // Attempt to send email
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey || `${Date.now()}-${params.to}`
      },
      body: JSON.stringify({
        from: 'Frontier Meals <meals@frontiermeals.com>',
        to: [params.to],
        subject: params.subject,
        html: params.html,
        tags: params.tags || []
      })
    });

    if (!response.ok) {
      throw new Error(`Resend API error: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    console.log('[EMAIL] Sent successfully:', { id: result.id, to: params.to });
    return result;

  } catch (error) {
    // Email send failed - queue for retry
    console.error('[EMAIL] Send failed, queueing for retry:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      to: params.to,
      subject: params.subject
    });

    // Queue email for retry
    const supabase = getSupabase();

    const { error: queueError } = await supabase
      .from('email_retry')
      .insert({
        customer_id: params.customerId || null,
        email_to: params.to,
        subject: params.subject,
        html: params.html,
        template_type: params.templateType || 'unknown',
        tags: params.tags || [],
        idempotency_key: params.idempotencyKey,
        next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Retry in 5 min
        last_error: error instanceof Error ? error.message : 'Unknown error',
        attempts: 0
      });

    if (queueError) {
      console.error('[EMAIL] Failed to queue email for retry:', queueError);
    } else {
      console.log('[EMAIL] Queued for retry:', { to: params.to });
    }

    // Return null to indicate failure (caller can check and handle)
    return null;
  }
}
```

#### 7.3.5 Retry Cron Job

**File:** `src/routes/api/cron/process-email-retry/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { getSupabase } from '$lib/db/supabase';
import { sendEmail } from '$lib/email/send';

export const GET: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[EMAIL RETRY CRON] Starting email retry processing');

  const supabase = getSupabase();
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let abandoned = 0;

  try {
    // Fetch pending emails ready for retry
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('email_retry')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(100);  // Process 100 at a time

    if (fetchError) {
      console.error('[EMAIL RETRY CRON] Error fetching pending emails:', fetchError);
      return json({ error: 'Database error' }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('[EMAIL RETRY CRON] No pending emails to process');
      return json({ processed: 0, sent: 0, failed: 0, abandoned: 0 });
    }

    console.log(`[EMAIL RETRY CRON] Processing ${pendingEmails.length} pending emails`);

    for (const emailRecord of pendingEmails) {
      processed++;

      // Check if max attempts reached
      if (emailRecord.attempts >= emailRecord.max_attempts) {
        // Abandon email
        await supabase
          .from('email_retry')
          .update({
            status: 'abandoned',
            last_attempt_at: new Date().toISOString()
          })
          .eq('id', emailRecord.id);

        abandoned++;
        console.error(`[EMAIL RETRY CRON] Abandoned email ${emailRecord.id} after ${emailRecord.attempts} attempts`);

        // TODO: Alert ops via Telegram
        continue;
      }

      // Attempt to send email
      try {
        // NOTE: We call the raw Resend API here, not our sendEmail wrapper
        // to avoid infinite retry loop
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': emailRecord.idempotency_key || `retry/${emailRecord.id}`
          },
          body: JSON.stringify({
            from: 'Frontier Meals <meals@frontiermeals.com>',
            to: [emailRecord.email_to],
            subject: emailRecord.subject,
            html: emailRecord.html,
            tags: emailRecord.tags || []
          })
        });

        if (!response.ok) {
          throw new Error(`Resend API error: ${response.status}`);
        }

        // Email sent successfully
        await supabase
          .from('email_retry')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString()
          })
          .eq('id', emailRecord.id);

        sent++;
        console.log(`[EMAIL RETRY CRON] Sent email ${emailRecord.id} to ${emailRecord.email_to}`);

      } catch (error) {
        // Send failed - schedule next retry
        const nextAttemptMinutes = calculateBackoff(emailRecord.attempts + 1);
        const nextAttemptAt = new Date(Date.now() + nextAttemptMinutes * 60 * 1000);

        await supabase
          .from('email_retry')
          .update({
            attempts: emailRecord.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: error instanceof Error ? error.message : 'Unknown error',
            next_attempt_at: nextAttemptAt.toISOString()
          })
          .eq('id', emailRecord.id);

        failed++;
        console.error(`[EMAIL RETRY CRON] Email ${emailRecord.id} failed, retry ${emailRecord.attempts + 1}/${emailRecord.max_attempts} in ${nextAttemptMinutes}min`);
      }
    }

    console.log(`[EMAIL RETRY CRON] Complete. Processed: ${processed}, Sent: ${sent}, Failed: ${failed}, Abandoned: ${abandoned}`);

    return json({ processed, sent, failed, abandoned });

  } catch (error) {
    console.error('[EMAIL RETRY CRON] Unexpected error:', error);
    return json({ error: 'Internal error' }, { status: 500 });
  }
};

function calculateBackoff(attempts: number): number {
  const backoffSchedule = [5, 15, 60, 240]; // minutes
  return backoffSchedule[Math.min(attempts - 1, backoffSchedule.length - 1)];
}
```

#### 7.3.6 Cron Schedule Configuration

**File:** `wrangler.toml`

```toml
# Email retry processor
# Runs every 5 minutes to process failed emails
[[triggers.crons]]
route = "/api/cron/process-email-retry"
schedule = "*/5 * * * *"
```

**Cron Expression Breakdown:**
- `*/5` - Every 5 minutes
- `*` - Every hour
- `*` - Every day
- `*` - Every month
- `*` - Every day of week

**Rationale:**
- 5-minute interval ensures timely retries
- Balances between responsiveness and API rate limits
- Allows first retry within SLA (5 min after failure)

#### 7.3.7 Monitoring and Alerting

**Metrics to Track:**

| Metric | Measurement | Alert Threshold |
|--------|-------------|-----------------|
| Queue depth | COUNT(*) WHERE status='pending' | > 100 emails |
| Abandoned rate | COUNT(*) WHERE status='abandoned' / total | > 1% |
| Retry success rate | sent / (sent + abandoned) | < 95% |
| Average time to send | AVG(sent_at - created_at) | > 1 hour |
| Oldest pending email | MIN(created_at) WHERE status='pending' | > 6 hours |

**Query Examples:**

```sql
-- Queue depth
SELECT COUNT(*) as queue_depth
FROM email_retry
WHERE status = 'pending';

-- Abandoned emails in last 24 hours
SELECT COUNT(*) as abandoned_count
FROM email_retry
WHERE status = 'abandoned'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Average time to successful delivery
SELECT
  template_type,
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) / 60 as avg_minutes
FROM email_retry
WHERE status = 'sent'
  AND sent_at > NOW() - INTERVAL '7 days'
GROUP BY template_type;

-- Emails stuck in queue
SELECT
  id,
  email_to,
  template_type,
  attempts,
  created_at,
  next_attempt_at,
  last_error
FROM email_retry
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '6 hours'
ORDER BY created_at ASC;
```

#### 7.3.8 Implementation Checklist

- [ ] Create `email_retry` table migration
- [ ] Add cleanup trigger function
- [ ] Run migration on staging database
- [ ] Modify `sendEmail()` function to queue failures
- [ ] Create retry cron endpoint
- [ ] Add cron schedule to wrangler.toml
- [ ] Update all email send calls to include `customerId` and `templateType`
- [ ] Write unit tests for backoff calculation
- [ ] Write integration tests for retry logic
- [ ] Set up monitoring queries in admin panel
- [ ] Configure alerting for abandoned emails
- [ ] Document ops runbook for email failures
- [ ] Test with simulated Resend outage

---

## 8. Testing Requirements

### 8.1 Unit Tests

#### 8.1.1 FIX-002: Handle Update

```typescript
describe('Handle Update - Token Generation', () => {
  test('generates new deep link on successful handle update', async () => {
    const result = await updateHandle(validToken, '@newhandle');
    expect(result.success).toBe(true);
    expect(result.telegram_link).toMatch(/^https:\/\/t\.me\/frontiermealsbot\?start=/);
  });

  test('returns error for already-used token', async () => {
    await updateHandle(validToken, '@newhandle');
    const result = await updateHandle(validToken, '@anotherhandle');
    expect(result.error).toBe('This link has already been used');
    expect(result.code).toBe('ALREADY_USED');
  });

  test('validates handle format', async () => {
    const result = await updateHandle(validToken, 'noatsign');
    expect(result.error).toContain('Invalid handle format');
    expect(result.code).toBe('INVALID_HANDLE_FORMAT');
  });
});
```

#### 8.1.2 FIX-003: QR Race Condition

```typescript
describe('QR Generation - Idempotency', () => {
  test('pre-check skips existing QR tokens', async () => {
    await createQRToken(customerId, today);
    const result = await processCustomerQR(customer, today);
    expect(result.status).toBe('SKIPPED');
  });

  test('constraint violation handled gracefully', async () => {
    await createQRToken(customerId, today);
    const result = await insertQRToken(customerId, today, jti);
    expect(result.error?.code).toBe('23505');
  });
});
```

#### 8.1.3 FIX-004: Email Retry

```typescript
describe('Email Retry - Backoff Calculation', () => {
  test('calculates correct backoff intervals', () => {
    expect(calculateBackoff(1)).toBe(5);
    expect(calculateBackoff(2)).toBe(15);
    expect(calculateBackoff(3)).toBe(60);
    expect(calculateBackoff(4)).toBe(240);
    expect(calculateBackoff(5)).toBe(240); // caps at max
  });

  test('queues failed email for retry', async () => {
    mockResendFailure();
    const result = await sendEmail({ to: 'test@example.com', ... });
    expect(result).toBeNull();

    const queued = await getQueuedEmails();
    expect(queued.length).toBe(1);
    expect(queued[0].email_to).toBe('test@example.com');
  });
});
```

### 8.2 Integration Tests

#### 8.2.1 End-to-End Handle Update Flow

```typescript
describe('Handle Update - E2E', () => {
  test('complete flow from handle correction to Telegram link', async () => {
    // 1. User completes checkout with typo
    const session = await createCheckoutSession({ telegram_handle: '@wronghandle' });

    // 2. Webhook processes, sends correction email
    await processCheckoutWebhook(session);

    // 3. User clicks correction link, updates handle
    const updateResponse = await fetch('/api/handle/consume', {
      method: 'POST',
      body: JSON.stringify({ token: updateToken, newHandle: '@correcthandle' })
    });

    expect(updateResponse.ok).toBe(true);
    const data = await updateResponse.json();

    // 4. Verify new Telegram link returned
    expect(data.telegram_link).toBeDefined();
    expect(data.telegram_link).toMatch(/frontiermealsbot/);

    // 5. Verify token stored in database
    const tokens = await getDeepLinkTokens(customerId);
    expect(tokens.length).toBe(2); // original + new

    // 6. Verify handle updated
    const customer = await getCustomer(customerId);
    expect(customer.telegram_handle).toBe('@correcthandle');
  });
});
```

#### 8.2.2 QR Race Condition Simulation

```typescript
describe('QR Generation - Concurrent Execution', () => {
  test('100 concurrent cron runs produce single QR', async () => {
    const customer = await createTestCustomer();
    const today = '2025-11-08';

    // Simulate 100 concurrent cron executions
    const promises = Array(100).fill(null).map(() =>
      processCustomerQR(customer, today)
    );

    await Promise.all(promises);

    // Verify exactly one token created
    const tokens = await getQRTokens(customer.id, today);
    expect(tokens.length).toBe(1);

    // Verify exactly one email sent
    const emails = await getTestEmails(customer.email);
    const qrEmails = emails.filter(e => e.subject.includes('QR'));
    expect(qrEmails.length).toBe(1);
  });
});
```

#### 8.2.3 Email Retry Flow

```typescript
describe('Email Retry - E2E', () => {
  test('failed email eventually succeeds after retry', async () => {
    // Mock Resend to fail twice, then succeed
    let attempts = 0;
    mockResend(() => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return { id: 're_success' };
    });

    // 1. Initial send fails
    const result = await sendEmail({ to: 'test@example.com', ... });
    expect(result).toBeNull();

    // 2. Verify queued
    let queued = await getQueuedEmails();
    expect(queued.length).toBe(1);
    expect(queued[0].attempts).toBe(0);

    // 3. First retry fails
    await runEmailRetryCron();
    queued = await getQueuedEmails();
    expect(queued[0].attempts).toBe(1);
    expect(queued[0].status).toBe('pending');

    // 4. Second retry fails
    await advanceTime(15 * 60 * 1000); // 15 minutes
    await runEmailRetryCron();
    queued = await getQueuedEmails();
    expect(queued[0].attempts).toBe(2);

    // 5. Third retry succeeds
    await advanceTime(60 * 60 * 1000); // 60 minutes
    await runEmailRetryCron();
    queued = await getQueuedEmails();
    expect(queued.length).toBe(0); // Removed from queue

    const sent = await getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].status).toBe('sent');
  });
});
```

### 8.3 Load Tests

#### 8.3.1 QR Generation Under Load

**Test:** 1000 customers, 10 concurrent cron instances

```bash
#!/bin/bash
# File: tests/load/qr-concurrent.sh

echo "Creating 1000 test customers..."
psql -c "
  INSERT INTO customers (email, name, stripe_customer_id)
  SELECT
    'test-' || id || '@example.com',
    'Test Customer ' || id,
    'cus_test_' || id
  FROM generate_series(1, 1000) AS id;
"

echo "Running 10 concurrent cron jobs..."
for i in {1..10}; do
  curl -X GET "https://staging.frontiermeals.com/api/cron/issue-qr" \
    -H "Authorization: Bearer $CRON_SECRET" \
    --silent --output /dev/null &
done

wait

echo "Verifying no duplicates..."
DUPLICATES=$(psql -t -c "
  SELECT COUNT(*)
  FROM (
    SELECT customer_id, service_date, COUNT(*)
    FROM qr_tokens
    WHERE service_date = CURRENT_DATE
    GROUP BY customer_id, service_date
    HAVING COUNT(*) > 1
  ) AS dups;
")

if [ "$DUPLICATES" -eq 0 ]; then
  echo "✓ PASS: No duplicates found"
  exit 0
else
  echo "✗ FAIL: Found $DUPLICATES duplicate QR tokens"
  exit 1
fi
```

#### 8.3.2 Email Retry Under Load

**Test:** 500 failed emails, verify 99%+ eventual delivery

```typescript
describe('Email Retry - Load Test', () => {
  test('handles 500 failed emails with 99%+ delivery rate', async () => {
    // Create 500 failed emails
    const failedEmails = Array(500).fill(null).map((_, i) => ({
      email_to: `test-${i}@example.com`,
      subject: 'Test Email',
      html: '<p>Test</p>',
      template_type: 'test'
    }));

    // Queue all emails
    await queueEmails(failedEmails);

    // Mock Resend with 10% failure rate
    mockResendWithFailureRate(0.1);

    // Run retry cron 5 times (simulating 5 retry windows)
    for (let i = 0; i < 5; i++) {
      await advanceTime(60 * 60 * 1000); // 1 hour
      await runEmailRetryCron();
    }

    // Verify delivery rate
    const sent = await getSentEmails();
    const abandoned = await getAbandonedEmails();

    const deliveryRate = sent.length / (sent.length + abandoned.length);
    expect(deliveryRate).toBeGreaterThan(0.99);
    expect(abandoned.length).toBeLessThan(5); // < 1% abandoned
  });
});
```

---

## 9. Deployment Procedures

### 9.1 Pre-Deployment Checklist

**Database Readiness:**
- [ ] Staging database migrations tested and verified
- [ ] Production database backup completed
- [ ] Migration scripts reviewed for performance impact
- [ ] Rollback scripts prepared

**Code Review:**
- [ ] All code changes peer-reviewed
- [ ] Unit tests passing (100% coverage on new code)
- [ ] Integration tests passing
- [ ] Load tests passing
- [ ] Security review completed

**Dependencies:**
- [ ] No new external service dependencies
- [ ] All environment variables documented
- [ ] Cron schedules validated

### 9.2 Deployment Sequence

**Phase 1: Database Migration (30 minutes)**

```bash
# 1. Create backup
pg_dump -h $PROD_DB_HOST -U $PROD_DB_USER -d frontier_meals > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Verify no duplicates before adding constraint
psql -h $PROD_DB_HOST -U $PROD_DB_USER -d frontier_meals -c "
  SELECT COUNT(*) FROM (
    SELECT customer_id, service_date, COUNT(*)
    FROM qr_tokens
    GROUP BY customer_id, service_date
    HAVING COUNT(*) > 1
  ) AS dups;
"
# Expected: 0

# 3. Run migrations
supabase db push

# 4. Verify constraints applied
psql -h $PROD_DB_HOST -U $PROD_DB_USER -d frontier_meals -c "
  SELECT conname, contype
  FROM pg_constraint
  WHERE conrelid = 'qr_tokens'::regclass;
"
```

**Phase 2: Code Deployment (15 minutes)**

```bash
# 1. Build application
pnpm run build

# 2. Deploy to staging
npx wrangler pages deploy --project-name=frontier-meals-staging

# 3. Run smoke tests on staging
npm run test:e2e:staging

# 4. Deploy to production
npx wrangler pages deploy --project-name=frontier-meals

# 5. Verify deployment
curl https://frontiermeals.com/api/health
```

**Phase 3: Verification (15 minutes)**

```bash
# 1. Trigger QR cron manually
curl -X GET https://frontiermeals.com/api/cron/issue-qr \
  -H "Authorization: Bearer $CRON_SECRET"

# 2. Check for constraint violations in logs
# (Should see "QR already issued, skipping" for existing customers)

# 3. Trigger email retry cron
curl -X GET https://frontiermeals.com/api/cron/process-email-retry \
  -H "Authorization: Bearer $CRON_SECRET"

# 4. Verify email retry queue is empty
psql -c "SELECT COUNT(*) FROM email_retry WHERE status = 'pending';"
```

### 9.3 Rollback Procedure

**If critical issues detected:**

```bash
# 1. Revert application deployment
npx wrangler pages deployment list
npx wrangler pages deployment rollback <previous-deployment-id>

# 2. Remove database constraints (if needed)
psql -c "ALTER TABLE qr_tokens DROP CONSTRAINT qr_tokens_customer_date_unique;"

# 3. Restore database backup (nuclear option)
psql < backup_YYYYMMDD_HHMMSS.sql

# 4. Notify team
echo "Deployment rolled back. Incident report required."
```

---

## 10. Acceptance Criteria

### 10.1 FIX-002: Handle Update

**Success Criteria:**

- [ ] User can update Telegram handle via correction link
- [ ] New deep link token is generated and returned in response
- [ ] Token is valid for 7 days
- [ ] Token is stored hashed in database
- [ ] Frontend displays new Telegram link prominently
- [ ] Copy-to-clipboard functionality works
- [ ] Error messages are user-friendly
- [ ] Old token cannot be reused

**Performance Criteria:**

- [ ] p95 response time < 2 seconds
- [ ] Zero database deadlocks
- [ ] 100% of handle updates succeed (no data loss)

**Test Case:**
```
Given: User received handle correction email
When: User clicks link and submits correct handle
Then:
  - Handle is updated in database
  - New Telegram deep link is displayed
  - User can copy link to clipboard
  - Link is valid for 7 days
```

### 10.2 FIX-003: QR Race Condition

**Success Criteria:**

- [ ] No duplicate QR tokens generated for same customer/date
- [ ] Unique constraint prevents database-level duplicates
- [ ] Cron job handles constraint violations gracefully
- [ ] Only one email sent per customer per day
- [ ] Logs clearly indicate when duplicates are prevented
- [ ] Load test with 100 concurrent crons produces single token

**Performance Criteria:**

- [ ] QR cron completes in < 5 minutes for 1000 customers
- [ ] Zero customer-facing errors
- [ ] 100% of active customers receive exactly one QR

**Test Case:**
```
Given: QR cron job is scheduled
When: Two instances start simultaneously for same customer
Then:
  - Only one QR token is created in database
  - Only one email is sent to customer
  - Second instance logs "QR already issued, skipping"
  - No errors thrown
```

### 10.3 FIX-004: Email Retry

**Success Criteria:**

- [ ] Failed email sends are queued automatically
- [ ] Retry cron processes queue every 5 minutes
- [ ] Exponential backoff schedule is followed
- [ ] Emails retry up to 5 times before abandonment
- [ ] Successful sends update status to 'sent'
- [ ] Abandoned emails are flagged for manual review
- [ ] No email duplicates sent (idempotency maintained)

**Performance Criteria:**

- [ ] 99.9% eventual delivery rate (after retries)
- [ ] Average time to delivery < 1 hour
- [ ] Queue depth < 100 emails under normal operation
- [ ] Abandoned rate < 1%

**Test Case:**
```
Given: Resend API is experiencing an outage
When: System attempts to send onboarding email
Then:
  - Email is queued with status 'pending'
  - First retry occurs after 5 minutes
  - Retries continue with backoff schedule
  - Email is delivered when service recovers
  - Customer receives exactly one email
```

---

## Appendix A: SQL Migrations

### A.1 FIX-003: QR Unique Constraint

**File:** `supabase/migrations/20251108000020_qr_unique_constraint.sql`

```sql
-- Add unique constraint to prevent duplicate QR tokens
-- This prevents race conditions when cron runs concurrently

-- First, check for existing duplicates (shouldn't be any)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT customer_id, service_date, COUNT(*)
    FROM qr_tokens
    GROUP BY customer_id, service_date
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate QR tokens. Must be cleaned before adding constraint.', duplicate_count;
  END IF;
END $$;

-- Add unique constraint
ALTER TABLE qr_tokens
ADD CONSTRAINT qr_tokens_customer_date_unique
UNIQUE (customer_id, service_date);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_qr_tokens_customer_date
ON qr_tokens(customer_id, service_date);

-- Comments
COMMENT ON CONSTRAINT qr_tokens_customer_date_unique ON qr_tokens
IS 'Prevents duplicate QR tokens for same customer and date (race condition protection)';
```

### A.2 FIX-004: Email Retry Table

**File:** `supabase/migrations/20251108000021_email_retry_table.sql`

```sql
-- Email retry queue for failed email sends
-- Supports automatic retry with exponential backoff

CREATE TABLE email_retry (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,

  -- Email Content
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  template_type TEXT NOT NULL,

  -- Retry Logic
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'abandoned')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,

  -- Metadata
  tags JSONB DEFAULT '[]'::jsonb,
  idempotency_key TEXT UNIQUE
);

-- Indexes for query performance
CREATE INDEX idx_email_retry_pending
  ON email_retry(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_email_retry_customer
  ON email_retry(customer_id);

CREATE INDEX idx_email_retry_created
  ON email_retry(created_at);

-- Auto-cleanup trigger
CREATE OR REPLACE FUNCTION cleanup_old_email_retry()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete sent/abandoned emails older than 30 days
  DELETE FROM email_retry
  WHERE status IN ('sent', 'abandoned')
    AND created_at < NOW() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_email_retry
  AFTER INSERT ON email_retry
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_email_retry();

-- Comments
COMMENT ON TABLE email_retry IS 'Queue for email sending with retry logic';
COMMENT ON COLUMN email_retry.status IS 'pending = not sent yet, sent = delivered, abandoned = gave up after max retries';
COMMENT ON COLUMN email_retry.next_attempt_at IS 'When to retry sending (exponential backoff)';
COMMENT ON COLUMN email_retry.idempotency_key IS 'Prevents duplicate queue entries for same email';
```

---

## Appendix B: Monitoring Queries

### B.1 Email Retry Queue Health

```sql
-- Queue depth by status
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM email_retry
GROUP BY status;

-- Emails stuck in queue (>6 hours)
SELECT
  id,
  email_to,
  template_type,
  attempts,
  created_at,
  AGE(NOW(), created_at) as age,
  next_attempt_at,
  last_error
FROM email_retry
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '6 hours'
ORDER BY created_at ASC;

-- Retry success rate (last 24 hours)
SELECT
  template_type,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'sent') /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('sent', 'abandoned')), 0),
    2
  ) as success_rate_pct
FROM email_retry
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY template_type;
```

### B.2 QR Generation Health

```sql
-- QR tokens generated today
SELECT
  COUNT(*) as total_qr_tokens,
  COUNT(DISTINCT customer_id) as unique_customers
FROM qr_tokens
WHERE service_date = CURRENT_DATE;

-- Duplicate check (should always be 0)
SELECT
  customer_id,
  service_date,
  COUNT(*) as duplicate_count
FROM qr_tokens
WHERE service_date = CURRENT_DATE
GROUP BY customer_id, service_date
HAVING COUNT(*) > 1;

-- QR redemption rate
SELECT
  COUNT(*) FILTER (WHERE used_at IS NOT NULL) as redeemed,
  COUNT(*) FILTER (WHERE used_at IS NULL) as unredeemed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE used_at IS NOT NULL) / COUNT(*),
    2
  ) as redemption_rate_pct
FROM qr_tokens
WHERE service_date = CURRENT_DATE;
```

---

**END OF SPECIFICATION**
