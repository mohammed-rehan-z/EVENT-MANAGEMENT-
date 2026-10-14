# Handoff Report: Security Architecture Remediation Strategy (`docs/SECURITY.md`)

**Agent:** explorer_m1_retry_2  
**Date:** 2026-10-14T16:40:00Z  
**Target Document:** `docs/SECURITY.md`  
**Related Documents:** `docs/DATABASE_SCHEMA.md`, `docs/IMPLEMENTATION_PLAN.md`, `PROJECT.md`  
**Status:** Complete Strategy Delivered  

---

## 1. Observation

Direct static inspection of `docs/SECURITY.md`, `docs/DATABASE_SCHEMA.md`, `docs/IMPLEMENTATION_PLAN.md`, and `PROJECT.md` reveals four specific cryptographic and architectural vulnerabilities identified during the Milestone 1 Gate verification:

### 1.1 Salt Length Under-Specification
- **Location:** `docs/SECURITY.md`, lines 48 & 63:
  ```markdown
  Line 48:
  - Salt Generation: 16 bytes (128 bits) of cryptographically secure random entropy generated via Node.js crypto.randomBytes(16).
  
  Line 63:
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  ```
- **Related Location:** `docs/DATABASE_SCHEMA.md`, line 72:
  ```sql
  COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';
  ```
- **Context:** The mission specification mandates 32 bytes (256 bits) of entropy (`crypto.randomBytes(32)`) producing a 64-character hex salt string, paired with PBKDF2 (100,000 iterations, SHA-512, 64-byte derived key). Specifying 16 bytes halves the key derivation salt entropy.

### 1.2 RFC 4648 Base64URL Decoding Incompatibility in QR Verification
- **Location:** `docs/SECURITY.md`, Section 5.1 (line 133) specifies:
  ```
  SECQR:<Base64UrlEncodedJSON>
  ```
- **Location:** `docs/SECURITY.md`, Section 5.2 (lines 181-183) implements:
  ```typescript
  const base64Str = clean.slice(6);
  const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
  const payload = JSON.parse(jsonStr);
  ```
- **Context:** Standard Base64 uses `+`, `/`, and `=` padding. Base64URL (RFC 4648 §5) substitutes `-` for `+` and `_` for `/`, stripping `=` padding. In Node.js, `Buffer.from(str, "base64")` fails or corrupts characters when processing `-` and `_` or unpadded sequences, causing `JSON.parse` to throw `SyntaxError`, erroneously rejecting completely valid passes as tampered.

### 1.3 Session Token Verification Missing Constant-Time Comparison & Ambiguous Epoch Units
- **Location:** `docs/SECURITY.md`, Section 4.1 (lines 94-116):
  ```json
  "issuedAt": 1728921600,
  "expiresAt": 1729526400
  ```
- **Missing Elements:**
  - Section 4.1 provides no reference implementation or verification algorithm for `verifySessionToken`.
  - Timestamp fields (`issuedAt`, `expiresAt`) are 10-digit integers (UNIX epoch seconds). JavaScript `Date.now()` produces 13-digit integers (epoch milliseconds). Evaluating `Date.now() > session.expiresAt` without unit conversion prematurely invalidates all active sessions.
  - No constant-time HMAC signature comparison (`crypto.timingSafeEqual`) is mandated or demonstrated for session tokens, introducing potential timing side-channel vulnerabilities.

### 1.4 Single-Composite Key Vulnerability in Brute-Force Rate Limiter
- **Location:** `docs/SECURITY.md`, Section 4.2 (lines 119-122):
  ```markdown
  - Identifier: Composite key `${clientIp}:${email.toLowerCase()}`.
  - Threshold: Maximum 5 failed authentication attempts within a 15-minute (900 seconds) sliding window.
  - Lockout Action: Exceeding threshold returns HTTP 429 { success: false, error: "Too many failed attempts. Account locked for 15 minutes." }.
  ```
