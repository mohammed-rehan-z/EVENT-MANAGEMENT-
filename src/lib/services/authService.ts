import crypto from "crypto";
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
} from "./cryptoService";

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
  email: string; // Normalized lowercase email
  role: "ADMIN" | "VOLUNTEER";
  fullName: string;
  avatar?: string;
  issuedAt: number; // Unix epoch seconds (Math.floor(Date.now() / 1000))
  expiresAt: number; // Unix epoch seconds
}

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

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

export const COOKIE_NAME = "event_auth_session";

// --- PBKDF2 HMAC-SHA512 CRYPTOGRAPHIC PASSWORD HASHING ---

/**
 * PBKDF2 Cryptographic Key Derivation using HMAC-SHA512
 * - Algorithm: PBKDF2
 * - Digest: HMAC-SHA512
 * - Iterations: 100,000 rounds
 * - Salt: 32 bytes (256 bits) cryptographically random entropy (64 hex characters)
 * - Key Length: 64 bytes (512 bits) hex-encoded (128 hex characters)
 * - Execution: Asynchronous libuv threadpool (non-blocking)
 */
export function hashPassword(
  password: string,
  saltHex?: string
): Promise<PasswordHashResult> {
  return new Promise((resolve, reject) => {
    if (!password || typeof password !== "string") {
      return reject(new Error("Password must be a non-empty string."));
    }

    // Generate 32 bytes (256 bits) of cryptographic entropy -> 64-char hex string
    const salt =
      saltHex && typeof saltHex === "string" && saltHex.trim().length > 0
        ? saltHex.trim()
        : crypto.randomBytes(32).toString("hex");

    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve({
        hash: derivedKey.toString("hex"),
        salt,
      });
    });
  });
}

/**
 * Constant-time password verification to prevent timing attack side-channels.
 * Parameter-order resilient against swapped parameter order (hash vs salt).
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  if (!password || !storedHash || !storedSalt) {
    return false;
  }

  try {
    // Parameter ordering defense:
    // A 64-byte derived key is 128 hex characters.
    // A 32-byte salt is 64 hex characters (or 32 chars for legacy salts).
    let expectedHash = storedHash;
    let salt = storedSalt;
    if (storedHash.length <= 64 && storedSalt.length === 128) {
      expectedHash = storedSalt;
      salt = storedHash;
    }

    const { hash: candidateHash } = await hashPassword(password, salt);

    const candidateBuffer = Buffer.from(candidateHash, "hex");
    const storedBuffer = Buffer.from(expectedHash, "hex");

    // timingSafeEqual requires identical byte lengths; return false if length differs
    if (candidateBuffer.length !== storedBuffer.length || candidateBuffer.length === 0) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
  } catch {
    return false;
  }
}

// --- SESSION SECRET & HMAC-SHA256 SIGNED TOKENS ---

let devSecretWarningEmitted = false;

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET;

  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CRITICAL: SESSION_SECRET or AUTH_SECRET environment variable must be set with at least 32 characters in production."
    );
  }

  if (!devSecretWarningEmitted) {
    console.warn(
      "[SECURITY WARNING] No valid SESSION_SECRET or AUTH_SECRET found (must be >= 32 characters). Falling back to development secret. DO NOT deploy this configuration to production!"
    );
    devSecretWarningEmitted = true;
  }

  return (
    secret?.trim() ||
    "dev-insecure-session-secret-at-least-32-chars-long-do-not-use-in-production"
  );
}

/**
 * Generates an HMAC-SHA256 signed session token formatted as <base64UrlPayload>.<hmacSignature>.
 * Uses integer Unix epoch seconds for issuedAt and expiresAt.
 */
export function createSessionToken(
  user: {
    id?: string;
    userId?: string;
    email: string;
    fullName?: string;
    full_name?: string;
    role: "ADMIN" | "VOLUNTEER";
    avatar?: string;
  },
  lifetimeSeconds?: number
): string {
  const canonicalId = user.id || user.userId;
  if (!canonicalId) {
    throw new Error("createSessionToken: User must have an id or userId.");
  }

  const displayName = user.fullName || user.full_name || "User";
  const lifetime =
    lifetimeSeconds !== undefined
      ? lifetimeSeconds
      : user.role === "VOLUNTEER"
      ? 86400
      : 604800; // 24h for volunteer, 7d for admin

  const secret = getSessionSecret();
  const nowSec = Math.floor(Date.now() / 1000);

  const payload: SessionPayload = {
    id: canonicalId,
    userId: canonicalId,
    email: user.email.trim().toLowerCase(),
    role: user.role,
    fullName: displayName,
    avatar: user.avatar || displayName.slice(0, 2).toUpperCase(),
    issuedAt: nowSec,
    expiresAt: nowSec + lifetime,
  };

  const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signatureHex = crypto
    .createHmac("sha256", secret)
    .update(payloadBase64Url)
    .digest("hex");

  return `${payloadBase64Url}.${signatureHex}`;
}

