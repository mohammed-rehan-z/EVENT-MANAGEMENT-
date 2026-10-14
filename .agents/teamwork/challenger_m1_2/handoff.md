# Handoff Report: Adversarial Verification of Schema DDL, Security Specifications & Cryptography

**Agent:** challenger_m1_2  
**Date:** 2026-10-14T16:28:00Z  
**Verdict:** `REQUEST_CHANGES`

---

## 1. Observation

Direct observations from inspecting `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`, `ORIGINAL_REQUEST.md`, and `PROJECT.md`:

### Observation 1: Foreign Key & NOT NULL Constraint on `audit_logs.event_id`
- **File:** `docs/DATABASE_SCHEMA.md`, lines 225-238:
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action TEXT NOT NULL,
    severity audit_severity_type NOT NULL DEFAULT 'INFO',
    actor_id TEXT NOT NULL,
    actor_role actor_role_type NOT NULL DEFAULT 'SYSTEM',
    target_id TEXT,
    target_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);
```
- **Contrast with `docs/SECURITY.md` Section 8 (Table 8, lines 320-322):**
  - `AUTH_LOGIN_SUCCESS` (INFO): "User logs in successfully" -> Telemetry: `User ID, role, client IP, user agent` (No `event_id`).
  - `AUTH_LOGIN_FAILURE` (WARNING): "Invalid credentials entered" -> Telemetry: `Email, client IP, user agent` (No `event_id`).
  - `AUTH_LOCKOUT` (CRITICAL): "5 consecutive login failures" -> Telemetry: `Email, client IP, lockout expiration` (No `event_id`).

### Observation 2: Cryptographic Salt Length Discrepancy
- **File:** `docs/SECURITY.md`, lines 48 & 63:
```markdown
- Salt Generation: 16 bytes (128 bits) of cryptographically secure random entropy generated via Node.js crypto.randomBytes(16).
```
```typescript
const salt = saltHex || crypto.randomBytes(16).toString("hex");
```
- **File:** `docs/DATABASE_SCHEMA.md`, line 72:
```sql
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';
```
- **Contrast with Mission Prompt (DISPATCH.md):**
> "2. Stress-test cryptographic specifications in docs/SECURITY.md: verify key derivation parameters (PBKDF2 iterations >= 100,000, 32-byte salt, 64-byte key length; or scrypt N=16384, r=8, p=1)"

### Observation 3: Encoding Mismatch in SECQR Verification Pipeline
- **File:** `docs/SECURITY.md`, line 133 specifies:
```
SECQR:<Base64UrlEncodedJSON>
```
- **File:** `docs/SECURITY.md`, lines 181-182 implements:
```typescript
const base64Str = clean.slice(6);
const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
```
In Node.js, `Buffer.from(str, "base64")` fails to decode standard RFC 4648 Base64URL strings containing `-` and `_` characters without padding `=`. Node.js natively provides `Buffer.from(str, "base64url")`.

### Observation 4: Session Token Verification Missing Constant-Time Comparison & Expiration Unit Ambiguity
- **File:** `docs/SECURITY.md`, lines 105-106:
```json
"issuedAt": 1728921600,
"expiresAt": 1729526400
```
- **File:** `docs/IMPLEMENTATION_PLAN.md`, lines 230-231:
```typescript
issuedAt: number;
expiresAt: number;
```
`expiresAt` is specified in Unix epoch seconds (10 digits). JavaScript `Date.now()` produces epoch milliseconds (13 digits). Furthermore, neither `docs/SECURITY.md` nor `docs/IMPLEMENTATION_PLAN.md` provides an implementation of `verifySessionToken`, nor do they mandate `crypto.timingSafeEqual` for session token HMAC signature validation.

### Observation 5: Brute-Force Rate Limiting Key Vulnerability
- **File:** `docs/SECURITY.md`, lines 119-120:
```markdown
- Identifier: Composite key `${clientIp}:${email.toLowerCase()}`.
- Threshold: Maximum 5 failed authentication attempts within a 15-minute (900 seconds) sliding window.
```

### Observation 6: Interface Contract Discrepancy between `PROJECT.md` and `docs/SECURITY.md`
- **File:** `PROJECT.md`, line 72:
```typescript
verifySecureQRPayload(rawPayload: string): { valid: boolean; isSignedPayload: boolean; token?: string; error?: string }
```
- **File:** `docs/SECURITY.md`, lines 157-165 & `docs/IMPLEMENTATION_PLAN.md`, lines 265-273:
```typescript
export interface QRVerificationResult {
  valid: boolean;
  isSignedPayload: boolean;
  tamperDetected?: boolean;
  isExpired?: boolean;
  teamId?: string;
  eventId?: string;
  errorMessage?: string;
}
```

### Observation 7: PostgreSQL RLS Policy for `audit_logs` Restricts INSERT to Authenticated Only
- **File:** `docs/DATABASE_SCHEMA.md`, lines 408-409:
```sql
CREATE POLICY p_audit_logs_system_insert ON audit_logs 
    FOR INSERT TO authenticated WITH CHECK (TRUE);
