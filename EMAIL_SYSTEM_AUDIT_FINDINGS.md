# Email System - Audit Findings

**Audit Date:** 2026-02-02
**Status:** WAVE 1 COMPLETE - ALL CRITICAL ISSUES RESOLVED ✅

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 (2 resolved) |
| Warnings | 5 |
| Positive | 5 |

---

## CRITICAL ISSUES (0 remaining - 2 resolved)

### C1. HTML Injection Vulnerability in schedule-change Template ✅ RESOLVED
**File:** `src/lib/email/templates/schedule-change.ts` (line 49)
**Impact:** Remote Code Execution via Email
**Resolution:** Created `src/lib/email/templates/utils.ts` with `escapeHtml()` function that escapes &, <, >, ", '. Applied escaping in `textToHtml()` before HTML insertion.

~~The `textToHtml()` function performs unsafe string concatenation:~~
```typescript
// FIXED: Now uses escapeHtml() before inserting user content
.map(para => `<p style="${styles.p}">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
```

### C2. Variable Injection Vulnerability in Template Replacement ✅ RESOLVED
**File:** `src/lib/email/templates/index.ts` (lines 67-77)
**Impact:** Template Injection
**Resolution:** Modified `replaceVariables()` to escape all variable values using `escapeHtml()` before replacement.

~~The `replaceVariables()` function performs naive string replacement without HTML escaping:~~
```typescript
// FIXED: Now escapes all variable values
return escapeHtml(variables[trimmedName]);
```

---

## WARNING ISSUES (5)

### W1. No Email Address Validation
**File:** `src/lib/email/send.ts` (lines 39-45)
**Impact:** Email injection / invalid sends

No regex validation or SMTP header injection prevention at application layer.

### W2. PII Logged in email_retry Table
**File:** Migration for email_retry table
**Impact:** Sensitive data exposure

Full email addresses and HTML body stored in plaintext. No retention policy.

### W3. Weak Idempotency Key Generation
**File:** `src/lib/cron/issue-qr.ts` (line 370)
**Impact:** Potential duplicate emails

Predictable format: `qr_daily/${customer.id}/${today}` instead of cryptographically random.

### W4. No Rate Limiting on Email Sends
**File:** `src/lib/email/send.ts`
**Impact:** DoS / spam potential

No per-admin or per-recipient email limits.

### W5. PII in Application Logs
**File:** `src/lib/email/send.ts`, `src/lib/cron/issue-qr.ts`
**Impact:** Information disclosure

Full email addresses logged to console.

---

## POSITIVE FINDINGS (5)

1. **Strong Exponential Backoff** - 5min → 15min → 60min → 240min retry delays
2. **Idempotency Key Support** - Resend integration with database unique constraint
3. **No Attachment Injection** - Type system + Base64 encoding
4. **Template Structure Defensible** - Code templates hardcoded, DB templates support replacement
5. **Admin Authentication Required** - CSRF validation + session check on template operations

---

## Recommended Fixes (Priority Order)

### Immediate (Critical)
1. Add HTML escaping to `textToHtml()` function
2. Add HTML escaping to `replaceVariables()` function
3. Add email validation regex in `sendEmail()`

### Short-Term (Warnings)
4. Mask PII in logs using `redactPII()` utility
5. Add rate limiting to `sendEmail()` and `sendBatchEmails()`
6. Strengthen idempotency keys with UUID
7. Add data retention policy to email_retry table

### Long-Term
8. Add content security policy headers to emails
9. Implement audit logging for template modifications
10. Add encryption at rest for email_retry table