/**
 * Synchronously verifies and decodes a signed session token using crypto.timingSafeEqual.
 */
export function verifySessionTokenSync(
  token: string | undefined | null
): SessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.trim().split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64Url, signatureHex] = parts;
  if (!payloadBase64Url || !signatureHex) {
    return null;
  }

  // HMAC-SHA256 hex digest is exactly 64 hex characters (32 bytes)
  if (signatureHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const expectedSigHex = crypto
      .createHmac("sha256", secret)
      .update(payloadBase64Url)
      .digest("hex");

    const sigBuf = Buffer.from(signatureHex, "hex");
    const expSigBuf = Buffer.from(expectedSigHex, "hex");

    // Timing-safe constant-time equality check
    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as Partial<SessionPayload>;

    const nowSec = Math.floor(Date.now() / 1000);

    // Validate expiration in integer seconds
    if (typeof payload.expiresAt !== "number" || nowSec > payload.expiresAt) {
      return null;
    }

    // Sanity check future issuedAt (clock skew allowance 60s)
    if (typeof payload.issuedAt !== "number" || payload.issuedAt > nowSec + 60) {
      return null;
    }

    const canonicalId = payload.id || payload.userId;
    if (!canonicalId || !payload.email || !payload.role || !payload.fullName) {
      return null;
    }

    if (payload.role !== "ADMIN" && payload.role !== "VOLUNTEER") {
      return null;
    }

    return {
      id: canonicalId,
      userId: canonicalId,
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
      avatar: payload.avatar,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Asynchronously verifies and decodes a signed session token.
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  return verifySessionTokenSync(token);
}

// --- DUAL-TIER SLIDING WINDOW RATE LIMITER ---

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
  private static getOrClean(
    map: Map<string, AttemptRecord>,
    key: string,
    nowSec: number
  ): AttemptRecord {
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
          errorMessage:
            "Too many failed login attempts from this network. Please try again in 15 minutes.",
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
          errorMessage:
            "Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
        };
      }
    }

    const ipCount = cleanIp
      ? this.ipAttempts.get(cleanIp)?.timestamps.length || 0
      : 0;
    const acctCount = cleanEmail
      ? this.accountAttempts.get(cleanEmail)?.timestamps.length || 0
      : 0;
    const remaining = Math.max(
      0,
      Math.min(
        this.ACCOUNT_MAX_ATTEMPTS - acctCount,
        this.IP_MAX_ATTEMPTS - ipCount
      )
    );

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