- **Vulnerability 1 (Credential Stuffing / Password Spray):** An adversary testing passwords against 1,000 distinct accounts from a single IP generates 1,000 distinct composite keys `${attackerIp}:${victimEmail}`. Testing 4 passwords per account executes 4,000 login attempts with zero lockout triggers.
- **Vulnerability 2 (Distributed Brute-Force):** An adversary rotating across 50 IP addresses targeting a single high-privilege account (`admin@eventportal.com`) generates 50 distinct keys `${botIp}:admin@eventportal.com`. Each bot makes 4 attempts (200 total), evading account lockout entirely.

### 1.5 Cross-Document System Telemetry Nullability Constraint
- **Location:** `docs/DATABASE_SCHEMA.md`, line 227:
  ```sql
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ```
- **Location:** `docs/SECURITY.md`, lines 320-322:
  `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, and `AUTH_LOCKOUT` are system-level authentication telemetry events with no associated event context (`event_id` is null).

---

## 2. Logic Chain

1. **Cryptographic Salt Entropy (Observation 1.1 -> Remediation 1):**
   - SHA-512 produces a 512-bit (64-byte) digest.
   - Using a 16-byte (128-bit) salt leaves the salt entropy disproportionately smaller than the underlying hash primitive and the mandated 32-byte requirement.
   - Upgrading `crypto.randomBytes(16)` to `crypto.randomBytes(32)` yields 256 bits of cryptographic entropy, represented as a 64-character hex string.
   - This change must be applied to `docs/SECURITY.md` Section 3.1 & 3.2, and synchronized with `docs/DATABASE_SCHEMA.md` column comments.

2. **Base64URL Protocol Compliance (Observation 1.2 -> Remediation 2):**
   - The QR code format specification states `SECQR:<Base64UrlEncodedJSON>`.
   - Node.js `Buffer.from(str, "base64")` expects RFC 4648 Table 1 encoding (`+`, `/`, `=`).
   - QR payloads encoded using RFC 4648 Table 2 URL-safe encoding (`-`, `_`) cause `Buffer.from(..., "base64")` to drop or corrupt bytes.
   - Node.js natively supports `"base64url"` as a buffer encoding. Replacing `"base64"` with `"base64url"` in `verifySecureQRPayload` ensures zero decoding failures for valid tokens.
   - In addition, the QR generation reference must explicitly document `Buffer.from(JSON.stringify(payload)).toString("base64url")`.

3. **Session Verification & Timing Integrity (Observation 1.3 -> Remediation 3):**
   - Next.js Edge Middleware and Server Actions must cryptographically verify `event_auth_session` cookies.
   - A variable-time string equality check (`candidateSig === expectedSig`) leaks timing information through byte-by-byte comparison short-circuiting.
   - Utilizing `crypto.timingSafeEqual(Buffer.from(signatureHex, "hex"), Buffer.from(expectedSignature, "hex"))` eliminates timing attack vectors.
   - Explicitly documenting UNIX epoch seconds (`Math.floor(Date.now() / 1000)`) and adding a complete reference implementation for `createSessionToken` and `verifySessionToken` prevents epoch millisecond mismatch bugs in downstream implementation (M2).

4. **Dual-Tier Sliding-Window Throttling (Observation 1.4 -> Remediation 4):**
   - Combining IP and email into a single composite key fails against both distributed single-target attacks and single-source multi-target attacks.
   - Decoupling throttling into two distinct counters solves both threat vectors:
     - **Account-Level Window (`account:${email}`):** Caps failed attempts per user account at 5 per 15 minutes, neutralizing distributed botnets targeting admin accounts.
     - **IP-Level Window (`ip:${clientIp}`):** Caps total failed attempts per IP address at 30 per 15 minutes across any accounts, neutralizing horizontal credential stuffing and password spraying.
   - The reference implementation must show independent checks and incrementation for both tiers.

5. **Relational Nullability Coordination (Observation 1.5 -> Documentation Note):**
   - If `audit_logs.event_id` is defined as `NOT NULL`, recording `AUTH_LOGIN_FAILURE` or `AUTH_LOCKOUT` fails with a constraint violation.
   - `docs/SECURITY.md` Section 8 must note that system-level authentication telemetry omits `event_id` (`event_id: null`), supporting the schema adjustment in `docs/DATABASE_SCHEMA.md`.

---

## 3. Caveats

- **Scope Boundary:** This handoff provides the read-only architectural analysis and precise replacement text for `docs/SECURITY.md`. In accordance with Teamwork Explorer constraints, source code files and primary documentation files were not directly modified during this phase.
- **Edge Middleware Execution Environment:** Next.js Edge Middleware runs in the Edge Runtime (V8-based) or Node.js runtime depending on configuration. Node.js `crypto` is supported in Edge Runtime via standard Web Crypto API (`crypto.subtle`) or Node.js compatibility layer (`crypto`). The reference implementation in `docs/SECURITY.md` targets the Node.js Server Action / Service layer (`src/lib/services/authService.ts`).
- **In-Memory vs Distributed Cache:** The reference rate limiter in `docs/SECURITY.md` is modeled as an in-memory sliding-window store for single-instance / local fallback operation; production multi-instance deployments can adapt the identical dual-key pattern to Redis / Upstash without architectural change.

---

## 4. Conclusion & Precise Remediation Strategy

The exact edits required for `docs/SECURITY.md` are detailed below.

### 4.1 Remediation Item 1: Upgrade Salt Length to 32 Bytes

#### In `docs/SECURITY.md` §3.1 (lines 43-50):
**Replace:**
```markdown
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2) using HMAC-SHA512.
- **Iteration Count:** `100,000` rounds minimum.
- **Derived Key Length:** 64 bytes (512 bits), hex-encoded.
- **Salt Generation:** 16 bytes (128 bits) of cryptographically secure random entropy generated via Node.js `crypto.randomBytes(16)`.
- **Storage Format:** `pbkdf2:sha512:100000:<salt_hex>:<hash_hex>`.
```
**With:**
```markdown
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2) using HMAC-SHA512.
- **Iteration Count:** `100,000` rounds minimum.
- **Derived Key Length:** 64 bytes (512 bits), hex-encoded (128 hex characters).
- **Salt Generation:** 32 bytes (256 bits) of cryptographically secure random entropy generated via Node.js `crypto.randomBytes(32)` (64 hex characters).
- **Storage Format:** `pbkdf2:sha512:100000:<salt_hex>:<hash_hex>` (where `<salt_hex>` is 64 hex characters / 32 bytes, and `<hash_hex>` is 128 hex characters / 64 bytes).
- **Alternative Algorithm Support:** `scrypt` (`N=16384, r=8, p=1`, key length 64 bytes, 32-byte salt).
```

#### In `docs/SECURITY.md` §3.2 (lines 61-72):
**Replace:**
```typescript
export function hashPassword(password: string, saltHex?: string): Promise<PasswordHashResult> {
  return new Promise((resolve, reject) => {
    const salt = saltHex || crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve({
        hash: derivedKey.toString("hex"),
        salt,
      });
    });
  });
}
```
**With:**
```typescript
export function hashPassword(password: string, saltHex?: string): Promise<PasswordHashResult> {
  return new Promise((resolve, reject) => {
    // 32 bytes (256 bits) of cryptographic entropy -> 64-char hex string
    const salt = saltHex || crypto.randomBytes(32).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve({
        hash: derivedKey.toString("hex"),
        salt,
      });
    });
  });
}
```

---

### 4.2 Remediation Item 2: Fix SECQR Verification Decoding to Use `base64url`

#### In `docs/SECURITY.md` §5.1 & §5.2:
**Update decoding line (line 182):**
```typescript
<<<< Before
    const base64Str = clean.slice(6);
    const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
