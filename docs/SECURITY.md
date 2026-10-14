# Security Architecture & Cryptographic Verification Specification
## Universal Event Registration & QR Check-in System

**Document Version:** 1.0.0  
**Status:** Approved Security Specification  
**Classification:** Technical Security Architecture & Threat Model  
**Related Requirements:** R1, R2, R3, R5 (per `ORIGINAL_REQUEST.md`)  

---

## 1. Security Philosophy & Defense-in-Depth

The Universal Event Registration & QR Check-in System manages access control and attendee verification for high-density events handling hundreds of attendees. Physical event environments present unique attack vectors, including wireless interception, ticket forgery, pass duplication (screenshots shared across messaging apps), credential stuffing, and unauthorized access to attendee Personally Identifiable Information (PII).

To mitigate these threats, the platform enforces a **Zero-Trust, Defense-in-Depth Architecture**:
- **Layer 1: Network & Edge Security:** Next.js Edge Middleware intercepting all administrative and scanning routes before page or handler invocation.
- **Layer 2: Cryptographic Identity & Session Integrity:** Salted key derivation (PBKDF2/scrypt) and tamper-evident HMAC-SHA256 signed session cookies.
- **Layer 3: Cryptographic Gate Verification:** HMAC-SHA256 digital signatures on all QR passes (`SECQR:`), constant-time signature verification, and atomic single-use admission enforcement.
- **Layer 4: Data Isolation & Least Privilege:** Row-Level Security (RLS) policies, programmatic Server Action guards (`requireAuth`), REST API 401/403 shields, and PII masking.
- **Layer 5: Immutable Telemetry & Audit Trails:** Append-only security audit logging capturing all authentication events, tampering attempts, duplicate scans, and administrative overrides.

---

## 2. Threat Model & Attack Surface Analysis (STRIDE)

| Threat Category | Potential Attack Vector | Impact Level | Architectural Mitigation |
|---|---|:---:|---|
| **Spoofing** | Forging unsigned cookie `event_auth_session` to assume `ADMIN` role. | **CRITICAL** | HMAC-SHA256 signed session tokens containing timestamp, user ID, role, and cryptographically verified against `SESSION_SECRET`. |
| **Spoofing** | Generating counterfeit QR passes to gain illicit venue admission. | **CRITICAL** | `SECQR:` HMAC-SHA256 signed payloads with 64-character hex signature verified via `crypto.timingSafeEqual`. |
| **Tampering** | Altering QR expiration date (`exp`) or registration ID (`tid`) in base64 string. | **CRITICAL** | Any payload modification invalidates HMAC signature; gate rejects scan and logs `CHECK_IN_TAMPER_ATTEMPT`. |
| **Tampering** | Parameter tampering in REST API calls (`/api/checkin`, `/api/export`). | **HIGH** | Strict Next.js Edge Middleware route interception and Server Action role verification (`requireAuth`). |
| **Repudiation** | Operator denies admitting an unauthorized team or resetting check-in. | **MEDIUM** | Append-only `audit_logs` recording exact timestamp, actor ID, IP address, user agent, and action metadata. |
| **Information Disclosure** | Anonymous actor dumping attendee roster (names, emails, phones, courses) via `/api/export`. | **CRITICAL** | API route authorization guard returning HTTP 401 Unauthorized for unauthenticated requests and 403 Forbidden for volunteers. |
| **Information Disclosure** | Leaking password hashes or salts in API responses. | **CRITICAL** | Strict TypeScript interfaces omitting credential fields (`Omit<User, 'passwordHash' | 'passwordSalt'>`). |
| **Denial of Service** | Credential stuffing against authentication endpoint. | **HIGH** | In-memory sliding-window brute-force rate limiter: 5 attempts per 15 minutes before lockout. |
| **Denial of Service** | Rapid re-scanning or duplicate pass presentation at gate turnstiles. | **HIGH** | Atomic database check-in constraint (`UNIQUE(registration_id)`) ensuring single-use admission. |
| **Elevation of Privilege** | Volunteer navigating to `/events/*` admin dashboard to approve teams or export PII. | **CRITICAL** | Edge Middleware intercepts volunteer session and redirects to `/scan`; API returns 403 Forbidden. |

---

## 3. Cryptographic Password Security Architecture

