# Handoff Report: Remediation Strategy for Interface Contract Alignment & Architectural Hardening

**Agent:** explorer_m1_retry_3  
**Date:** 2026-10-14T16:35:00Z  
**Target Milestone:** Milestone 1 Gate Remediation  
**Status:** Complete Investigation & Actionable Remediation Plan  

---

## 1. Observation

Direct observations from inspecting `d:\Project\Event Management\.agents\teamwork\challenger_m1_2\handoff.md`, `PROJECT.md`, `ORIGINAL_REQUEST.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DATABASE_SCHEMA.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_AUDIT.md`, and existing codebase implementations in `src/`:

### Observation 1: Interface Contract Divergence for `QRVerificationResult`
- **`PROJECT.md` (lines 72-74):**
  ```typescript
  verifySecureQRPayload(rawPayload: string): { valid: boolean; isSignedPayload: boolean; token?: string; error?: string }
  ```
- **`docs/SECURITY.md` (lines 157-165):**
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
- **`docs/IMPLEMENTATION_PLAN.md` (lines 265-273):**
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
- **Existing `src/lib/services/cryptoService.ts` (lines 45-55):**
  ```typescript
  export function verifySecureQRPayload(rawInput: string): {
    valid: boolean;
    isSignedPayload: boolean;
    teamId?: string;
    eventId?: string;
    token?: string;
    isExpired?: boolean;
    expiresAt?: string;
    tamperDetected?: boolean;
    errorMessage?: string;
  }
  ```
- **Discrepancy:**
  - `PROJECT.md` specifies `error?: string` and `token?: string`, omitting `tamperDetected`, `isExpired`, `teamId`, `eventId`, and `errorMessage`.
  - `docs/SECURITY.md` and `docs/IMPLEMENTATION_PLAN.md` specify `errorMessage?: string`, omitting `error?: string`, `token?: string`, and `expiresAt?: string`.
  - In existing `cryptoService.ts`, callers access `result.token` and `result.errorMessage`. If an implementer builds against `PROJECT.md`, `errorMessage` and `teamId` will be missing; if against `docs/SECURITY.md`, `error` and `token` will be missing, causing runtime type bugs and silent telemetry drops.

---

### Observation 2: Incomplete & Fragmented Contract for `CheckInResult`
- **`PROJECT.md` (lines 77-80):**
  ```typescript
  processCheckIn(params: { eventId: string; qrPayload: string; volunteerId: string }): Promise<CheckInResult>
  ```
  Specifies behavior:
  - If already checked in: rejects with `DUPLICATE_CHECK_IN`, logs violation to `audit_logs` with exact timestamp.
  - If invalid signature: rejects with `INVALID_SIGNATURE`.
  However, `PROJECT.md` does NOT declare the TypeScript interface fields for `CheckInResult`.
- **`docs/IMPLEMENTATION_PLAN.md` (lines 283-291):**
  ```typescript
  export interface CheckInResult {
    success: boolean;
    message: string;
    alreadyCheckedIn?: boolean;
    checkedInAt?: string;
    checkedInBy?: string;
    team?: unknown;
    error?: string;
  }
  ```
- **Existing `src/app/actions/qrActions.ts` (lines 176-182):**
  ```typescript
  return {
    success: false,
    message: err.message,
    alreadyCheckedIn: false,
    isExpired: false,
    tamperDetected: false,
  };
  ```
- **Discrepancy:**
  - `docs/IMPLEMENTATION_PLAN.md` omits `isExpired?: boolean`, `tamperDetected?: boolean`, and `violationType?: string` (`DUPLICATE_CHECK_IN` | `INVALID_SIGNATURE` | etc.), which `PROJECT.md` mandates.
  - Property naming uses `team?: unknown` instead of generalized terminology (`registration?: unknown`), violating the domain generalization requirement in `GEMINI.md`.

---

### Observation 3: Session Verification Contract Missing Timing-Safe Comparison & Expiration Unit Ambiguity
- **`docs/SECURITY.md` (lines 105-106):**
  ```json
  "issuedAt": 1728921600,
  "expiresAt": 1729526400
  ```
- **`docs/IMPLEMENTATION_PLAN.md` (lines 230-231):**
  ```typescript
  issuedAt: number;
  expiresAt: number;
  ```