// --- SAFE CLIENT IP & USER AGENT EXTRACTION ---

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
  static hashPassword = hashPassword;
  static verifyPassword = verifyPassword;
  static createSessionToken = createSessionToken;
  static verifySessionToken = verifySessionToken;
  static verifySessionTokenSync = verifySessionTokenSync;

  /**
   * Interface contract polymorphic rate check: evaluates single identifier or dual parameters
   */
  static checkRateLimit(
    identifier: string,
    tier?: "ACCOUNT" | "IP"
  ): RateLimitResult {
    const isIp = tier === "IP" || (!tier && !identifier.includes("@"));
    if (isIp) {
      const cleanIp = identifier.replace(/^ip:/, "").trim();
      return DualTierRateLimiter.checkRateLimit("", cleanIp);
    } else {
      const cleanEmail = identifier.replace(/^account:/, "").trim();
      return DualTierRateLimiter.checkRateLimit(cleanEmail, "");
    }
  }

  static checkDualRateLimit(params: {
    email?: string;
    clientIp?: string;
  }): RateLimitResult {
    return DualTierRateLimiter.checkRateLimit(
      params.email || "",
      params.clientIp || ""
    );
  }

  static recordFailedLogin(params: {
    email?: string;
    clientIp?: string;
  }): RateLimitResult {
    return DualTierRateLimiter.recordFailedLogin(
      params.email || "",
      params.clientIp || ""
    );
  }

  static resetRateLimit(email: string): void {
    DualTierRateLimiter.resetRateLimit(email);
  }

  /**
   * Secure database-backed authentication with SQL injection filtering,
   * dual-tier sliding-window rate limiting, constant-time password verification,
   * HMAC-SHA256 session token generation, and audit telemetry.
   */
  static async authenticate(
    email: string,
    password: string,
    explicitClientIp?: string
  ): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    // 1. Resolve client IP & User Agent for audit telemetry
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
          violation:
            "Malicious SQL query keywords or quotation payloads in auth parameters.",
        },
      });

      // Synthetic randomized jitter to thwart timing attacks
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 300));

      return {
        success: false,
        error: "Invalid account name or password syntax.",
      };
    }

    // 3. Pre-Authentication Dual-Tier Rate Limit Check
    const rateCheck = DualTierRateLimiter.checkRateLimit(cleanEmail, clientIp);
    if (!rateCheck.allowed) {
      await logSecurityAuditAction({
        event_id: null,
        action: "AUTH_LOCKOUT",
        severity: "CRITICAL",
        actor_id: "anonymous",
        actor_role: "SYSTEM",
        target_name:
          rateCheck.lockoutReason === "IP_LOCKOUT" ? clientIp : cleanEmail,
        ip_address: clientIp,
        user_agent: userAgent,
        details: {
          reason: rateCheck.lockoutReason,
          retryAfterSec: rateCheck.retryAfterSec,
          threshold:
            rateCheck.lockoutReason === "IP_LOCKOUT"
              ? DualTierRateLimiter.IP_MAX_ATTEMPTS
              : DualTierRateLimiter.ACCOUNT_MAX_ATTEMPTS,
          lockoutExpiry: new Date(
            Date.now() + (rateCheck.retryAfterSec || 900) * 1000
          ).toISOString(),
        },
      });

      return {
        success: false,
        error:
          rateCheck.errorMessage ||
          "Too many failed login attempts. Please try again in 15 minutes.",
      };
    }

    // 4. Retrieve user record from persistent database / Supabase
    const userRecord = await getDbUserByEmail(cleanEmail);

    if (!userRecord) {
      // Artificial delay to prevent user-enumeration timing attacks
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 200));

      // Record failed attempt in dual-tier rate limiter
      const failResult = DualTierRateLimiter.recordFailedLogin(
        cleanEmail,
        clientIp
      );

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
          target_name:
            failResult.lockoutReason === "IP_LOCKOUT" ? clientIp : cleanEmail,
          ip_address: clientIp,
          user_agent: userAgent,
          details: {
            reason: failResult.lockoutReason,
            retryAfterSec: failResult.retryAfterSec,
            threshold:
              failResult.lockoutReason === "IP_LOCKOUT"
                ? DualTierRateLimiter.IP_MAX_ATTEMPTS
                : DualTierRateLimiter.ACCOUNT_MAX_ATTEMPTS,
            lockoutExpiry: new Date(
              Date.now() + (failResult.retryAfterSec || 900) * 1000
            ).toISOString(),
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
        const remainingMinutes = Math.max(
          1,
          Math.ceil((lockExpiry - now) / 60000)
        );
        return {
          success: false,
          error: `Security lockout active: Too many consecutive failed attempts. Please retry in ${remainingMinutes} minute(s).`,
        };
      }
    }

    // 6. Cryptographic constant-time password check
    const saltToVerify = userRecord.salt || userRecord.password_salt;
    const isPasswordValid = await verifyPassword(
      cleanPassword,
      userRecord.password_hash,
      saltToVerify
    );

    if (!isPasswordValid) {
      // Record failure in in-memory dual-tier rate limiter
      const failResult = DualTierRateLimiter.recordFailedLogin(
        cleanEmail,
        clientIp
      );

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
          target_name:
            failResult.lockoutReason === "IP_LOCKOUT" ? clientIp : cleanEmail,
          ip_address: clientIp,
          user_agent: userAgent,
          details: {
            reason: failResult.lockoutReason,
            retryAfterSec: failResult.retryAfterSec,
            threshold:
              failResult.lockoutReason === "IP_LOCKOUT"
                ? DualTierRateLimiter.IP_MAX_ATTEMPTS
                : DualTierRateLimiter.ACCOUNT_MAX_ATTEMPTS,
            lockoutExpiry: new Date(
              Date.now() + (failResult.retryAfterSec || 900) * 1000
            ).toISOString(),
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

    // 7. Successful login: reset account-level rate limiter and DB failed counters
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
      avatar:
        userRecord.avatar || userRecord.full_name.slice(0, 2).toUpperCase(),
    };

    // 8. Issue HTTP-Only, SameSite, Secure HMAC-signed session cookie
    const lifetimeSeconds =
      sessionUser.role === "VOLUNTEER" ? 86400 : 604800; // 24h vs 7d
    const sessionToken = createSessionToken(sessionUser, lifetimeSeconds);

    try {
      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: lifetimeSeconds,
      });
    } catch {
      // Graceful fallback for non-request contexts (e.g., test runs)
    }

    return {
      success: true,
      user: sessionUser,
    };
  }

  /**
   * Reads and cryptographically verifies current user session from HTTP-only cookie.
   */
  static async getCurrentUser(): Promise<UserAccount | null> {
    try {
      const cookieStore = await cookies();
      const session = cookieStore.get(COOKIE_NAME);
      if (!session || !session.value) return null;

      const payload = await verifySessionToken(session.value);
      if (!payload) return null;

      return {
        id: payload.id,
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role,
        avatar: payload.avatar || payload.fullName.slice(0, 2).toUpperCase(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Destroys current session cookie and logs out
   */
  static async logout(): Promise<void> {
    try {
      const cookieStore = await cookies();
      cookieStore.delete(COOKIE_NAME);
    } catch {
      // Graceful fallback for non-request contexts
    }
  }
}