### 3.1 Key Derivation Parameters
To eliminate the critical vulnerability of plaintext credentials (`admin123`, `volunteer123`), the platform implements cryptographic password hashing:
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2) using HMAC-SHA512.
- **Iteration Count:** `100,000` rounds minimum.
- **Derived Key Length:** 64 bytes (512 bits), hex-encoded (128 hex characters).
- **Salt Generation:** 32 bytes (256 bits) of cryptographically secure random entropy generated via Node.js `crypto.randomBytes(32)` (64 hex characters).
- **Storage Format:** `pbkdf2:sha512:100000:<salt_hex>:<hash_hex>` (where `<salt_hex>` is 64 hex characters / 32 bytes, and `<hash_hex>` is 128 hex characters / 64 bytes).
- **Alternative Algorithm Support:** `scrypt` (`N=16384, r=8, p=1`, key length 64 bytes, 32-byte salt).

### 3.2 Reference Implementation
```typescript
import crypto from "crypto";

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

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

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  const candidateBuffer = Buffer.from(hash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (candidateBuffer.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}
```

---

## 4. Session Security & Token Lifecycle Architecture

### 4.1 Signed Session Cookie Specification
Raw JSON cookies (`JSON.stringify(user)`) are replaced with cryptographically signed, tamper-evident session tokens.
- **Cookie Name:** `event_auth_session`
- **Format:** `${base64UrlPayload}.${hmacSignature}`
- **Epoch Timestamp Units:** All token timestamps (`issuedAt`, `expiresAt`) are integer **seconds** since Unix Epoch (`Math.floor(Date.now() / 1000)`). JavaScript `Date.now()` produces milliseconds; runtime implementations MUST divide by 1000 to prevent premature expiration comparison bugs.
- **Payload Schema:**
  ```json
  {
    "id": "usr-admin-1",
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
  id: string;       // Canonical user ID
  userId: string;   // Backward-compatible alias for id
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
    id: user.id,
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
    const payload = JSON.parse(jsonStr);

    // 4. Validate timestamp expiration using integer UNIX epoch seconds
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.expiresAt) {
      return null; // Token expired
    }

    const userId = payload.userId || payload.id;
    // 5. Validate mandatory schema fields
    if (!userId || !payload.email || !["ADMIN", "VOLUNTEER"].includes(payload.role)) {
      return null;
    }

    return {
      ...payload,
      id: userId,
      userId: userId,
    };
  } catch {
    return null;
  }
}
```

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

---

## 5. Cryptographic Gate Verification Protocol (`SECQR:`)

### 5.1 Protocol Specification
To eliminate pass counterfeiting and QR forgery, digital admission passes use HMAC-SHA256 authenticated signatures.

**Format:**
```
SECQR:<Base64UrlEncodedJSON>
```

**JSON Structure:**
```json
{
  "v": 1,
  "tid": "reg-94820f4b-8e12-4d2a-bc91",
  "eid": "ev-1",
  "tok": "9f8a2b1c-3d4e-5f6a-7b8c-9d0e1f2a3b4c",
  "exp": 1792166400,
  "sig": "4a7b9c2d1e0f3a5b6c8d7e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"
}
```

- `v`: Protocol version (`1`).
- `tid`: Registration ID or Group ID.
- `eid`: Event ID (prevents pass reuse across events).
- `tok`: Cryptographically random UUIDv4 token nonce.
- `exp`: UNIX expiration timestamp in seconds.
- `sig`: 64-character hex HMAC-SHA256 signature generated over `${tid}:${eid}:${tok}:${exp}` using secret `QR_HMAC_SECRET`.

### 5.2 Verification Pipeline & Constant-Time Comparison
```typescript
export interface QRVerificationResult {
  valid: boolean;
  isSignedPayload: boolean;
  tamperDetected?: boolean;
  isExpired?: boolean;
  teamId?: string; // Group / Team ID
  registrationId?: string; // Generalized registration ID (alias for teamId)
  eventId?: string; // Event scope ID
  token?: string; // Unique token / nonce
  expiresAt?: string; // ISO 8601 string
  errorMessage?: string; // Detailed error message
  error?: string; // Backward-compatible alias for errorMessage
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
        registrationId: payload.tid,
        eventId: payload.eid,
        token: payload.tok,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        error: msg,
        errorMessage: msg,
      };
    }

    return {
      valid: true,
      isSignedPayload: true,
      teamId: payload.tid,
      registrationId: payload.tid,
      eventId: payload.eid,
      token: payload.tok,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
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

## 6. Server-Enforced RBAC & Route/API Protection

### 6.1 Edge Middleware Specification (`src/middleware.ts`)
Next.js Edge Middleware intercepts all incoming requests before page compilation or API handler execution.

```typescript
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/events/:path*",
    "/scan/:path*",
    "/api/export/:path*",
    "/api/checkin/:path*",
    "/api/teams/:path*",
    "/api/import/:path*",
  ],
};