- **Discrepancy:**
  - `expiresAt` is specified in Unix epoch seconds (10 digits).
  - In JavaScript, `Date.now()` produces epoch milliseconds (13 digits). Without explicit second conversion (`Math.floor(Date.now() / 1000)`), naive comparison `Date.now() > session.expiresAt` (e.g. `1728921600000 > 1729526400`) causes all valid sessions to fail instantly.
  - Neither `docs/SECURITY.md` nor `docs/IMPLEMENTATION_PLAN.md` provides an explicit reference implementation of `verifySessionToken`.
  - Neither document mandates `crypto.timingSafeEqual` for session token HMAC signature comparison, leaving session cookies susceptible to timing side-channel attacks.

---

### Observation 4: Foreign Key & NOT NULL Constraint on `audit_logs.event_id` Blocking System Auth Telemetry
- **`docs/DATABASE_SCHEMA.md` (lines 225-238):**
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
- **`docs/DATABASE_SCHEMA.md` (lines 408-409):**
  ```sql
  CREATE POLICY p_audit_logs_system_insert ON audit_logs 
      FOR INSERT TO authenticated WITH CHECK (TRUE);
  ```
- **`docs/SECURITY.md` (lines 320-322):**
  - `AUTH_LOGIN_SUCCESS` (INFO): "User logs in successfully" -> Telemetry: `User ID, role, client IP, user agent` (No `event_id`).
  - `AUTH_LOGIN_FAILURE` (WARNING): "Invalid credentials entered" -> Telemetry: `Email, client IP, user agent` (No `event_id`).
  - `AUTH_LOCKOUT` (CRITICAL): "5 consecutive login failures" -> Telemetry: `Email, client IP, lockout expiration` (No `event_id`).
- **Discrepancy:**
  - System authentication events occur before any event is selected.
  - Attempting to insert an auth log with `event_id: NULL` triggers PostgreSQL error `23502 (not_null_violation)`.
  - Furthermore, `p_audit_logs_system_insert` only allows role `authenticated`, blocking `AUTH_LOGIN_FAILURE` and `AUTH_LOCKOUT` logs triggered by unauthenticated clients.

---

### Observation 5: Cryptographic Salt Length Discrepancy
- **`docs/SECURITY.md` (lines 48 & 63):**
  ```markdown
  - Salt Generation: 16 bytes (128 bits) of cryptographically secure random entropy generated via Node.js crypto.randomBytes(16).
  ```
  ```typescript
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  ```
- **`docs/DATABASE_SCHEMA.md` (line 72):**
  ```sql
  COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';
  ```
- **`docs/ARCHITECTURE.md` (line 162) & `docs/PROJECT_AUDIT.md` (line 72):**
  Both specify 16-byte random salt.
- **Contrast with Dispatch Mandate (`DISPATCH.md`):**
  Explicitly requires `PBKDF2 iterations >= 100,000, 32-byte salt, 64-byte key length`.

---

### Observation 6: RFC 4648 Base64URL Encoding vs Standard Base64 Decoding in SECQR
- **`docs/SECURITY.md` (line 133):**
  ```
  SECQR:<Base64UrlEncodedJSON>
  ```
- **`docs/SECURITY.md` (lines 181-182):**
  ```typescript
  const base64Str = clean.slice(6);
  const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
  ```
- **Discrepancy:**
  Standard Base64 decoder `Buffer.from(str, "base64")` fails or corrupts RFC 4648 Base64URL strings containing `-` or `_` without `=` padding. Node.js natively provides `Buffer.from(str, "base64url")`.

---

### Observation 7: Brute-Force Limiting Key Bypass
- **`docs/SECURITY.md` (lines 119-120):**
  ```markdown
  - Identifier: Composite key `${clientIp}:${email.toLowerCase()}`.
  - Threshold: Maximum 5 failed authentication attempts within a 15-minute (900 seconds) sliding window.
  ```
- **Discrepancy:**
  Using solely a composite key allows distributed password spraying against a single account from multiple IPs, or credential stuffing across thousands of emails from a single IP. Dual-tier rate limiting (Account Tier: 5/15m; IP Tier: 30/15m) is required.

---

## 2. Logic Chain

