# Technical Architecture & Strategy: Dual-Tier Rate Limiting & Auth Audit Telemetry
## Universal Event Registration & QR Check-in System — Milestone 2

### 1. Executive Summary & Problem Scope

The authentication workflow in `src/lib/services/authService.ts` and `src/app/actions/authActions.ts` handles administrator and gate volunteer access to the event management system. To withstand credential stuffing, password spraying, and brute-force dictionary attacks, the platform requires a robust **Dual-Tier Sliding-Window Rate Limiter** and comprehensive **Security Audit Telemetry**.

#### Key Vulnerabilities in Current Implementation:
1. **Single-Tier Fixed-Window IP Limiting**: Current `checkIpRateLimit` in `src/lib/services/authService.ts:31-49` uses a fixed 5-minute bucket allowing 12 requests. It does not track per-account failures in memory, leaving single accounts vulnerable to distributed botnet attacks from multiple IP addresses.
2. **Quota Consumption on Success**: The existing bucket increments on *every* request (even valid logins), penalizing legitimate staff members.
3. **No Non-Existent Account Throttling**: If an attacker attempts to brute-force a non-existent account, current database tracking in `recordFailedLoginAttempt` does not enforce sliding-window lockouts in memory.
4. **Header Extraction Flaws**: `headers().get("x-forwarded-for")` lacks robust error handling for non-request environments (e.g. test suites, background tasks).
5. **Legacy Telemetry Actions**: Telemetry actions in `authService.ts` emit legacy strings (`LOGIN_SUCCESS`, `LOGIN_ACCOUNT_LOCKED`, with `event_id: "system"`) instead of the standardized invariant specifications (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`, with `event_id: null`).

---

### 2. Dual-Tier Sliding-Window Rate Limiter Architecture

#### 2.1 Threat Mitigation Matrix

| Dimension | Tier 1: Account-Level | Tier 2: IP-Level |
|---|---|---|
| **Tracking Key** | `account:${email.toLowerCase()}` | `ip:${clientIp}` |
| **Threshold** | **5 failed attempts** | **30 failed attempts** |
| **Sliding Window** | 15 minutes (900 seconds) | 15 minutes (900 seconds) |
| **Primary Threat** | Distributed brute-force against a single high-privilege account across multiple IPs | Password spraying (1 common password against many accounts) and automated credential stuffing from a single IP/proxy |
| **Lockout Duration** | 900 seconds from oldest attempt in window | 900 seconds from oldest attempt in window |
| **Action on Lockout** | Account locked; returns HTTP 429 lockout notice; emits `AUTH_LOCKOUT` audit telemetry (`target_name: email`) | IP blocked; returns HTTP 429 network throttle notice; emits `AUTH_LOCKOUT` audit telemetry (`target_name: clientIp`) |
| **Reset on Success** | **Cleared immediately** (legitimate account owner authenticated) | **Retained** (prevents malicious actors from resetting IP counters via auxiliary accounts) |

#### 2.2 Data Structures & Memory Management

To eliminate fixed-window boundary burst vulnerabilities, attempts are recorded as timestamps (in integer Unix epoch seconds) in sliding-window arrays.

```typescript
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
```

#### Memory Leak Prevention:
In-memory Maps can grow unboundedly if attackers spray arbitrary email strings. The `DualTierRateLimiter` implements proactive pruning:
- On every read or write, `pruneExpired(record, nowSec)` filters timestamps where `ts <= nowSec - 900`.
- If `record.timestamps.length === 0`, the key is deleted from the `Map` via `map.delete(key)`.
- This ensures memory usage is strictly bounded to *active* offenders within the current 15-minute window.

---

### 3. Safe Client IP Extraction Strategy

In Next.js 16 (App Router), `headers()` returns `Promise<ReadonlyHeaders>`. Calling `headers()` outside a server request context (e.g. in unit tests or CLI execution) throws a runtime error.

#### Extraction Algorithm:
1. If an explicit `clientIp` parameter is supplied to `authenticate(email, password, clientIp?: string)`, use it directly.
2. Otherwise, wrap `await headers()` in a `try...catch` block.
3. Parse `x-forwarded-for`: split on `,`, take index `0`, and trim whitespace.
4. If empty or absent, fall back to `x-real-ip`.
5. If neither exists or if `headers()` throws, fall back to `"127.0.0.1"`.
6. Concurrently extract `user-agent` header with fallback to `"unknown"`.

```typescript
/**
 * Safely extracts client IP from request headers with robust fallback.
 * Handles reverse proxies, load balancers, and test environments.
 */
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
```

---

### 4. Security Audit Telemetry Invariants

Per `docs/SECURITY.md` Section 8.1, authentication telemetry occurs before a session is established or outside the scope of any single event. Therefore:
- `event_id` is declared **nullable** in PostgreSQL and TypeScript: `event_id: null`.
- `actor_role` defaults to `'SYSTEM'` (or authenticated user role on success).
- `actor_id` is `'anonymous'` for failures and lockouts, and the authenticated user UUID for success.

#### Audit Event Specification:

| Event Identifier | Severity | Actor ID | Actor Role | Target Name | Key Details Payload |
|---|---|---|---|---|---|
| `AUTH_LOGIN_SUCCESS` | `INFO` | `user.id` | `user.role` | `user.full_name` | `{ email, role, auth_method: "DATABASE_PBKDF2_SECURE" }` |
| `AUTH_LOGIN_FAILURE` | `WARNING` | `"anonymous"` | `"SYSTEM"` | `cleanEmail` | `{ email, reason, remainingAttempts, clientIp }` |
| `AUTH_LOCKOUT` | `CRITICAL` | `"anonymous"` | `"SYSTEM"` | `cleanEmail` or `clientIp` | `{ reason: "ACCOUNT_LOCKOUT" \| "IP_LOCKOUT", retryAfterSec, threshold, lockoutExpiry }` |

---

### 5. Step-by-Step Execution Flow in `AuthService.authenticate`

```
  [Incoming Login Request: email, password, explicitClientIp?]
                             │
                             ▼
  [Step 1: Extract Client IP & User Agent (safe headers() + fallback)]
                             │
                             ▼
  [Step 2: Normalize Inputs (trim, toLowerCase, empty check, regex validation)]
                             │
                             ▼
  [Step 3: SQL Injection Detection (detectSqlInjection) -> CHECK_IN_TAMPER_ATTEMPT if flagged]
                             │
                             ▼
  [Step 4: Pre-Authentication Dual-Tier Rate Limit Check]
      ├── IP Tier >= 30 failures? ───► YES ──► Return HTTP 429 ("Too many failed login attempts...")
      └── Account Tier >= 5 failures? ──► YES ──► Return HTTP 429 ("Account temporarily locked...")
                             │
                            PASS
                             ▼
  [Step 5: Account Lookup (getDbUserByEmail)]
      └── User not found? ──► YES
                               ├── Synthetic Jitter (350-550ms)
                               ├── DualTierRateLimiter.recordFailedLogin(cleanEmail, clientIp)
                               ├── Log AUTH_LOGIN_FAILURE (WARNING, event_id: null)
                               ├── If threshold reached -> Log AUTH_LOCKOUT (CRITICAL)
                               └── Return error: "Invalid account credentials."
                             │
                         FOUND USER
                             ▼
  [Step 6: Database Persistent Lockout Check (locked_until > now)]
      └── Active Lockout? ──► YES ──► Return "Security lockout active: Retry in X minutes."
                             │
                            PASS
                             ▼
  [Step 7: Constant-Time Password Verification (verifyPassword)]
      └── Invalid Password? ──► YES
                                 ├── Synthetic Jitter (400-600ms)
                                 ├── DualTierRateLimiter.recordFailedLogin(cleanEmail, clientIp)
                                 ├── Update DB user failed_attempts
                                 ├── Log AUTH_LOGIN_FAILURE (WARNING, event_id: null)
                                 ├── If threshold reached -> Log AUTH_LOCKOUT (CRITICAL)
                                 └── Return error: "Invalid credentials. (X attempts remaining)"
                             │
                         MATCH OK
                             ▼
  [Step 8: Authentication Success]
      ├── DualTierRateLimiter.resetRateLimit(cleanEmail) (Retain IP bucket!)
      ├── resetFailedLoginAttempts(cleanEmail) (Clear DB lockout)
      ├── Log AUTH_LOGIN_SUCCESS (INFO, actor: user.id, role: user.role, event_id: null)
      ├── createSessionToken(sessionUser) (HMAC-SHA256 signed session cookie)
      └── Return { success: true, user: sessionUser }
```

---

### 6. Reference Implementation Snippets

#### 6.1 `DualTierRateLimiter` Class
```typescript
export class DualTierRateLimiter {
  private static accountAttempts = new Map<string, AttemptRecord>();
  private static ipAttempts = new Map<string, AttemptRecord>();

  public static readonly ACCOUNT_MAX_ATTEMPTS = 5;
  public static readonly IP_MAX_ATTEMPTS = 30;
  public static readonly WINDOW_SECONDS = 900; // 15 minutes

  private static pruneExpired(record: AttemptRecord, nowSec: number): void {
    const cutoff = nowSec - this.WINDOW_SECONDS;
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
  }

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

  static checkRateLimit(email: string, clientIp: string): RateLimitResult {
    const nowSec = Math.floor(Date.now() / 1000);
    const cleanEmail = email ? email.trim().toLowerCase() : "";
    const cleanIp = clientIp ? clientIp.trim() : "127.0.0.1";

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

    return { allowed: true, remainingAttempts: remaining };
  }

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

  static resetRateLimit(email: string): void {
    const cleanEmail = email ? email.trim().toLowerCase() : "";
    if (cleanEmail) {
      this.accountAttempts.delete(cleanEmail);
    }
  }

  static resetAll(): void {
    this.accountAttempts.clear();
    this.ipAttempts.clear();
  }
}
```

#### 6.2 Updated `src/app/actions/authActions.ts`
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