export async function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get("event_auth_session")?.value;
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  // 1. Verify Session Token
  const session = await verifySession(sessionCookie);

  if (!session) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Role-Based Route Isolation
  if (session.role === "VOLUNTEER") {
    // Volunteers cannot access Admin views or Admin APIs
    if (pathname.startsWith("/events")) {
      return NextResponse.redirect(new URL("/scan", req.url));
    }
    if (pathname.startsWith("/api/export") || pathname.startsWith("/api/import")) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}
```

### 6.2 Attendee PII Shielding Rules
- **Anonymous / Unauthenticated Requests:** Zero access to attendee PII. All API requests return 401.
- **Volunteer Scanner Displays (`/scan/teams`):** Contact numbers and emails are masked:
  - Phone: `+1 ***-***-8901`
  - Email: `j***@example.com`
- **Administrative Exports:** Unmasked PII is restricted to authenticated `ADMIN` users via `/api/export` or secure CSV export actions.

---

## 7. Gate Verification & Atomic Check-In Invariants

### 7.1 Atomic Single-Use Admission
- Database enforces `UNIQUE(registration_id)` in the `check_ins` table.
- Concurrent scan attempts trigger a database constraint violation.
- The check-in pipeline returns `DUPLICATE_CHECK_IN`, displays prior check-in time and volunteer identity, triggers red audible/haptic feedback, and logs a critical audit violation.

### 7.2 On-Spot Gate OTP Fallback Protocol
- Fallback for broken screens or camera issues.
- Generates a 6-digit cryptographically random OTP (`crypto.randomInt(100000, 1000000)`).
- Strict 10-minute validity window.
- Rate-limited to 4 verification attempts before permanent code lockout (`otp_locked = true`).

---

## 8. Security Audit Telemetry & Incident Invariants

Audit logs are immutable append-only records tracking critical security events:

| Event Identifier | Severity | Trigger Condition | Logged Telemetry Fields |
|---|:---:|---|---|
| `AUTH_LOGIN_SUCCESS` | INFO | User logs in successfully | User ID, role, client IP, user agent |
| `AUTH_LOGIN_FAILURE` | WARNING | Invalid credentials entered | Email, client IP, user agent |
| `AUTH_LOCKOUT` | CRITICAL | 5 consecutive login failures | Email, client IP, lockout expiration |
| `CHECK_IN_SUCCESS` | INFO | Attendee pass successfully scanned | Registration ID, event ID, volunteer ID, timestamp |
| `CHECK_IN_DUPLICATE_ATTEMPT` | CRITICAL | Already admitted pass scanned again | Registration ID, previous scan timestamp, previous volunteer ID, scan count |
| `CHECK_IN_TAMPER_ATTEMPT` | CRITICAL | Non-SECQR pass or invalid HMAC | Raw payload snippet, client IP, volunteer ID |
| `CHECK_IN_RESET` | WARNING | Admin resets check-in status | Registration ID, admin ID, mandatory reason string |
| `PAYMENT_APPROVED` | INFO | Admin approves registration payment | Registration ID, admin ID, timestamp |
| `PAYMENT_REJECTED` | WARNING | Admin rejects registration payment | Registration ID, admin ID, rejection reason |
| `OTP_GENERATED` | INFO | Gate OTP generated | Registration ID, volunteer ID, expiration |
| `OTP_LOCKOUT` | CRITICAL | 4 failed OTP attempts | Registration ID, volunteer ID, timestamp |

### 8.1 System Authentication Telemetry & Event Context Invariant
Authentication lifecycle telemetry (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`) occurs before a session is established or outside the scope of any specific event.

- **Relational Schema Requirement:** The `audit_logs.event_id` column in PostgreSQL MUST be declared nullable:
  ```sql
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  ```
  (The `NOT NULL` constraint must not be enforced on `event_id`).
- **Telemetry Payload:** For authentication events, `event_id` is set to `null`, `actor_role` defaults to `'SYSTEM'` (or authenticated user role on success), and details regarding lockout thresholds, client IP, and target accounts are encapsulated in the JSONB `details` payload.
- **RLS Invariant:** Unauthenticated clients executing login attempts emit security telemetry via role `anon` permitted by RLS policy `p_audit_logs_anon_security_insert` or server actions using `SUPABASE_SERVICE_ROLE_KEY`.

---

## 9. Secret Management & Cryptographic Hygiene

### 9.1 Environment Variable Requirements
- `SESSION_SECRET`: Minimum 32 characters (256 bits) of high-entropy random hex.
- `QR_HMAC_SECRET`: Minimum 32 characters (256 bits) of high-entropy random hex.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only secret; never exposed to browser bundles.

### 9.2 Key Generation Commands
To generate cryptographically secure keys in Windows PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