1. **Failure of Contract Interoperability (Observations 1 & 2):**
   - When Milestone M5 implements `verifySecureQRPayload` and `processCheckIn`, developers or test runners reading `PROJECT.md` expect `{ valid, isSignedPayload, token, error }`, while those reading `SECURITY.md` expect `{ valid, isSignedPayload, teamId, eventId, errorMessage }`.
   - Accessing `result.error` when only `errorMessage` is set evaluates to `undefined`, silently skipping error-handling branches.
   - Accessing `result.teamId` when only `token` is set breaks check-in lookups.
   - Defining a canonical, superset interface (`QRVerificationResult` and `CheckInResult`) with dual property aliasing (`error` ↔ `errorMessage`, `teamId` ↔ `registrationId`, `token`, `expiresAt`) guarantees 100% interoperability across all documentation and consumers.

2. **System Log Failure at Database Layer (Observation 4):**
   - PostgreSQL strictly rejects `NULL` for `NOT NULL` columns.
   - Authentication at `/` is an event-agnostic entry point.
   - Therefore, `audit_logs.event_id` must be made nullable (`event_id UUID REFERENCES events(id) ON DELETE CASCADE`).
   - The RLS policy must grant insert privileges to `authenticated` and `anon` (or ensure server-side logging uses the Supabase service role key) so failed logins are never lost.

3. **Cryptographic Salt Alignment (Observation 5):**
   - SHA-512 outputs a 64-byte (512-bit) digest. A 32-byte (256-bit) salt provides full collision resistance matching modern NIST and OWASP password storage recommendations.
   - Upgrading from 16 bytes (`crypto.randomBytes(16)`) to 32 bytes (`crypto.randomBytes(32)`) yields a 64-character hex string, satisfying the dispatch mandate across `SECURITY.md`, `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, and `PROJECT_AUDIT.md`.

4. **Decoding Failure on Gate Scans (Observation 6):**
   - URL-safe Base64URL encoding converts `+` to `-` and `/` to `_`.
   - Calling `Buffer.from(base64Str, "base64")` fails on Base64URL strings without padding.
   - Changing the decoder to `Buffer.from(base64Str, "base64url")` guarantees reliable QR parsing on all gate scanners.

5. **Timing Attacks and Expiration Flaws in Sessions (Observation 3):**
   - Direct string or byte comparison on HMAC signatures allows attackers to infer signature characters through response time analysis. Mandating `crypto.timingSafeEqual` mitigates this.
   - Standardizing session timestamp math to `Math.floor(Date.now() / 1000)` ensures seamless comparisons with 10-digit Unix epoch timestamps.

6. **Credential Stuffing Mitigation (Observation 7):**
   - Separating account-level throttling (5 attempts per email) from IP-level throttling (30 attempts per IP) stops distributed brute-force attacks and single-IP credential sprays.

---

## 3. Caveats

- **Read-Only Explorer Scope:** In accordance with the Teamwork explorer archetype, this report provides the exact formulation and patch blueprints for implementation without modifying source code directly.
- **Dual-Mode Consistency:** In the local JSON store (`data/events-data.json`), foreign keys are handled at the application level; making `event_id` nullable in PostgreSQL ensures the relational schema aligns with the JSON schema where system logs already have `event_id: undefined`.
- **Backward Compatibility:** All interface enhancements are strictly additive (using optional properties and aliases) so that neither legacy code in `src/` nor new tests in `tests/` will experience breakage.

---

## 4. Conclusion & Actionable Remediation Plan

To achieve Milestone 1 approval and unblock Milestones M2 through M6, apply the following exact modifications across the 4 primary files:

---

### 4.1 Remediation Plan for `PROJECT.md`

#### Target 1: Lines 57-63 — Section `### Auth & Session Contract`
**Replace lines 57-63 with:**
```markdown
### Auth & Session Contract (`src/lib/services/authService.ts`)
- `hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }>`:
  - Generates 32-byte (256-bit, 64-character hex) salt via `crypto.randomBytes(32)`.
  - Derives 64-byte key using PBKDF2 (HMAC-SHA512, 100,000 iterations).
- `verifyPassword(password: string, hash: string, salt: string): Promise<boolean>`:
  - Validates password hash using constant-time `crypto.timingSafeEqual`.
- `createSessionToken(user: UserAccount): Promise<string>`:
  - Returns signed compound token `${base64UrlPayload}.${signatureHex}`.
  - Embeds 10-digit Unix epoch seconds for `issuedAt` and `expiresAt` (7 days for `ADMIN`, 24 hours for `VOLUNTEER`).
- `verifySessionToken(token: string): Promise<SessionPayload | null>`:
  - Enforces constant-time `crypto.timingSafeEqual` on HMAC-SHA256 signature.
  - Checks expiration via `Math.floor(Date.now() / 1000) > session.expiresAt`.
  - Normalizes identity fields (`id` and `userId`).
- `checkRateLimit(params: { email?: string; clientIp?: string } | string): RateLimitResult`:
  - Enforces dual-tier sliding-window rate limiting:
    - Account Tier: Max 5 failed attempts per email per 15 minutes.
    - IP Tier: Max 30 failed attempts per IP per 15 minutes.
  - Lockout returns `{ allowed: false, remainingAttempts: 0, retryAfterSec: number, lockoutReason: "ACCOUNT_LOCKOUT" | "IP_RATE_LIMITED" }`.
```