====
    const base64Str = clean.slice(6);
    // RFC 4648 Base64URL decoding: natively handles '-' and '_' characters without padding
    const jsonStr = Buffer.from(base64Str, "base64url").toString("utf8");
>>>>
```

#### Update Full Reference Implementation in `docs/SECURITY.md` §5.2 (including Generator & Contract Alignment):
```typescript
export interface QRVerificationResult {
  valid: boolean;
  isSignedPayload: boolean;
  tamperDetected?: boolean;
  isExpired?: boolean;
  teamId?: string;
  eventId?: string;
  token?: string;
  error?: string;
  errorMessage?: string;
}

/**
 * Generates an RFC 4648 Base64URL-encoded HMAC-SHA256 signed QR payload.
 */
export function createSecureQRPayload(
  teamId: string,
  eventId: string,
  expirationHours = 48
): string {
  const exp = Math.floor(Date.now() / 1000) + expirationHours * 3600;
  const tok = crypto.randomUUID();
  const sig = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET!)
    .update(`${teamId}:${eventId}:${tok}:${exp}`)
    .digest("hex");

  const payload = {
    v: 1,
    tid: teamId,
    eid: eventId,
    tok,
    exp,
    sig,
  };

  // Strictly RFC 4648 Base64URL (URL-safe, no +, /, or = padding)
  const base64UrlPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `SECQR:${base64UrlPayload}`;
}

