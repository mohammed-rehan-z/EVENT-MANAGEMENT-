import crypto from "crypto";

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