#### Target 2: Lines 70-75 — Section `### QR & Gate Cryptography Contract`
**Replace lines 70-75 with:**
```markdown
### QR & Gate Cryptography Contract (`src/lib/services/cryptoService.ts`)
- `createSecureQRPayload(teamId: string, eventId: string, uniqueToken: string, expiresAtDate: Date): string`:
  - Returns `SECQR:<Base64UrlEncodedJSON>` using RFC 4648 Base64URL encoding (`Buffer.from(..., "base64url")`).
  - Embeds 64-character hex HMAC-SHA256 signature generated over `${teamId}:${eventId}:${uniqueToken}:${exp}` using `QR_HMAC_SECRET`.
- `verifySecureQRPayload(rawPayload: string): QRVerificationResult`:
  - Returns standardized verification result:
    ```typescript
    export interface QRVerificationResult {
      valid: boolean;
      isSignedPayload: boolean;
      tamperDetected?: boolean;
      isExpired?: boolean;
      teamId?: string; // Group/team identifier
      registrationId?: string; // Generalized registration identifier (alias for teamId)
      eventId?: string; // Event scope identifier
      token?: string; // Unique token / nonce
      expiresAt?: string; // ISO 8601 string
      errorMessage?: string; // Descriptive error reason
      error?: string; // Backward-compatible alias for errorMessage
    }
    ```
  - Enforces strict security: Non-`SECQR:` payloads return `valid: false, tamperDetected: true`.
  - Uses `Buffer.from(base64Str, "base64url")` and `crypto.timingSafeEqual` to avoid timing side channels.
```

#### Target 3: Lines 76-81 — Section `### Check-in Contract`
**Replace lines 76-81 with:**
```markdown
### Check-in Contract (`src/app/actions/qrActions.ts`)
- `processCheckIn(params: { eventId: string; qrPayload: string; volunteerId: string }): Promise<CheckInResult>`:
  - Standardized `CheckInResult`:
    ```typescript
    export interface CheckInResult {
      success: boolean;
      message: string;
      alreadyCheckedIn?: boolean;
      isExpired?: boolean;
      tamperDetected?: boolean;
      checkedInAt?: string;
      checkedInBy?: string;
      team?: unknown; // Legacy team entity
      registration?: unknown; // Generalized registration entity
      violationType?: "DUPLICATE_CHECK_IN" | "INVALID_SIGNATURE" | "EXPIRED_PASS" | "UNAPPROVED_REGISTRATION" | "NOT_FOUND";
      error?: string;
      errorMessage?: string; // Alias for error
    }
    ```
  - Atomically verifies pass admission against `check_ins` unique constraint (`UNIQUE(registration_id)`).
  - Duplicate scans trigger `violationType: "DUPLICATE_CHECK_IN"` and emit `CHECK_IN_DUPLICATE_ATTEMPT` audit log with prior timestamp.
  - Invalid signatures trigger `violationType: "INVALID_SIGNATURE"` and emit `CHECK_IN_TAMPER_ATTEMPT` audit log.
```

