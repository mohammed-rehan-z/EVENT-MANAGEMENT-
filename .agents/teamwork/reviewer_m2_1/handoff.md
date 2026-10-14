# Milestone 2 Review Report: Password Cryptography, Key Derivation & Signed Session Tokens

**Reviewer Identity:** `reviewer_m2_1`  
**Roles:** reviewer, critic  
**Target Files:** `src/lib/services/authService.ts`, `src/app/actions/authActions.ts`  
**Milestone:** Milestone 2 (Part 1: Password Cryptography, Key Derivation & Signed Session Tokens)  
**Date:** 2026-10-15  
**Verdict:** `APPROVE`

---

## 1. Observation

### 1.1 Integrity & Facade Check
- **Integrity Violation Analysis**: Source code in `src/lib/services/authService.ts` and `src/app/actions/authActions.ts` was audited line-by-line for dummy implementations, facade classes, hardcoded test return vectors, or bypassed verification.
- **Finding**: All logic is fully implemented using Node.js native `crypto` modules (`crypto.pbkdf2`, `crypto.randomBytes`, `crypto.createHmac`, `crypto.timingSafeEqual`). No dummy stubs, shortcuts, or fake data mockups were found.

### 1.2 Verification Task Audit

#### Task 1: PBKDF2 Password Hashing & Key Derivation
- **Location**: `src/lib/services/authService.ts` lines 63–86:
  ```typescript
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
  ```
- **Audit Findings**:
  - Algorithm: PBKDF2 with HMAC-SHA512 (`"sha512"`).
  - Iteration Count: `100,000` rounds.
  - Salt: 32 bytes (256 bits) of cryptographic entropy generated via `crypto.randomBytes(32).toString("hex")`, producing a 64-character hex string.
  - Key Length: 64 bytes (512 bits) hex-encoded (`derivedKey.toString("hex")`), producing a 128-character hex string.
  - Asynchronous Execution: Runs on Node's libuv threadpool (non-blocking).

#### Task 2: Constant-Time Password Verification & Parameter Swap Defense
- **Location**: `src/lib/services/authService.ts` lines 92–126:
  ```typescript
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
  ```
- **Audit Findings**:
  - Parameter Ordering Defense: If `storedHash.length <= 64 && storedSalt.length === 128`, parameters are automatically realigned, preventing false rejections if caller passes `(password, salt, hash)`.
  - Buffer Length Safety Check: Ensures `candidateBuffer.length === storedBuffer.length` prior to calling `crypto.timingSafeEqual`, preventing unhandled runtime `TypeError` exceptions.
  - Timing Attack Resistance: Constant-time comparison is strictly enforced via `crypto.timingSafeEqual`.
  - Exception Handling: Safe `try / catch` wrapper returning `false` on malformed inputs.

#### Task 3: Session Token Generation
- **Location**: `src/lib/services/authService.ts` lines 162–210:
  ```typescript
  export function createSessionToken(
    user: { ... },
    lifetimeSeconds?: number
  ): string {
    ...
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

    const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signatureHex = crypto
      .createHmac("sha256", secret)
      .update(payloadBase64Url)
      .digest("hex");

    return `${payloadBase64Url}.${signatureHex}`;
  }
  ```
- **Audit Findings**:
  - Signature Algorithm: HMAC-SHA256 (`crypto.createHmac("sha256", secret)`).
  - Serialized Format: `<base64UrlPayload>.<hmacSignature>`.
  - Timestamp Units: Explicit integer Unix epoch seconds using `Math.floor(Date.now() / 1000)` for both `issuedAt` and `expiresAt` (86,400s / 24h for VOLUNTEER; 604,800s / 7d for ADMIN).

#### Task 4: Session Token Verification (Sync & Async)
- **Location**: `src/lib/services/authService.ts` lines 215–298:
  ```typescript
  export function verifySessionTokenSync(token: string | undefined | null): SessionPayload | null {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64Url, signatureHex] = parts;
    if (!payloadBase64Url || !signatureHex) return null;

    if (signatureHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
      return null;
    }

    try {
      const secret = getSessionSecret();
      const expectedSigHex = crypto.createHmac("sha256", secret).update(payloadBase64Url).digest("hex");
      const sigBuf = Buffer.from(signatureHex, "hex");
      const expSigBuf = Buffer.from(expectedSigHex, "hex");

      if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
        return null;
      }

      const jsonStr = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
      const payload = JSON.parse(jsonStr) as Partial<SessionPayload>;

      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof payload.expiresAt !== "number" || nowSec > payload.expiresAt) {
        return null;
      }
      if (typeof payload.issuedAt !== "number" || payload.issuedAt > nowSec + 60) {
        return null;
      }
      ...
  ```
- **Audit Findings**:
  - Signature Verification: HMAC-SHA256 recomputed and verified using `crypto.timingSafeEqual(sigBuf, expSigBuf)`.
  - Hex Signature Format Check: Exact 64 hex characters (32 bytes).
  - Expiration Enforcement: Checked against integer seconds `nowSec > payload.expiresAt`.
  - Future Timestamp Sanity Check: Guards against future issuedAt with a 60-second clock skew tolerance (`payload.issuedAt > nowSec + 60 -> null`).
  - Schema Invariants: Mandatory validation of canonical ID, normalized email, role restriction (`ADMIN` | `VOLUNTEER`), and display name.
  - Asynchronous Interface: `verifySessionToken` wraps `verifySessionTokenSync` in a Promise for unified async consumer workflows.

#### Task 5: Cookie Security Options
- **Location**: `src/lib/services/authService.ts` lines 840–848:
  ```typescript
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: lifetimeSeconds,
  });
  ```