/**
 * Decodes and cryptographically verifies an incoming QR pass payload.
 */
export function verifySecureQRPayload(rawInput: string): QRVerificationResult {
  const clean = rawInput.trim();

  // Rule 1: Eliminate non-SECQR bypass completely
  if (!clean.startsWith("SECQR:")) {
    const msg = "REJECTED: Pass does not have valid cryptographic signature header (SECQR:).";
    return {
      valid: false,
      isSignedPayload: false,
      tamperDetected: true,
      error: msg,
      errorMessage: msg,
    };
  }

  try {
    const base64Str = clean.slice(6);
    // RFC 4648 Base64URL decoding: natively handles '-' and '_' characters without padding
    const jsonStr = Buffer.from(base64Str, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr);

    if (!payload.tid || !payload.eid || !payload.tok || !payload.exp || !payload.sig) {
      const msg = "Malformed QR payload: missing required cryptographic signature attributes.";
      return {
        valid: false,
        isSignedPayload: true,
        tamperDetected: true,
        error: msg,
        errorMessage: msg,
      };
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.QR_HMAC_SECRET!)
      .update(`${payload.tid}:${payload.eid}:${payload.tok}:${payload.exp}`)
      .digest("hex");

    const sigBuf = Buffer.from(payload.sig, "hex");
    const expSigBuf = Buffer.from(expectedSig, "hex");

    // Rule 2: Constant-time comparison
    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      const msg = "CRITICAL: Cryptographic signature mismatch. Pass has been altered or forged.";
      return {
        valid: false,
        isSignedPayload: true,
        tamperDetected: true,
        error: msg,
        errorMessage: msg,
      };
    }

    // Rule 3: Expiration check using Unix epoch seconds
    const nowUnix = Math.floor(Date.now() / 1000);
    if (nowUnix > payload.exp) {
      const msg = "QR pass expired. Admission denied.";
      return {
        valid: false,
        isSignedPayload: true,
        isExpired: true,
        teamId: payload.tid,
        eventId: payload.eid,
        token: payload.tok,
        error: msg,
        errorMessage: msg,
      };
    }

    return {
      valid: true,
      isSignedPayload: true,
      teamId: payload.tid,
      eventId: payload.eid,
      token: payload.tok,
    };
  } catch {
    const msg = "Malformed QR payload: base64url decoding or JSON parse failure.";
    return {
      valid: false,
      isSignedPayload: true,
      tamperDetected: true,
      error: msg,
      errorMessage: msg,
    };
  }
}
```

---

### 4.3 Remediation Item 3: Session Token Timing-Safe Verification & Epoch Timestamp Units

#### In `docs/SECURITY.md` §4.1:
Add explicit documentation of Epoch Timestamp Units and full reference implementations for `createSessionToken` and `verifySessionToken`:

```markdown
### 4.1 Signed Session Cookie Specification
Raw JSON cookies (`JSON.stringify(user)`) are replaced with cryptographically signed, tamper-evident session tokens.
- **Cookie Name:** `event_auth_session`
- **Format:** `${base64UrlPayload}.${hmacSignature}`
- **Epoch Timestamp Units:** All token timestamps (`issuedAt`, `expiresAt`) are integer **seconds** since Unix Epoch (`Math.floor(Date.now() / 1000)`). JavaScript `Date.now()` produces milliseconds; runtime implementations MUST divide by 1000 to prevent premature expiration comparison bugs.
- **Payload Schema:**
  ```json
  {
    "userId": "usr-admin-1",
    "email": "admin@eventportal.com",
    "role": "ADMIN",
    "fullName": "Alex Mercer",
    "issuedAt": 1728921600,
    "expiresAt": 1729526400
  }
  ```
