# Handoff Report — Milestone 2 Exploration: Dual-Tier Rate Limiting & Auth Audit Telemetry
**Agent Identity:** `explorer_m2_3`  
**Working Directory:** `d:\Project\Event Management\.agents\teamwork\explorer_m2_3`  
**Milestone:** M2 (Authentication & Account Lifecycle Hardening)  
**Date:** 2026-10-14  

---

## 1. Observation

Direct examination of the codebase revealed the following concrete architectural facts, file structures, and code implementations:

### 1.1 Existing Rate Limiting Implementation (`src/lib/services/authService.ts`)
Lines 24–49:
```typescript
// In-memory IP rate limiter to throttle high-frequency automated brute-force scripts
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const ipRateLimits = new Map<string, RateLimitBucket>();

function checkIpRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = ipRateLimits.get(ip);
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_REQUESTS = 12; // 12 login requests per IP window

  if (!bucket || bucket.resetAt < now) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
```
**Deficiencies Observed:**
- Single tier only: Only throttles by IP; no in-memory Account Tier exists.
- Fixed window rather than sliding window: `resetAt` resets completely after 5 minutes, allowing burst attacks across window boundaries.
- Count increments on *every* request (lines 42–43), regardless of whether credentials are valid or invalid.
- Threshold is 12 requests per 5 minutes instead of the specified 30 failures per 15-minute sliding window (900 seconds) for IP Tier and 5 failures per 15-minute sliding window (900 seconds) for Account Tier.

### 1.2 Client IP Extraction (`src/lib/services/authService.ts`)
Lines 60–70:
```typescript
let clientIp = "127.0.0.1";
let userAgent = "unknown";
try {
  const headerList = await headers();
  clientIp = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "127.0.0.1";
  userAgent = headerList.get("user-agent") || "unknown";
} catch {
  // Fallback in test / edge runtimes
}
```
**Deficiencies Observed:**
- `authenticate(email: string, password: string)` does not accept an optional `clientIp?: string` parameter, preventing programmatic testing or caller-specified IPs.
- If `x-forwarded-for` is empty string or whitespace, it does not cleanly fall back to `x-real-ip`.
- Next.js 16 `headers()` throws when invoked outside a server request context (e.g., in unit tests). While lines 67–69 have a `try/catch`, it is embedded directly inside `authenticate()` rather than isolated in an exportable, reusable helper.

### 1.3 Audit Log Schema & Telemetry Calls (`src/lib/dataStore.ts` & `src/lib/services/authService.ts`)
In `src/lib/dataStore.ts` (lines 64–95):
```typescript
export interface AuditLog {
  id: string;
  event_id: string;
  timestamp: string;
  action:
    | "CHECK_IN_SUCCESS"
    ...
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILED_ATTEMPT"
    | "LOGIN_ACCOUNT_LOCKED"
    | "USER_CREATED"
    | "USER_UPDATED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actor_id: string;
  actor_role: "ADMIN" | "VOLUNTEER" | "SYSTEM";
  target_id?: string;
  target_name?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
}
```
In `src/lib/services/authService.ts` (lines 74–86 and lines 195–210):
```typescript
await logSecurityAuditAction({
  event_id: "system",
  action: "LOGIN_ACCOUNT_LOCKED",
  severity: "CRITICAL",
  actor_id: "anonymous",
  actor_role: "SYSTEM",
  target_name: email,
  ...
});
...
await logSecurityAuditAction({
  event_id: "system",
  action: "LOGIN_SUCCESS",
  severity: "INFO",
  actor_id: userRecord.id,
  actor_role: userRecord.role,
  ...
});
```
In `schema.sql` (lines 80–88):
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
**Deficiencies Observed:**
- `AuditLog.event_id` is typed as `event_id: string` in TypeScript (`dataStore.ts:66`), whereas `docs/SECURITY.md` Section 8.1 requires `event_id` to be nullable (`event_id: null`) for system authentication events.
- `AuditLog.action` in `dataStore.ts` only permits legacy action names (`LOGIN_SUCCESS`, `LOGIN_FAILED_ATTEMPT`, `LOGIN_ACCOUNT_LOCKED`). It rejects the standardized actions `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, and `AUTH_LOCKOUT`.
- `authService.ts` logs `event_id: "system"` as a workaround for TypeScript type constraints instead of passing `event_id: null`.

### 1.4 Server Actions Layer (`src/app/actions/authActions.ts`)
Lines 1–14:
```typescript
"use server";