```

---

## 2. Logic Chain

1. **Failure of System-Level Audit Telemetry (Observation 1):**
   - When a user attempts to authenticate at `/` (login), the user is not yet associated with any specific event.
   - If authentication fails, or account lockout triggers, or an admin logs in, `audit_logs` must record `AUTH_LOGIN_FAILURE` or `AUTH_LOCKOUT`.
   - In PostgreSQL, inserting a record into `audit_logs` where `event_id` is omitted or `NULL` will immediately trigger: `null value in column "event_id" violates not-null constraint`.
   - Passing a dummy event UUID will trigger: `violates foreign key constraint "audit_logs_event_id_fkey"`.
   - Consequently, the system cannot persist authentication security logs to PostgreSQL as required by `SECURITY.md §8`.

2. **Violation of Mandated Cryptographic Salt Strength (Observation 2):**
   - The mission instructions explicitly mandate: `PBKDF2 iterations >= 100,000, 32-byte salt, 64-byte key length`.
   - `docs/SECURITY.md` and `docs/DATABASE_SCHEMA.md` specify `crypto.randomBytes(16)` (16 bytes / 128 bits).
   - A 16-byte salt produces only 32 hex characters. For SHA-512 with 64-byte keys, a 32-byte (256-bit) salt is required to match the cryptographic security parameter mandated in the dispatch.

3. **Gate Scan Rejections from Base64Url Mismatch (Observation 3):**
   - `docs/SECURITY.md` defines the QR payload format as `SECQR:<Base64UrlEncodedJSON>`.
   - Base64Url replaces `+` with `-` and `/` with `_`, and omits `=` padding.
   - When `Buffer.from(base64Str, "base64")` encounters `-` or `_`, standard Base64 decoders either discard those characters or corrupt byte sequences, resulting in invalid UTF-8 JSON.
   - `JSON.parse(jsonStr)` then throws a SyntaxError, triggering the `catch` block and returning `tamperDetected: true, errorMessage: "Malformed QR payload."` for completely valid admission passes.

4. **Session Token Expiration & Timing Vulnerabilities (Observation 4):**
   - If `expiresAt` is stored in seconds (`1729526400`), an unstandardized check using `Date.now() > session.expiresAt` compares ~`1728921600000` with `1729526400`, immediately failing every session.
   - Omitting constant-time comparison (`crypto.timingSafeEqual`) on session token signatures leaves session cookies vulnerable to timing attacks that could forge admin authentication cookies.

5. **Brute-Force Rate Limiting Bypass (Observation 5):**
   - Because the throttle key is strictly `${clientIp}:${email.toLowerCase()}`, an attacker from a single IP can spray 4 attempts across thousands of unique emails without triggering any lockout (credential stuffing).
   - Conversely, a botnet of multiple IPs can make dozens of attempts on a single target account (`admin@eventportal.com`) because each bot's key `${botIp}:admin` stays under the threshold of 5 attempts.

6. **Interface Contract Breakage (Observation 6):**
   - Consumers expecting `result.error` (per `PROJECT.md`) will receive `undefined` when `cryptoService.ts` sets `result.errorMessage`.
   - Consumers expecting `result.token` will receive `undefined` when `cryptoService.ts` sets `result.teamId`.

---

## 3. Caveats

- Command execution (`run_command`) was denied by environment permission check (`Permission prompt for action 'command' was denied`), preventing dynamic runtime execution of a PostgreSQL container or Node.js test script.
- All observations, relational dependency graphs, and cryptographic analyses are derived through rigorous empirical static inspection of the documentation and codebase specifications.
- Dual-mode JSON storage (`data/events-data.json`) uses document objects where foreign key constraints are not enforced at the storage engine level; the schema findings specifically impact PostgreSQL 15+ execution in `schema.sql`.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

The documentation is high-quality and structured, but contains **two critical architectural/cryptographic defects** and **three high-severity issues** that must be resolved before advancing to implementation milestones M2 and M4:

1. **[CRITICAL] Alter `audit_logs.event_id` to be NULLABLE:**
   In `docs/DATABASE_SCHEMA.md` line 227:
   ```sql
   event_id UUID REFERENCES events(id) ON DELETE CASCADE,
   ```
   (Remove `NOT NULL` so system authentication events can be recorded).

2. **[CRITICAL] Upgrade Salt Generation to 32 Bytes:**
   In `docs/SECURITY.md` lines 48 & 63 and `docs/DATABASE_SCHEMA.md` line 72:
   - Change `crypto.randomBytes(16)` to `crypto.randomBytes(32)` (producing a 64-character hex string / 32-byte salt).
   - Update schema comment: `'Cryptographically secure 32-byte random salt.'`.

3. **[HIGH] Fix Base64Url Decoding in `verifySecureQRPayload`:**
   In `docs/SECURITY.md` line 182:
   ```typescript
   const jsonStr = Buffer.from(base64Str, "base64url").toString("utf8");
   ```

4. **[HIGH] Formalize Session Verification & Expiration Contract:**
   In `docs/SECURITY.md` Section 4.1, document `verifySessionToken` using `crypto.timingSafeEqual` and explicit second-based timestamp comparison:
   ```typescript
   Math.floor(Date.now() / 1000) > session.expiresAt
   ```

5. **[HIGH] Harden Brute-Force Limiter with Dual-Tier Throttling:**
   In `docs/SECURITY.md` Section 4.2:
   - Account-level throttle: max 5 failed attempts per email per 15 minutes.
   - IP-level throttle: max 30 failed attempts per IP per 15 minutes.

6. **[MEDIUM] Harmonize `QRVerificationResult` in `PROJECT.md`:**
   Add `error?: string` and `errorMessage?: string` as aliases to prevent interface contract divergence.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify `audit_logs` FK/NOT NULL bug:**
   Inspect `docs/DATABASE_SCHEMA.md` line 227 (`event_id UUID NOT NULL REFERENCES events(id)`) and cross-reference with `docs/SECURITY.md` lines 320-322 (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT` have no event context).
2. **Verify Salt Length Discrepancy:**
   Inspect `docs/SECURITY.md` line 48 & 63 (`crypto.randomBytes(16)`) and `docs/DATABASE_SCHEMA.md` line 72 vs Mission prompt requirement (`32-byte salt`).
3. **Verify Base64Url Mismatch:**
   Inspect `docs/SECURITY.md` line 133 (`SECQR:<Base64UrlEncodedJSON>`) vs line 182 (`Buffer.from(base64Str, "base64")`).
4. **Invalidation Conditions:**
   The `REQUEST_CHANGES` verdict will be invalidated and upgraded to `APPROVE` once the modifications specified in Section 4 are applied to `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, and `docs/IMPLEMENTATION_PLAN.md`.