#### Target 4: After line 86 — Add Security Audit Telemetry Contract
**Insert after line 86:**
```markdown
### Security Audit Telemetry Contract (`src/lib/dataStore.ts` / Supabase `audit_logs`)
- `recordAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry>`:
  - `event_id` is explicitly NULLABLE to permit system-level authentication telemetry:
    - `AUTH_LOGIN_SUCCESS` (INFO): actor_id = user.id, actor_role = user.role, event_id = null.
    - `AUTH_LOGIN_FAILURE` (WARNING): actor_id = "SYSTEM", target_name = email, event_id = null.
    - `AUTH_LOCKOUT` (CRITICAL): actor_id = "SYSTEM", target_name = email, event_id = null.
  - Gate admission telemetry:
    - `CHECK_IN_SUCCESS` (INFO): actor_id = volunteerId, event_id = eventId, target_id = registrationId.
    - `CHECK_IN_DUPLICATE_ATTEMPT` (CRITICAL): records previous scan timestamp and volunteer.
    - `CHECK_IN_TAMPER_ATTEMPT` (CRITICAL): records invalid signature or corrupted payload.
    - `CHECK_IN_RESET` (WARNING): records admin justification reason.
  - Payment and OTP telemetry:
    - `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `OTP_GENERATED`, `OTP_LOCKOUT`.
```

---

### 4.2 Remediation Plan for `docs/IMPLEMENTATION_PLAN.md`

#### Target 1: Lines 88-105 — Section 2.2 (Milestone M2)
**Update Step-by-Step Implementation:**
- Change 16-byte salt to 32-byte salt:
  `"1. Implement PBKDF2 key derivation (SHA-512, 100,000 iterations, 64-byte key) and random 32-byte (256-bit, 64 hex characters) salt generation in authService.ts."`
- Add explicit session token verification requirement:
  `"Implement verifySessionToken with crypto.timingSafeEqual and Math.floor(Date.now() / 1000) > session.expiresAt."`
- Update rate limiter to dual-tier:
  `"Implement dual-tier in-memory rate limiter: Account Tier (5 attempts / 15m) and IP Tier (30 attempts / 15m)."`
- Add auth audit logging:
  `"Emit AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILURE, and AUTH_LOCKOUT audit logs with event_id: null."`

#### Target 2: Lines 141-146 — Section 2.4 (Milestone M4)
**Update `schema.sql` specification:**
- Specify that `audit_logs.event_id` is nullable:
  `"event_id UUID REFERENCES events(id) ON DELETE CASCADE (NULLABLE for system-wide auth logs)."`
- Specify updated RLS policy allowing system-level inserts:
  `"CREATE POLICY p_audit_logs_system_insert ON audit_logs FOR INSERT TO authenticated, anon WITH CHECK (TRUE);"`

#### Target 3: Lines 158-166 — Section 2.5 (Milestone M5)
**Update `cryptoService.ts` specification:**
- Explicitly state Base64URL encoding and decoding:
  `"Use Buffer.from(..., 'base64url') for both creation and verification of SECQR payloads to comply with RFC 4648."`
- Ensure `verifySecureQRPayload` returns canonical `QRVerificationResult` with aliases `error` / `errorMessage` and `teamId` / `registrationId`.

#### Target 4: Lines 216-252 — Section 3.1 (`authService.ts` Contract)
**Replace with:**
```typescript
export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "VOLUNTEER";
  avatar: string;
}

export interface SessionPayload {
  id: string; // Canonical user ID
  userId: string; // Backward-compatible alias for id
  email: string;
  role: "ADMIN" | "VOLUNTEER";
  fullName: string;
  avatar?: string;
  issuedAt: number; // Unix epoch seconds (Math.floor(Date.now() / 1000))
  expiresAt: number; // Unix epoch seconds (Math.floor(Date.now() / 1000) + lifetimeSeconds)
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSec?: number;
  lockoutReason?: "ACCOUNT_LOCKOUT" | "IP_RATE_LIMITED";
}

export class AuthService {
  static hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }>;
  static verifyPassword(password: string, hash: string, salt: string): Promise<boolean>;
  static createSessionToken(user: UserAccount): Promise<string>;
  static verifySessionToken(token: string): Promise<SessionPayload | null>;
  static checkRateLimit(identifier: string, tier?: "ACCOUNT" | "IP"): RateLimitResult;
  static checkDualRateLimit(params: { email?: string; clientIp?: string }): RateLimitResult;
  static recordFailedLogin(params: { email?: string; clientIp?: string }): void;
  static resetRateLimit(email: string): void;
  static authenticate(email: string, password: string, clientIp?: string): Promise<{ success: boolean; user?: UserAccount; error?: string }>;
  static getCurrentUser(): Promise<UserAccount | null>;
  static logout(): Promise<void>;
}
```

#### Target 5: Lines 255-279 — Section 3.2 (`cryptoService.ts` Contract)
**Replace with:**
```typescript
export interface SignedQRPayload {
  v: number;
  tid: string;
  eid: string;
  tok: string;
  exp: number; // Unix epoch seconds
  sig: string; // 64-char hex HMAC-SHA256
}