- **Signing Algorithm:** `HMAC-SHA256(base64UrlPayload, process.env.SESSION_SECRET)`.
- **Signature Validation:** Constant-time comparison using Node.js `crypto.timingSafeEqual`.
- **Cookie Flags:**
  - `HttpOnly: true` (Blocks client JavaScript / XSS theft).
  - `Secure: true` in production (`process.env.NODE_ENV === "production"`).
  - `SameSite: "lax"` (Mitigates cross-site request forgery).
  - `Path: "/"`
  - `Max-Age`: 604,800 seconds (7 days for Admins; 86,400 seconds / 24 hours for Volunteers).

#### Reference Implementation: Session Token Generation & Verification
```typescript
import crypto from "crypto";

export interface SessionPayload {
  userId: string;
  email: string;
  role: "ADMIN" | "VOLUNTEER";
  fullName: string;
  avatar?: string;
  issuedAt: number;  // Epoch seconds
  expiresAt: number; // Epoch seconds
}

/**
 * Creates an HMAC-SHA256 signed session token string formatted as <base64urlPayload>.<signatureHex>.
 */
export function createSessionToken(
  user: { id: string; email: string; role: "ADMIN" | "VOLUNTEER"; fullName: string; avatar?: string },
  lifetimeSeconds = 604800
): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters of entropy.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email.toLowerCase().trim(),
    role: user.role,
    fullName: user.fullName,
    avatar: user.avatar,
    issuedAt: nowSec,
    expiresAt: nowSec + lifetimeSeconds,
  };

  const payloadBase64Url = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadBase64Url)
    .digest("hex");

  return `${payloadBase64Url}.${signature}`;
}

/**
 * Cryptographically verifies session token, enforcing timing-safe HMAC validation and epoch expiration.
 */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64Url, signatureHex] = parts;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  try {
    // 1. Recompute HMAC-SHA256 signature
    const expectedSigHex = crypto
      .createHmac("sha256", secret)
      .update(payloadBase64Url)
      .digest("hex");

    const sigBuf = Buffer.from(signatureHex, "hex");
    const expSigBuf = Buffer.from(expectedSigHex, "hex");

    // 2. Constant-time comparison to prevent timing side-channel attacks
    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      return null;
    }

    // 3. Decode payload from Base64URL
    const jsonStr = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
    const payload: SessionPayload = JSON.parse(jsonStr);

    // 4. Validate timestamp expiration using integer UNIX epoch seconds
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.expiresAt) {
      return null; // Token expired
    }

    // 5. Validate mandatory schema fields
    if (!payload.userId || !payload.email || !["ADMIN", "VOLUNTEER"].includes(payload.role)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
```
```

---

### 4.4 Remediation Item 4: Dual-Tier Brute-Force Rate Limiter

#### In `docs/SECURITY.md` §4.2:
Replace the single composite rate limiter with the following dual-tier sliding-window specification and reference code:

```markdown
### 4.2 Brute-Force Rate Limiting & Account Lockout: Dual-Tier Sliding Window
To neutralize both distributed credential-guessing botnets and single-source credential-stuffing / password-spraying attacks, authentication requests are throttled independently across two sliding windows:

| Throttling Tier | Tracking Key | Threshold | Window | Threat Addressed | Action on Limit Exceeded |
|---|---|:---:|:---:|---|---|
| **Tier 1: Account-Level** | `account:${email.toLowerCase()}` | **5 failures** | 15 minutes (900s) | Distributed brute-force attacks targeting a single account from multiple IPs. | Account locked for 15 minutes; returns HTTP 429 with lockout message. |
| **Tier 2: IP-Level** | `ip:${clientIp}` | **30 failures** | 15 minutes (900s) | Password spraying & credential stuffing against many accounts from one IP. | IP blocked for 15 minutes; returns HTTP 429 network throttle message. |