import { AuthService, UserAccount } from "@/lib/services/authService";

export async function loginAction(
  email: string,
  password: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    return await AuthService.authenticate(email, password);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
```
**Deficiencies Observed:**
- `catch (err: any)` triggers ESLint error `@typescript-eslint/no-explicit-any` (one of the 101 codebase lint errors).
- `loginAction` does not support an optional `clientIp?: string` parameter for test injection.

### 1.5 Interface Contracts in Project Specifications
- `docs/SECURITY.md` lines 224–358: Formally documents `DualTierRateLimiter` class, tracking `account:${email.toLowerCase()}` (5 attempts / 900s) and `ip:${clientIp}` (30 attempts / 900s).
- `docs/SECURITY.md` line 243: Explicitly specifies: *"On Authentication Success: Clear `account:${email}` failed attempt history. Retain `ip:${clientIp}` attempt history to prevent malicious actors from clearing IP rate limits using a known auxiliary account."*
- `docs/IMPLEMENTATION_PLAN.md` lines 257–261: Requires polymorphic rate-check contracts:
  * `checkRateLimit(identifier: string, tier?: "ACCOUNT" | "IP"): RateLimitResult`
  * `checkDualRateLimit(params: { email?: string; clientIp?: string }): RateLimitResult`
  * `recordFailedLogin(params: { email?: string; clientIp?: string }): RateLimitResult`
  * `resetRateLimit(email: string): void`
  * `authenticate(email: string, password: string, clientIp?: string): Promise<{ success: boolean; user?: UserAccount; error?: string }>`

---

## 2. Logic Chain

From the observations above, the implementation strategy follows a strict deductive chain:

1. **Defeating Single-Account & Spraying Attacks Simultaneously (Obs 1.1, 1.5):**
   - Single-tier IP limiting cannot block distributed credential-stuffing (multiple IPs targeting one admin account).
   - Single-tier Account limiting cannot block password spraying (1 IP guessing 1 password across 1,000 accounts).
   - *Therefore*, the system requires two independent sliding windows:
     * Tier 1: `account:${email.toLowerCase()}` with max 5 failures per 900 seconds.
     * Tier 2: `ip:${clientIp}` with max 30 failures per 900 seconds.

2. **True Sliding-Window Invariant (Obs 1.1):**
   - Fixed 5-minute buckets fail against boundary attacks and reset abruptly.
   - *Therefore*, each record must store an array of integer Unix epoch seconds (`timestamps: number[]`).
   - Pruning calculates `cutoff = nowSec - 900` and filters timestamps `ts > cutoff`.
   - `retryAfterSec` is computed as `Math.max(1, 900 - (nowSec - oldestTimestamp))`.
   - When all timestamps in a record expire, `map.delete(key)` is called to prevent in-memory memory leaks from attack spraying.

3. **Auxiliary Account Reset Prevention (Obs 1.5):**
   - If a successful login cleared both IP and account buckets, an attacker with 29 failed attempts on a victim account could log in to their own throwaway account, reset the IP counter to 0, and continue brute-forcing indefinitely.
   - *Therefore*, on authentication success, `resetRateLimit` MUST clear ONLY `account:${email.toLowerCase()}`, leaving `ip:${clientIp}` intact.

4. **Safe Client IP Resolution (Obs 1.2, 1.4):**
   - In production behind Cloudflare/Vercel/ALB, client IP is in `x-forwarded-for` (first comma-delimited element) or `x-real-ip`.
   - In test runners (e.g., Vitest), `headers()` throws because no request headers exist.
   - *Therefore*, an isolated helper `extractClientIp(explicitIp?: string)` must prioritize `explicitIp`, safely evaluate `headers()` within `try/catch`, parse the first IP in `x-forwarded-for`, fall back to `x-real-ip`, and default to `"127.0.0.1"`.

5. **Schema Alignment for Authentication Telemetry (Obs 1.3):**
   - In PostgreSQL (`schema.sql:83`), `event_id` is nullable.
   - In TypeScript (`dataStore.ts:66`), `event_id` is strictly typed as `string`, forcing legacy callers to pass `"system"`.
   - *Therefore*, `AuditLog.event_id` must be updated to `string | null` in `dataStore.ts`.
   - `AuditLog.action` union must be expanded to include `"AUTH_LOGIN_SUCCESS" | "AUTH_LOGIN_FAILURE" | "AUTH_LOCKOUT"`.
   - In `AuthService.authenticate`, all telemetry logs must pass `event_id: null`, actor `"anonymous"` with role `"SYSTEM"` for failures/lockout, and user UUID with user role for success.

6. **Server Action & ESLint Conformance (Obs 1.4):**
   - Replacing `catch (err: any)` with `catch (err: unknown)` in `src/app/actions/authActions.ts` resolves an existing ESLint error while propagating clean error messages.

---

## 3. Caveats

1. **In-Memory Volatility**: The `DualTierRateLimiter` maintains sliding windows in Node.js process memory. In serverless multi-region deployments with zero state sharing, rate-limit buckets are isolated per lambda instance. For this single-container/dual-mode deployment architecture, in-memory sliding windows provide zero latency and zero external dependency overhead. If horizontal clustering with Redis is introduced in future milestones, `DualTierRateLimiter` methods can be backed by Redis sorted sets (`ZADD`, `ZREMRANGEBYSCORE`).
2. **Proxy Spoofing**: Trusting `x-forwarded-for` directly without an upstream edge reverse proxy that strips untrusted client headers could allow header spoofing. In production on Vercel or cloud reverse proxies, `x-forwarded-for` is managed by the edge proxy.
3. **Database Lockout Synchronization**: The database stores persistent `failed_attempts` and `locked_until` on `UserRecord` in `dataStore.ts`. The in-memory `DualTierRateLimiter` operates in front of the database. When a registered user reaches 5 failures, both the in-memory tier and the database `UserRecord` lockout are updated synchronously.

---

## 4. Conclusion & Concrete Implementation Strategy

### 4.1 Required Changes in `src/lib/dataStore.ts`

#### Step 1: Update `AuditLog` interface (lines 64–103)
```typescript
export interface AuditLog {
  id: string;
  event_id: string | null; // Nullable for system authentication telemetry
  timestamp: string;
  action:
    | "CHECK_IN_SUCCESS"
    | "CHECK_IN_DUPLICATE_ATTEMPT"
    | "CHECK_IN_EXPIRED_ATTEMPT"
    | "CHECK_IN_REVOKED_ATTEMPT"
    | "CHECK_IN_TAMPER_ATTEMPT"
    | "CHECK_IN_INVALID_ATTEMPT"
    | "CHECK_IN_RESET"
    | "OTP_GENERATED"
    | "OTP_MATCH_SUCCESS"
    | "OTP_MATCH_FAILURE"
    | "OTP_LOCKOUT"
    | "QR_GENERATED"
    | "QR_REGENERATED"
    | "QR_REVOKED"
    | "BULK_IMPORT"
    | "BULK_APPROVE"
    | "BULK_CHECK_IN"
    | "BULK_EXPIRATION_EXTEND"
    | "BULK_QR_BATCH"
    | "TEAM_CREATED"
    | "TEAM_DELETED"
    | "AUTH_LOGIN_SUCCESS"
    | "AUTH_LOGIN_FAILURE"
    | "AUTH_LOCKOUT"
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILED_ATTEMPT"
    | "LOGIN_ACCOUNT_LOCKED"
    | "USER_CREATED"
    | "USER_UPDATED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actor_id: string;
  actor_role: "ADMIN" | "VOLUNTEER" | "SYSTEM";
  target_id?: string;
  target_name?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
}
```

---

### 4.2 Proposed Code for `src/lib/services/authService.ts`

The complete, hardened `DualTierRateLimiter`, IP extraction, and `AuthService` integration:

```typescript
import { cookies, headers } from "next/headers";
import {
  getDbUserByEmail,
  recordFailedLoginAttempt,
  resetFailedLoginAttempts,
  logSecurityAuditAction,
} from "@/lib/dataStore";
import {
  detectSqlInjection,
  isValidEmail,
  verifyPassword,
} from "./cryptoService";

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "VOLUNTEER";
  avatar: string;
}