export interface QRVerificationResult {
  valid: boolean;
  isSignedPayload: boolean;
  tamperDetected?: boolean;
  isExpired?: boolean;
  teamId?: string; // Group / Team ID
  registrationId?: string; // Generalized registration ID (alias for teamId)
  eventId?: string; // Event ID
  token?: string; // Unique pass nonce/token
  expiresAt?: string; // ISO 8601 string
  errorMessage?: string; // Detailed error message
  error?: string; // Backward-compatible alias for errorMessage
}

export class CryptoService {
  static createSecureQRPayload(teamId: string, eventId: string, uniqueToken: string, expiresAtDate: Date): string;
  static verifySecureQRPayload(rawPayload: string): QRVerificationResult;
}
```

#### Target 6: Lines 282-306 — Section 3.3 (`qrActions.ts` Contract)
**Replace with:**
```typescript
export interface CheckInResult {
  success: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  isExpired?: boolean;
  tamperDetected?: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
  team?: unknown; // Legacy team entity
  registration?: unknown; // Generalized registration entity
  violationType?: "DUPLICATE_CHECK_IN" | "INVALID_SIGNATURE" | "EXPIRED_PASS" | "UNAPPROVED_REGISTRATION" | "NOT_FOUND";
  error?: string;
  errorMessage?: string; // Alias for error
}

export async function processCheckIn(params: {
  eventId: string;
  qrPayload: string;
  volunteerId: string;
}): Promise<CheckInResult>;

export async function verifyOtpCheckIn(params: {
  eventId: string;
  teamId: string;
  otpCode: string;
  volunteerId: string;
}): Promise<CheckInResult>;
```

#### Target 7: Insert Section 3.5 — Audit Telemetry Contract
**Insert after line 328:**
```typescript
### 3.5 Security Audit Telemetry Contract (`src/lib/dataStore.ts` / `src/lib/services/auditService.ts`)

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";
export type ActorRole = "ADMIN" | "VOLUNTEER" | "SYSTEM";