- **Audit Findings**:
  - `COOKIE_NAME`: `"event_auth_session"` (line 50).
  - `httpOnly`: `true` (prohibits JavaScript document.cookie access).
  - `secure`: `process.env.NODE_ENV === "production"` (enforces HTTPS in production; allows localhost in dev).
  - `sameSite`: `"lax"` (guards against CSRF while preserving top-level GET navigation).
  - `path`: `"/"` (entire domain scope).
  - `maxAge`: `lifetimeSeconds` (86400s for Volunteer, 604800s for Admin).

#### Task 6: Server Actions Audit
- **Location**: `src/app/actions/authActions.ts` lines 1–34:
  - Top-level `"use server"` directive present.
  - `loginAction(email, password, clientIp)`: delegates to `AuthService.authenticate` with typed `UserAccount` return and user-facing error message sanitization.
  - `logoutAction()`: delegates to `AuthService.logout()` and returns `{ success: boolean }`.
  - `getSessionUserAction()`: delegates to `AuthService.getCurrentUser()`.

### 1.3 Independent Build & Compilation Execution
Direct commands executed in Windows PowerShell:
1. `npx.cmd tsc --noEmit`
   - Exit code: `0`
   - Output: 0 errors. TypeScript compilation passed cleanly.
2. `npm.cmd run build`
   - Exit code: `0`
   - Output: Next.js 16.4.0 (Turbopack) successfully compiled the production application in 1771ms.
   - Route verification: All 17 static and dynamic routes compiled without errors.

---

## 2. Logic Chain

1. **Cryptographic Strength & Compliance**:
   - The key derivation routine uses PBKDF2 with HMAC-SHA512, 100,000 iterations, 32-byte (64 hex characters) cryptographically secure salt, and 64-byte (128 hex characters) derived key length. This matches NIST SP 800-132 recommendations and `docs/SECURITY.md` §3 specifications.
2. **Side-Channel Attack Mitigation**:
   - Both `verifyPassword` and `verifySessionTokenSync` compare cryptographic byte sequences using Node.js `crypto.timingSafeEqual`.
   - Length equality is validated before invoking `timingSafeEqual`, preventing runtime exceptions while maintaining constant-time execution over equal-length digests.
3. **Session Token Hardening & Replay Defense**:
   - Session tokens follow RFC 7515 principles: `<base64UrlPayload>.<hmacSignature>`.
   - The token contains integer epoch seconds for `issuedAt` and `expiresAt`. Integer division by 1000 eliminates JavaScript millisecond comparison pitfalls.
   - Clock skew check rejects tokens claiming to be issued > 60 seconds into the future, preventing timestamp manipulation.
4. **Brute-Force & Credential Stuffing Resilience**:
   - `DualTierRateLimiter` enforces independent sliding windows for account (5 attempts / 15m) and IP (30 attempts / 15m).
   - In-memory attempt maps are pruned automatically upon expiration to eliminate memory leaks.
   - Successful account authentication resets the account-tier counter while retaining the IP-tier counter, preventing malicious actors from evading network throttling via burner accounts.
5. **No Regressions & Zero Lint/Type Errors**:
   - `npx.cmd tsc --noEmit` and `npm.cmd run build` pass with 0 errors, validating complete type and build compatibility across all routes and Server Actions.

---

## 3. Caveats

- **Dual-Mode Persistence Operation**: In the current local development environment, Supabase PostgreSQL credentials are placeholders. Data persistence is fully tested and operating via the local JSON datastore (`data/events-data.json`), which also contains pre-computed PBKDF2 hashes with 32-byte salts for `DEFAULT_USERS`.
- **In-Memory Rate Limiting Scope**: The `DualTierRateLimiter` stores rate-limiting sliding windows in Node.js process memory. In a multi-instance horizontally scaled deployment, an external distributed cache (e.g., Redis or Upstash) would be recommended, though for single-node / containerized operation the in-memory sliding window provides complete protection.

---

## 4. Conclusion

The implementation of Milestone 2 (Part 1: Password Cryptography, Key Derivation & Signed Session Tokens) in `src/lib/services/authService.ts` and `src/app/actions/authActions.ts` is robust, mathematically sound, free of integrity violations, and completely compliant with `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `docs/SECURITY.md`.

**Explicit Verdict:** `APPROVE`

---

## 5. Verification Method

To reproduce and independently verify all observations:

1. **Verify TypeScript Compilation**:
   ```powershell
   npx.cmd tsc --noEmit
   ```
   *Expected outcome*: Process exits with code 0 and no output.

2. **Verify Next.js Production Build**:
   ```powershell
   npm.cmd run build
   ```
   *Expected outcome*: Process exits with code 0 and confirms compilation of all 17 routes.

3. **Verify Cryptographic Invariants**:
   Inspect `src/lib/services/authService.ts`:
   - Line 78: confirms `crypto.pbkdf2(password, salt, 100000, 64, "sha512", ...)`.
   - Line 76: confirms `crypto.randomBytes(32).toString("hex")`.
   - Line 122: confirms `crypto.timingSafeEqual(candidateBuffer, storedBuffer)`.
   - Lines 188, 197–198: confirms `Math.floor(Date.now() / 1000)`.
   - Line 248: confirms `crypto.timingSafeEqual(sigBuf, expSigBuf)`.
   - Lines 841–847: confirms cookie attributes (`httpOnly: true`, `secure`, `sameSite: "lax"`, `path: "/"`).

**Invalidation Conditions:**
- Lowering PBKDF2 iterations below 100,000 or salt length below 32 bytes (64 hex characters).
- Replacing `crypto.timingSafeEqual` with standard string comparison (`===`).
- Removing the buffer length equality guard before `crypto.timingSafeEqual`.
- Reintroducing plaintext credentials into database seed data or UI forms.