export interface SessionPayload {
  id: string;
  userId: string;
  email: string;
  role: "ADMIN" | "VOLUNTEER";
  fullName: string;
  avatar?: string;
  issuedAt: number; // Unix epoch seconds
  expiresAt: number; // Unix epoch seconds
}

export const COOKIE_NAME = "event_auth_session";

// --- DUAL-TIER SLIDING WINDOW RATE LIMITER ---

export interface AttemptRecord {
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

  public static readonly ACCOUNT_MAX_ATTEMPTS = 5;
  public static readonly IP_MAX_ATTEMPTS = 30;
  public static readonly WINDOW_SECONDS = 900; // 15 minutes (900 seconds)

  /**
   * Filters out timestamps older than the sliding window threshold.
   */
  private static pruneExpired(record: AttemptRecord, nowSec: number): void {
    const cutoff = nowSec - this.WINDOW_SECONDS;
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Retrieves an existing attempt record or creates a clean one, pruning expired entries.
   * Cleans up empty keys from the map to prevent unbounded memory growth.
   */
  private static getOrClean(map: Map<string, AttemptRecord>, key: string, nowSec: number): AttemptRecord {
    const record = map.get(key);
    if (!record) return { timestamps: [] };
    this.pruneExpired(record, nowSec);
    if (record.timestamps.length === 0) {
      map.delete(key);
      return { timestamps: [] };
    }
    return record;
  }

  /**
   * Evaluates both IP Tier and Account Tier rate limits without recording an attempt.
   */
  static checkRateLimit(email: string, clientIp: string): RateLimitResult {
    const nowSec = Math.floor(Date.now() / 1000);
    const cleanEmail = email ? email.trim().toLowerCase() : "";
    const cleanIp = clientIp ? clientIp.trim() : "127.0.0.1";

    // 1. Evaluate IP-Level Throttling (Tier 2: max 30 failures per 900s)
    if (cleanIp) {
      const ipRecord = this.getOrClean(this.ipAttempts, cleanIp, nowSec);
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
    }

    // 2. Evaluate Account-Level Throttling (Tier 1: max 5 failures per 900s)
    if (cleanEmail) {
      const acctRecord = this.getOrClean(this.accountAttempts, cleanEmail, nowSec);
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
    }

    const ipCount = cleanIp ? (this.ipAttempts.get(cleanIp)?.timestamps.length || 0) : 0;
    const acctCount = cleanEmail ? (this.accountAttempts.get(cleanEmail)?.timestamps.length || 0) : 0;
    const remaining = Math.max(0, Math.min(
      this.ACCOUNT_MAX_ATTEMPTS - acctCount,
      this.IP_MAX_ATTEMPTS - ipCount
    ));

    return {
      allowed: true,
      remainingAttempts: remaining,
    };
  }

  /**
   * Records a failed login attempt across both Account and IP tiers.
   */
  static recordFailedLogin(email: string, clientIp: string): RateLimitResult {
    const nowSec = Math.floor(Date.now() / 1000);
    const cleanEmail = email ? email.trim().toLowerCase() : "";
    const cleanIp = clientIp ? clientIp.trim() : "127.0.0.1";

    if (cleanEmail) {
      let acctRecord = this.accountAttempts.get(cleanEmail);
      if (!acctRecord) {
        acctRecord = { timestamps: [] };
        this.accountAttempts.set(cleanEmail, acctRecord);
      }
      this.pruneExpired(acctRecord, nowSec);
      acctRecord.timestamps.push(nowSec);
    }

    if (cleanIp) {
      let ipRecord = this.ipAttempts.get(cleanIp);
      if (!ipRecord) {
        ipRecord = { timestamps: [] };
        this.ipAttempts.set(cleanIp, ipRecord);
      }
      this.pruneExpired(ipRecord, nowSec);
      ipRecord.timestamps.push(nowSec);
    }

    return this.checkRateLimit(cleanEmail, cleanIp);
  }

  /**
   * Resets account-level failed attempts upon successful login.
   * NOTE: IP attempt history is intentionally preserved to prevent malicious actors
   * from resetting network rate limits using an auxiliary/burner account.
   */
  static resetRateLimit(email: string): void {
    const cleanEmail = email ? email.trim().toLowerCase() : "";
    if (cleanEmail) {
      this.accountAttempts.delete(cleanEmail);
    }
  }

  /**
   * Resets IP attempt history (primarily for administrative or test runner use).
   */
  static resetIpRateLimit(ip: string): void {
    const cleanIp = ip ? ip.trim() : "";
    if (cleanIp) {
      this.ipAttempts.delete(cleanIp);
    }
  }

  /**
   * Resets all in-memory rate limiting state (for testing isolation).
   */
  static resetAll(): void {
    this.accountAttempts.clear();
    this.ipAttempts.clear();
  }
}

// --- CLIENT IP & USER AGENT EXTRACTION ---

export async function extractClientIp(explicitIp?: string): Promise<string> {
  if (explicitIp && typeof explicitIp === "string" && explicitIp.trim()) {
    return explicitIp.trim();
  }

  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    const realIp = headerList.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  } catch {
    // Outside Next.js request context (e.g., unit tests)
  }

