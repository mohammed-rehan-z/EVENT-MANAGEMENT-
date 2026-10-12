import crypto from "crypto";

const QR_SECRET_KEY = process.env.QR_HMAC_SECRET || "event-security-hmac-salt-production-2026-secret";

export interface SignedQRPayload {
  v: number; // version
  tid: string; // team_id
  eid: string; // event_id
  tok: string; // unique random token
  exp: number; // unix timestamp seconds
  sig: string; // hmac-sha256 signature
}

/**
 * Generates an HMAC-SHA256 signature for a QR pass token
 */
export function signQRPayload(teamId: string, eventId: string, uniqueToken: string, expiresAtUnix: number): string {
  const data = `${teamId}:${eventId}:${uniqueToken}:${expiresAtUnix}`;
  return crypto.createHmac("sha256", QR_SECRET_KEY).update(data).digest("hex").slice(0, 32);
}

/**
 * Creates a tamper-evident encoded QR payload
 */
export function createSecureQRPayload(teamId: string, eventId: string, uniqueToken: string, expiresAtDate: Date): string {
  const exp = Math.floor(expiresAtDate.getTime() / 1000);
  const sig = signQRPayload(teamId, eventId, uniqueToken, exp);
  
  const payload: SignedQRPayload = {
    v: 1,
    tid: teamId,
    eid: eventId,
    tok: uniqueToken,
    exp,
    sig,
  };

  // Format as portable JSON or URL-safe encoded string
  return `SECQR:${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

/**
 * Verifies a QR payload string. Returns verification status, decoded data, and security violation reason if invalid.
 */
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
} {
  const clean = rawInput.trim();

  // If not prefixed with SECQR:, it is a raw UUID or legacy token
  if (!clean.startsWith("SECQR:")) {
    return {
      valid: true,
      isSignedPayload: false,
      token: clean,
    };
  }

  try {
    const base64Str = clean.slice(6);
    const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
    const payload: SignedQRPayload = JSON.parse(jsonStr);

    if (!payload.tid || !payload.tok || !payload.exp || !payload.sig) {
      return {
        valid: false,
        isSignedPayload: true,
        tamperDetected: true,
        errorMessage: "Malformed or corrupted security QR payload structure.",
      };
    }

    // Verify HMAC Signature
    const expectedSig = signQRPayload(payload.tid, payload.eid, payload.tok, payload.exp);
    if (payload.sig !== expectedSig) {
      return {
        valid: false,
        isSignedPayload: true,
        tamperDetected: true,
        errorMessage: "CRITICAL: Cryptographic signature mismatch! QR pass has been altered or forged.",
      };
    }

    // Verify Expiration
    const nowUnix = Math.floor(Date.now() / 1000);
    const expiresAtIso = new Date(payload.exp * 1000).toISOString();
    if (nowUnix > payload.exp) {
      return {
        valid: false,
        isSignedPayload: true,
        isExpired: true,
        teamId: payload.tid,
        eventId: payload.eid,
        token: payload.tok,
        expiresAt: expiresAtIso,
        errorMessage: `QR pass expired on ${new Date(payload.exp * 1000).toLocaleString()}. Admission denied.`,
      };
    }

    return {
      valid: true,
      isSignedPayload: true,
      teamId: payload.tid,
      eventId: payload.eid,
      token: payload.tok,
      expiresAt: expiresAtIso,
    };
  } catch (err: any) {
    return {
      valid: false,
      isSignedPayload: true,
      tamperDetected: true,
      errorMessage: "Cryptographic decoding failed: " + err.message,
    };
  }
}