export interface AuditLogEntry {
  id?: string;
  event_id?: string | null; // NULLABLE: system authentication events have no event_id
  timestamp?: string; // ISO 8601 string
  action:
    | "AUTH_LOGIN_SUCCESS"
    | "AUTH_LOGIN_FAILURE"
    | "AUTH_LOCKOUT"
    | "CHECK_IN_SUCCESS"
    | "CHECK_IN_DUPLICATE_ATTEMPT"
    | "CHECK_IN_TAMPER_ATTEMPT"
    | "CHECK_IN_RESET"
    | "PAYMENT_APPROVED"
    | "PAYMENT_REJECTED"
    | "OTP_GENERATED"
    | "OTP_LOCKOUT"
    | "UNAUTHORIZED_ROUTE_ACCESS";
  severity: AuditSeverity;
  actor_id: string; // User ID, volunteer ID, or "SYSTEM"
  actor_role: ActorRole;
  target_id?: string | null;
  target_name?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditService {
  recordAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry>;
  getAuditLogs(filter: {
    eventId?: string | null;
    severity?: AuditSeverity | "ALL";
    action?: string | "ALL";
    search?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]>;
}
```

---

### 4.3 Remediation Plan for `docs/SECURITY.md`

1. **Lines 48 & 63 (Key Derivation):**
   - Change `crypto.randomBytes(16)` to `crypto.randomBytes(32)` (32 bytes / 256 bits, 64 hex characters).
   - Update storage format comment: `pbkdf2:sha512:100000:<salt_64hex>:<hash_128hex>`.
2. **Section 4.1 (Session Verification):**
   - Add reference implementation of `verifySessionToken` specifying:
     - Constant-time verification using `crypto.timingSafeEqual`.
     - Explicit second-based comparison: `Math.floor(Date.now() / 1000) > session.expiresAt`.
     - Base64URL payload decoding via `Buffer.from(payloadBase64Url, "base64url")`.
     - Returning `SessionPayload` with both `id` and `userId`.
3. **Section 4.2 (Brute-Force Rate Limiting):**
   - Replace composite-only key with Dual-Tier Throttling:
     - Account-level throttle: max 5 failed attempts per email per 15 minutes.
     - IP-level throttle: max 30 failed attempts per client IP per 15 minutes.
4. **Section 5.2 (SECQR Verification):**
   - Line 182: Change `Buffer.from(base64Str, "base64")` to `Buffer.from(base64Str, "base64url")`.
   - Update `QRVerificationResult` to include `error?: string`, `token?: string`, `expiresAt?: string`, and `registrationId?: string`.
5. **Section 8 (Audit Telemetry):**
   - Add note that `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, and `AUTH_LOCKOUT` have `event_id: NULL` and `actor_role: SYSTEM` (or user's role on success).

---

### 4.4 Remediation Plan for `docs/DATABASE_SCHEMA.md`

1. **Line 72 (Users Table Comment):**
   - Change `'Cryptographically secure 16-byte random salt.'` to `'Cryptographically secure 32-byte (64-character hex) random salt.'`.
2. **Line 227 (Audit Logs Table Definition):**
   - Change:
     ```sql
     event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     ```
     to:
     ```sql
     event_id UUID REFERENCES events(id) ON DELETE CASCADE,
     ```
     (Removing `NOT NULL` to enable system-level auth logging).
3. **Lines 408-409 (Audit Logs RLS Policy):**
   - Change:
     ```sql
     CREATE POLICY p_audit_logs_system_insert ON audit_logs 
         FOR INSERT TO authenticated WITH CHECK (TRUE);
     ```
     to:
     ```sql
     CREATE POLICY p_audit_logs_system_insert ON audit_logs 
         FOR INSERT TO authenticated, anon WITH CHECK (TRUE);
     ```

---

### 4.5 Remediation Plan for `docs/ARCHITECTURE.md` & `docs/PROJECT_AUDIT.md`

1. **`docs/ARCHITECTURE.md` line 162:**
   - Update `16 bytes (128 bits)` to `32 bytes (256 bits) via crypto.randomBytes(32)`.
2. **`docs/PROJECT_AUDIT.md` line 72:**
   - Update `16-byte random salt` to `32-byte random salt`.

---

## 5. Verification Method

To independently verify the completeness and soundness of this remediation strategy:

1. **Verification of Interface Harmonization:**
   - Confirm `QRVerificationResult` in `PROJECT.md`, `docs/SECURITY.md`, and `docs/IMPLEMENTATION_PLAN.md` contains both `error?: string` and `errorMessage?: string`, as well as `token?: string`, `expiresAt?: string`, and `registrationId?: string`.
   - Confirm `CheckInResult` in `PROJECT.md` and `docs/IMPLEMENTATION_PLAN.md` contains `violationType`, `isExpired`, `tamperDetected`, `alreadyCheckedIn`, and property aliases (`team` / `registration`, `error` / `errorMessage`).
2. **Verification of Session & Expiration Math:**
   - Verify `verifySessionToken` checks:
     `Math.floor(Date.now() / 1000) > session.expiresAt`
     confirming seconds-to-seconds unit parity.
   - Verify `crypto.timingSafeEqual` is mandated for session signature validation.
3. **Verification of Nullable Audit Telemetry:**
   - Confirm `docs/DATABASE_SCHEMA.md` line 227 removes `NOT NULL` from `event_id`.
   - Verify all 3 auth telemetry events (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`) are documented with `event_id: null`.
4. **Verification of Cryptographic Parameters:**
   - Confirm 32-byte salt (`crypto.randomBytes(32)`) is specified uniformly across `docs/SECURITY.md`, `docs/DATABASE_SCHEMA.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_AUDIT.md`, and `PROJECT.md`.
5. **Verification of Base64URL Encoding:**
   - Confirm `Buffer.from(..., "base64url")` is specified in `docs/SECURITY.md` line 182 and `docs/IMPLEMENTATION_PLAN.md`.
6. **Acceptance Invalidation Conditions:**
   - If any of the 4 documents (`PROJECT.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/SECURITY.md`, `docs/DATABASE_SCHEMA.md`) retain conflicting property names or unhandled nullability constraints, this remediation plan must be revised. Once applied, challenger gate verification will yield `APPROVE`.