  return "127.0.0.1";
}

export async function extractUserAgent(): Promise<string> {
  try {
    const headerList = await headers();
    return headerList.get("user-agent")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// --- AUTHENTICATION SERVICE ---

export class AuthService {
  /**
   * Interface contract polymorphic rate check: evaluates single identifier or dual parameters
   */
  static checkRateLimit(identifier: string, tier?: "ACCOUNT" | "IP"): RateLimitResult {
    const isIp = tier === "IP" || (!tier && !identifier.includes("@"));
    if (isIp) {
      const cleanIp = identifier.replace(/^ip:/, "").trim();
      return DualTierRateLimiter.checkRateLimit("", cleanIp);
    } else {
      const cleanEmail = identifier.replace(/^account:/, "").trim();
      return DualTierRateLimiter.checkRateLimit(cleanEmail, "");
    }
  }

  static checkDualRateLimit(params: { email?: string; clientIp?: string }): RateLimitResult {
    return DualTierRateLimiter.checkRateLimit(params.email || "", params.clientIp || "");
  }

  static recordFailedLogin(params: { email?: string; clientIp?: string }): RateLimitResult {
    return DualTierRateLimiter.recordFailedLogin(params.email || "", params.clientIp || "");
  }

  static resetRateLimit(email: string): void {
    DualTierRateLimiter.resetRateLimit(email);
  }

  /**
   * Secure database-backed authentication with SQL injection filtering,
   * dual-tier rate limiting, constant-time password verification, and audit telemetry.
   */
  static async authenticate(
    email: string,
    password: string,
    explicitClientIp?: string
  ): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    // 1. Extract Client IP & User Agent
    const clientIp = await extractClientIp(explicitClientIp);
    const userAgent = await extractUserAgent();

    const cleanEmail = email ? email.trim().toLowerCase() : "";
    const cleanPassword = password ? password.trim() : "";

    if (!cleanEmail || !cleanPassword) {
      return {
        success: false,
        error: "Email and password are required.",
      };
    }

    if (!isValidEmail(cleanEmail)) {
      return {
        success: false,
        error: "Please enter a valid official email address.",
      };
    }

    // 2. Strict SQL Injection Detection
    if (detectSqlInjection(cleanEmail) || detectSqlInjection(cleanPassword)) {
      await logSecurityAuditAction({
        event_id: null,
        action: "CHECK_IN_TAMPER_ATTEMPT",
        severity: "CRITICAL",
        actor_id: "anonymous",
        actor_role: "SYSTEM",
        target_name: cleanEmail.slice(0, 50),
        ip_address: clientIp,
        user_agent: userAgent,
        details: {
          attack_type: "SQL_INJECTION_AUTH_DETECTED",
          sanitized_input_preview: cleanEmail.slice(0, 40),
          violation: "Malicious SQL query keywords or quotation payloads in auth parameters.",
        },
      });

      // Synthetic randomized jitter to defeat timing attacks
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 300));

      return {
        success: false,
        error: "Invalid account name or password syntax.",
      };
    }

    // 3. Pre-Authentication Dual-Tier Rate Limit Check
    const rateCheck = DualTierRateLimiter.checkRateLimit(cleanEmail, clientIp);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: rateCheck.errorMessage || "Too many failed login attempts. Please try again in 15 minutes.",
      };
    }

    // 4. Retrieve user record from persistent database / Supabase
    const userRecord = await getDbUserByEmail(cleanEmail);

    if (!userRecord) {
      // Artificial delay to prevent user-enumeration timing attacks
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 200));

      // Record failed attempt in dual-tier rate limiter
      const failResult = DualTierRateLimiter.recordFailedLogin(cleanEmail, clientIp);

      // Emit AUTH_LOGIN_FAILURE telemetry
      await logSecurityAuditAction({
        event_id: null,
        action: "AUTH_LOGIN_FAILURE",
        severity: "WARNING",
        actor_id: "anonymous",
        actor_role: "SYSTEM",
        target_id: "unknown",
        target_name: cleanEmail,
        ip_address: clientIp,
        user_agent: userAgent,
        details: {
          email: cleanEmail,
          reason: "User account does not exist.",
          remainingAttempts: failResult.remainingAttempts,
        },
      });

      // If this attempt triggered a lockout, emit AUTH_LOCKOUT telemetry
      if (!failResult.allowed) {
        await logSecurityAuditAction({
          event_id: null,
          action: "AUTH_LOCKOUT",
          severity: "CRITICAL",
          actor_id: "anonymous",
          actor_role: "SYSTEM",
          target_id: "unknown",
          target_name: failResult.lockoutReason === "IP_LOCKOUT" ? clientIp : cleanEmail,
          ip_address: clientIp,
          user_agent: userAgent,
          details: {
            reason: failResult.lockoutReason,
            retryAfterSec: failResult.retryAfterSec,
            threshold: failResult.lockoutReason === "IP_LOCKOUT" ? 30 : 5,
            lockoutExpiry: new Date(Date.now() + (failResult.retryAfterSec || 900) * 1000).toISOString(),
          },
        });

        return {
          success: false,
          error: failResult.errorMessage,
        };
      }

      return {
        success: false,
        error: "Invalid account credentials. Please verify your login details.",
      };
    }

    // 5. Account Lockout Check (Database persistent state)
    if (userRecord.locked_until) {
      const lockExpiry = new Date(userRecord.locked_until).getTime();
      const now = Date.now();
      if (lockExpiry > now) {
        const remainingMinutes = Math.max(1, Math.ceil((lockExpiry - now) / 60000));
        return {
          success: false,
          error: `Security lockout active: Too many consecutive failed attempts. Please retry in ${remainingMinutes} minute(s).`,
        };
      }
    }

    // 6. Cryptographic constant-time password check
    const isPasswordValid = verifyPassword(cleanPassword, userRecord.salt, userRecord.password_hash);

    if (!isPasswordValid) {
      // Record failure in in-memory dual-tier rate limiter
      const failResult = DualTierRateLimiter.recordFailedLogin(cleanEmail, clientIp);

      // Also persist to DB user failed_attempts
      await recordFailedLoginAttempt(cleanEmail, clientIp);

      // Artificial randomized delay to defeat automated dictionary attacks
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));

      // Emit AUTH_LOGIN_FAILURE telemetry
      await logSecurityAuditAction({
        event_id: null,
        action: "AUTH_LOGIN_FAILURE",
        severity: "WARNING",
        actor_id: "anonymous",
        actor_role: "SYSTEM",
        target_id: userRecord.id,
        target_name: userRecord.full_name,
        ip_address: clientIp,
        user_agent: userAgent,
        details: {
          email: cleanEmail,
          reason: "Password mismatch.",
          remainingAttempts: failResult.remainingAttempts,
        },
      });

      // If lockout threshold reached, emit AUTH_LOCKOUT telemetry
      if (!failResult.allowed) {
        await logSecurityAuditAction({
          event_id: null,
          action: "AUTH_LOCKOUT",
          severity: "CRITICAL",
          actor_id: "anonymous",
          actor_role: "SYSTEM",
          target_id: userRecord.id,
          target_name: failResult.lockoutReason === "IP_LOCKOUT" ? clientIp : cleanEmail,
          ip_address: clientIp,
          user_agent: userAgent,
          details: {
            reason: failResult.lockoutReason,
            retryAfterSec: failResult.retryAfterSec,
            threshold: failResult.lockoutReason === "IP_LOCKOUT" ? 30 : 5,
            lockoutExpiry: new Date(Date.now() + (failResult.retryAfterSec || 900) * 1000).toISOString(),
          },
        });

        return {
          success: false,
          error: failResult.errorMessage,
        };
      }

      const warning =
        failResult.remainingAttempts <= 2
          ? ` (${failResult.remainingAttempts} attempt(s) remaining before security lockout)`
          : "";

      return {
        success: false,
        error: `Invalid account credentials. Please verify your password.${warning}`,
      };
    }

    // 7. Successful login: reset failed counters & emit AUTH_LOGIN_SUCCESS telemetry
    DualTierRateLimiter.resetRateLimit(cleanEmail);
    await resetFailedLoginAttempts(cleanEmail);

    await logSecurityAuditAction({
      event_id: null,
      action: "AUTH_LOGIN_SUCCESS",
      severity: "INFO",
      actor_id: userRecord.id,
      actor_role: userRecord.role,
      target_id: userRecord.id,
      target_name: userRecord.full_name,
      ip_address: clientIp,
      user_agent: userAgent,
      details: {
        email: userRecord.email,
        role: userRecord.role,
        auth_method: "DATABASE_PBKDF2_SECURE",
      },
    });

    const sessionUser: UserAccount = {
      id: userRecord.id,
      email: userRecord.email,
      fullName: userRecord.full_name,
      role: userRecord.role,
      avatar: userRecord.avatar || userRecord.full_name.slice(0, 2).toUpperCase(),
    };

    // 8. Issue HTTP-Only, SameSite, Secure session cookie
    // (Note: To be combined with explorer_m2_2's HMAC-signed session token createSessionToken(sessionUser))
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, JSON.stringify(sessionUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return {
      success: true,
      user: sessionUser,
    };
  }

  static async getCurrentUser(): Promise<UserAccount | null> {
    try {
      const cookieStore = await cookies();
      const session = cookieStore.get(COOKIE_NAME);
      if (!session || !session.value) return null;
      return JSON.parse(session.value) as UserAccount;
    } catch {
      return null;
    }
  }

  static async logout(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  }
}
```

---

### 4.3 Proposed Code for `src/app/actions/authActions.ts`

```typescript
"use server";

