// Proposed updates for src/lib/services/authService.ts & src/lib/services/cryptoService.ts

import crypto from "crypto";

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

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
 * Signature: verifyPassword(password, storedHash, storedSalt)
 * Resilient against swapped parameter order (hash vs salt).
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