#### Rate Limiting Evaluation Workflow:
1. **Pre-Authentication Check (`checkRateLimit(email, clientIp)`):**
   - Query `ip:${clientIp}` sliding window. If >= 30 failed attempts recorded, immediately reject with HTTP 429 (`"Too many failed login attempts from this network. Please try again in 15 minutes."`).
   - Query `account:${email}` sliding window. If >= 5 failed attempts recorded, immediately reject with HTTP 429 (`"Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes."`).
2. **On Authentication Failure (`recordFailedLogin(email, clientIp)`):**
   - Append current timestamp to `account:${email}` sliding window.
   - Append current timestamp to `ip:${clientIp}` sliding window.
   - If account threshold reached (5), emit `AUTH_LOCKOUT` telemetry with `target_name: email`, `severity: "CRITICAL"`.
   - If IP threshold reached (30), emit `AUTH_LOCKOUT` telemetry with `ip_address: clientIp`, `severity: "CRITICAL"`.
3. **On Authentication Success (`resetRateLimit(email, clientIp)`):**
   - Clear `account:${email}` failed attempt history (legitimate credential owner authenticated).
   - Retain `ip:${clientIp}` attempt history to prevent malicious actors from clearing IP rate limits using a known auxiliary account.

#### Reference Implementation: Dual-Tier Rate Limiter
```typescript
interface AttemptRecord {
  timestamps: number[]; // Epoch seconds
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSec?: number;
  lockoutReason?: "ACCOUNT_LOCKOUT" | "IP_LOCKOUT";
  errorMessage?: string;
}

export class DualTierRateLimiter {
  private static accountAttempts = new Map<string, AttemptRecord>();
  private static ipAttempts = new Map<string, AttemptRecord>();

  private static readonly ACCOUNT_MAX_ATTEMPTS = 5;
  private static readonly IP_MAX_ATTEMPTS = 30;
  private static readonly WINDOW_SECONDS = 900; // 15 minutes

  /**
   * Cleans expired attempt timestamps outside the sliding window.
   */
  private static pruneExpired(record: AttemptRecord, nowSec: number): void {
    const cutoff = nowSec - this.WINDOW_SECONDS;
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Pre-check whether an authentication attempt is permitted.
   */
  static checkRateLimit(email: string, clientIp: string): RateLimitResult {
    const nowSec = Math.floor(Date.now() / 1000);
    const cleanEmail = email.trim().toLowerCase();
    const cleanIp = clientIp.trim();

    // 1. Evaluate IP-Level Throttling (Tier 2)
    const ipRecord = this.ipAttempts.get(cleanIp) || { timestamps: [] };
    this.pruneExpired(ipRecord, nowSec);
    this.ipAttempts.set(cleanIp, ipRecord);

    if (ipRecord.timestamps.length >= this.IP_MAX_ATTEMPTS) {
      const oldest = ipRecord.timestamps[0];
      const retryAfterSec = Math.max(1, this.WINDOW_SECONDS - (nowSec - oldest));
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSec,
        lockoutReason: "IP_LOCKOUT",
        errorMessage: "Too many failed login attempts from this network. Please try again in 15 minutes.",
      };
    }

    // 2. Evaluate Account-Level Throttling (Tier 1)
    const acctRecord = this.accountAttempts.get(cleanEmail) || { timestamps: [] };
    this.pruneExpired(acctRecord, nowSec);
    this.accountAttempts.set(cleanEmail, acctRecord);

    if (acctRecord.timestamps.length >= this.ACCOUNT_MAX_ATTEMPTS) {
      const oldest = acctRecord.timestamps[0];
      const retryAfterSec = Math.max(1, this.WINDOW_SECONDS - (nowSec - oldest));
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSec,
        lockoutReason: "ACCOUNT_LOCKOUT",
        errorMessage: "Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
      };
    }

    const remaining = Math.min(
      this.ACCOUNT_MAX_ATTEMPTS - acctRecord.timestamps.length,
      this.IP_MAX_ATTEMPTS - ipRecord.timestamps.length
    );

    return {
      allowed: true,
      remainingAttempts: remaining,
    };
  }

  /**
   * Records a failed authentication attempt across both account and IP sliding windows.
   */
  static recordFailedLogin(email: string, clientIp: string): RateLimitResult {
    const nowSec = Math.floor(Date.now() / 1000);
    const cleanEmail = email.trim().toLowerCase();
    const cleanIp = clientIp.trim();

    // Record to Account Tier
    const acctRecord = this.accountAttempts.get(cleanEmail) || { timestamps: [] };
    this.pruneExpired(acctRecord, nowSec);
    acctRecord.timestamps.push(nowSec);
    this.accountAttempts.set(cleanEmail, acctRecord);

    // Record to IP Tier
    const ipRecord = this.ipAttempts.get(cleanIp) || { timestamps: [] };
    this.pruneExpired(ipRecord, nowSec);
    ipRecord.timestamps.push(nowSec);
    this.ipAttempts.set(cleanIp, ipRecord);

    return this.checkRateLimit(email, clientIp);
  }

  /**
   * Resets account-level failed attempts upon successful login.
   */
  static resetRateLimit(email: string): void {
    const cleanEmail = email.trim().toLowerCase();
    this.accountAttempts.delete(cleanEmail);
  }
}
```
```

---

### 4.5 Remediation Item 5: Audit Log Nullability Coordination Note

#### In `docs/SECURITY.md` §8 (Security Audit Telemetry):
Add the following explicit architectural constraint under Table 8:

```markdown
### 8.1 System Authentication Telemetry & Event Context Invariant
Authentication lifecycle telemetry (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`) occurs before a session is established or outside the scope of any specific event.

- **Relational Schema Requirement:** The `audit_logs.event_id` column in PostgreSQL MUST be declared nullable:
  ```sql
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  ```
  (The `NOT NULL` constraint must not be enforced on `event_id`).
- **Telemetry Payload:** For authentication events, `event_id` is set to `null`, `actor_role` defaults to `'SYSTEM'`, and details regarding lockout thresholds and client IP are encapsulated in the JSONB `details` payload.
```

---

## 5. Verification Method

To independently verify the completeness and accuracy of this remediation strategy:

1. **Verify Salt Length Parameter:**
   - Inspect proposed changes against Section 3.1 & 3.2. Ensure `crypto.randomBytes(32)` is specified and produces a 64-character hex string (256 bits).
   - Verify alignment with `docs/DATABASE_SCHEMA.md` comment on `users.password_salt`.
2. **Verify Base64URL Buffer Decoding:**
   - In Node.js, verify that `Buffer.from("eyJ2IjoxLCJ0aWQiOiJ0ZXN0In0", "base64url").toString("utf8")` parses RFC 4648 URL-safe strings with `-` and `_` characters without error, whereas `"base64"` would corrupt or reject unpadded URL tokens.
3. **Verify Session Token Validation:**
   - Confirm that `createSessionToken` and `verifySessionToken` utilize integer epoch seconds (`Math.floor(Date.now() / 1000)`).
   - Confirm that signature verification uses `crypto.timingSafeEqual` with byte buffer length assertions to eliminate timing leakage.
4. **Verify Dual-Tier Rate Limiting Invariants:**
   - Test that spraying 4 passwords against 10 accounts from 1 IP triggers the IP rate limit when the 31st attempt occurs.
   - Test that targeting 1 account across 10 distinct IPs triggers the account lockout on the 5th attempt regardless of IP rotation.
5. **Invalidation Conditions:**
   - This remediation plan would be invalidated if:
     - Node.js environment lacked `"base64url"` buffer support (Node.js < 14, not applicable since the project is Next.js 16 / React 19).
     - Relational schema retained `event_id NOT NULL` on `audit_logs`, preventing authentication telemetry ingestion.