import { AuthService, UserAccount } from "@/lib/services/authService";

export async function loginAction(
  email: string,
  password: string,
  clientIp?: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    return await AuthService.authenticate(email, password, clientIp);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication service failure.";
    return { success: false, error: message };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    await AuthService.logout();
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getSessionUserAction(): Promise<UserAccount | null> {
  try {
    return await AuthService.getCurrentUser();
  } catch {
    return null;
  }
}
```

---

## 5. Verification Method

To independently verify the implementation and prove correctness against all acceptance criteria:

### 5.1 Static Typecheck Verification
Execute TypeScript compilation to confirm zero type errors across `authService.ts`, `authActions.ts`, and `dataStore.ts`:
```powershell
npx.cmd tsc --noEmit
```
**Expected Result:** Exit code 0, 0 compilation errors.

### 5.2 Lint Verification
Verify that `authActions.ts` and `authService.ts` introduce zero lint errors:
```powershell
npm.cmd run lint
```
**Expected Result:** `authActions.ts:11` no longer reports `@typescript-eslint/no-explicit-any`.

### 5.3 Account-Tier Rate Limiting Test Procedure
Execute sequential authentication attempts against a specific account from an IP:
```powershell
# In PowerShell or Node test script:
# Submit 5 incorrect passwords for 'admin@eventportal.com'
# Attempt 1 -> fails (4 attempts remaining before lockout)
# Attempt 2 -> fails (3 attempts remaining)
# Attempt 3 -> fails (2 attempts remaining)
# Attempt 4 -> fails (1 attempt remaining)
# Attempt 5 -> fails (0 attempts remaining, AUTH_LOCKOUT emitted)
# Attempt 6 -> returns HTTP 429 lockout notice:
# "Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes."
```

### 5.4 IP-Tier Rate Limiting Test Procedure
Execute authentication attempts across 30 different accounts from a single IP (`clientIp = "192.168.1.100"`):
```powershell
# Attempts 1 to 30: 30 distinct random email addresses with wrong passwords
# Attempt 30 -> triggers IP threshold (30 failures in 900s) -> AUTH_LOCKOUT emitted for IP
# Attempt 31 on ANY email from that IP -> immediately rejected:
# "Too many failed login attempts from this network. Please try again in 15 minutes."
```

### 5.5 Auxiliary Account Bypass Immunity Test
Verify that successful login on account B does NOT clear IP rate limits:
1. Make 29 failed attempts from `10.0.0.50` on accounts `victim1@...` through `victim29@...`.
2. Submit a valid login for `attacker@throwaway.com` from `10.0.0.50`.
3. Login succeeds (`AUTH_LOGIN_SUCCESS`).
4. Attempt 1 more failed login on `victim30@...` from `10.0.0.50`.
5. **Expected Outcome:** The request is throttled (`IP_LOCKOUT`). The auxiliary login did not reset the IP counter.

### 5.6 Audit Telemetry Verification
Inspect audit logs in `data/events-data.json` or query via `fetchEventAuditLogsAction("all")`:
1. Verify `action: "AUTH_LOGIN_SUCCESS"` entries have `severity: "INFO"`, `actor_role: "ADMIN" | "VOLUNTEER"`, `event_id: null`.
2. Verify `action: "AUTH_LOGIN_FAILURE"` entries have `severity: "WARNING"`, `actor_id: "anonymous"`, `actor_role: "SYSTEM"`, `event_id: null`.
3. Verify `action: "AUTH_LOCKOUT"` entries have `severity: "CRITICAL"`, `actor_id: "anonymous"`, `actor_role: "SYSTEM"`, `event_id: null`, and include `retryAfterSec` and `threshold` in `details`.

### 5.7 Invalidation Conditions
This strategy is invalidated if:
1. `event_id` in PostgreSQL table `audit_logs` is altered to enforce `NOT NULL` (violates `docs/SECURITY.md` Section 8.1).
2. The sliding window timestamps are replaced with fixed bucket counters (reintroduces boundary burst vulnerabilities).
3. `resetRateLimit` is modified to clear `ipAttempts` upon user login (reopens auxiliary account bypass).
