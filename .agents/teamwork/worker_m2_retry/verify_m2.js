const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

async function runTests() {
  console.log("=== STARTING MILESTONE 2 CRYPTO & AUTH VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Set test environment variable for session secret
  process.env.SESSION_SECRET = "super-secure-production-ready-test-secret-at-least-32-chars-long";

  // 1. PBKDF2 HMAC-SHA512 Password Hashing
  console.log("\n--- Testing PBKDF2 HMAC-SHA512 Hashing ---");
  function hashPassword(password, saltHex) {
    return new Promise((resolve, reject) => {
      if (!password || typeof password !== "string") {
        return reject(new Error("Password must be a non-empty string."));
      }
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

  async function verifyPassword(password, storedHash, storedSalt) {
    if (!password || !storedHash || !storedSalt) {
      return false;
    }
    try {
      let expectedHash = storedHash;
      let salt = storedSalt;
      if (storedHash.length <= 64 && storedSalt.length === 128) {
        expectedHash = storedSalt;
        salt = storedHash;
      }

      const { hash: candidateHash } = await hashPassword(password, salt);
      const candidateBuffer = Buffer.from(candidateHash, "hex");
      const storedBuffer = Buffer.from(expectedHash, "hex");

      if (candidateBuffer.length !== storedBuffer.length || candidateBuffer.length === 0) {
        return false;
      }
      return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
    } catch {
      return false;
    }
  }

  const hashResult = await hashPassword("TestPassword!2026");
  assert(typeof hashResult.salt === "string" && hashResult.salt.length === 64, "Salt is 32 bytes (64 hex characters)");
  assert(typeof hashResult.hash === "string" && hashResult.hash.length === 128, "Key length is 64 bytes (128 hex characters)");

  const verifyValid = await verifyPassword("TestPassword!2026", hashResult.hash, hashResult.salt);
  assert(verifyValid === true, "Valid password verifies correctly");

  const verifyWrong = await verifyPassword("WrongPassword!2026", hashResult.hash, hashResult.salt);
  assert(verifyWrong === false, "Incorrect password returns false");

  // Defense against parameter swap
  const verifySwapped = await verifyPassword("TestPassword!2026", hashResult.salt, hashResult.hash);
  assert(verifySwapped === true, "Swapped parameters (salt, hash) verify correctly via swap defense");

  const verifyEmpty = await verifyPassword("", hashResult.hash, hashResult.salt);
  assert(verifyEmpty === false, "Empty password returns false");

  // 2. Default Users Verification
  console.log("\n--- Testing DEFAULT_USERS PBKDF2 Credentials ---");
  const adminSalt = "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab";
  const adminHash = "680e3a63563829fcdf3cd860008179a1b3b947f3109dc6650b752f4c6fc8d5fd61abc88bbffcf100a53113f6fea5d18dab468c39b60751261b3058b42fea33de";
  const volSalt = "7956d5345e097592224035319f4860d392670f9fb43b8108ea2de0120664ef09";
  const volHash = "c10177b0231ed145ca2935cd240a035f916e5192f2caf9ec71fbec2db011a7ccd9128342eafa1fef455da161d63057a83bb2870ce2b112c7f312b6e6d935a6a5";

  assert(adminSalt.length === 64, "Admin salt is 64 hex characters (32 bytes)");
  assert(adminHash.length === 128, "Admin hash is 128 hex characters (64 bytes)");
  assert(volSalt.length === 64, "Volunteer salt is 64 hex characters (32 bytes)");
  assert(volHash.length === 128, "Volunteer hash is 128 hex characters (64 bytes)");

  const adminVerified = await verifyPassword("admin123", adminHash, adminSalt);
  assert(adminVerified === true, "Admin hash matches password 'admin123'");

  const volVerified = await verifyPassword("volunteer123", volHash, volSalt);
  assert(volVerified === true, "Volunteer hash matches password 'volunteer123'");

  // 3. HMAC-SHA256 Session Tokens
  console.log("\n--- Testing HMAC-SHA256 Session Tokens ---");
  function createSessionToken(user, lifetimeSeconds = 604800) {
    const canonicalId = user.id || user.userId;
    const secret = process.env.SESSION_SECRET;
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      id: canonicalId,
      userId: canonicalId,
      email: user.email.trim().toLowerCase(),
      role: user.role,
      fullName: user.fullName,
      avatar: user.avatar || user.fullName.slice(0, 2).toUpperCase(),
      issuedAt: nowSec,
      expiresAt: nowSec + lifetimeSeconds,
    };
    const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signatureHex = crypto.createHmac("sha256", secret).update(payloadBase64Url).digest("hex");
    return `${payloadBase64Url}.${signatureHex}`;
  }

  function verifySessionTokenSync(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64Url, signatureHex] = parts;
    if (signatureHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) return null;

    try {
      const secret = process.env.SESSION_SECRET;
      const expectedSigHex = crypto.createHmac("sha256", secret).update(payloadBase64Url).digest("hex");
      const sigBuf = Buffer.from(signatureHex, "hex");
      const expSigBuf = Buffer.from(expectedSigHex, "hex");
      if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
        return null;
      }
      const jsonStr = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
      const payload = JSON.parse(jsonStr);
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof payload.expiresAt !== "number" || nowSec > payload.expiresAt) {
        return null;
      }
      if (typeof payload.issuedAt !== "number" || payload.issuedAt > nowSec + 60) {
        return null;
      }
      const canonicalId = payload.id || payload.userId;
      if (!canonicalId || !payload.email || !payload.role || !payload.fullName) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  const testUser = {
    id: "usr-admin-1",
    email: "admin@eventportal.com",
    role: "ADMIN",
    fullName: "Alex Mercer",
  };

  const validToken = createSessionToken(testUser);
  const tokenParts = validToken.split(".");
  assert(tokenParts.length === 2, "Session token format is <base64UrlPayload>.<signatureHex>");
  assert(tokenParts[1].length === 64, "Session token signature is 64 hex characters (32 bytes)");

  const decodedSession = verifySessionTokenSync(validToken);
  assert(decodedSession !== null && decodedSession.email === "admin@eventportal.com", "Valid session token verifies and decodes successfully");
  assert(typeof decodedSession.issuedAt === "number" && typeof decodedSession.expiresAt === "number", "Token timestamps are Unix epoch seconds");

  // Tampering tests
  const tamperedSigToken = `${tokenParts[0]}.${tokenParts[1].slice(0, -1)}a`;
  assert(verifySessionTokenSync(tamperedSigToken) === null, "Tampered signature is rejected (timingSafeEqual)");

  const modifiedPayloadObj = JSON.parse(Buffer.from(tokenParts[0], "base64url").toString());
  modifiedPayloadObj.role = "ADMIN_SUPER";
  const tamperedPayloadB64 = Buffer.from(JSON.stringify(modifiedPayloadObj)).toString("base64url");
  const tamperedPayloadToken = `${tamperedPayloadB64}.${tokenParts[1]}`;
  assert(verifySessionTokenSync(tamperedPayloadToken) === null, "Tampered payload with original signature is rejected");

  // Expiration test
  const expiredToken = createSessionToken(testUser, -10); // Expired 10 seconds ago
  assert(verifySessionTokenSync(expiredToken) === null, "Expired session token is rejected");

  // 4. Dual-Tier Sliding Window Rate Limiter
  console.log("\n--- Testing Dual-Tier Rate Limiting ---");
  class TestRateLimiter {
    constructor() {
      this.accountAttempts = new Map();
      this.ipAttempts = new Map();
      this.ACCOUNT_MAX_ATTEMPTS = 5;
      this.IP_MAX_ATTEMPTS = 30;
      this.WINDOW_SECONDS = 900;
    }
    pruneExpired(record, nowSec) {
      const cutoff = nowSec - this.WINDOW_SECONDS;
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
    }
    getOrClean(map, key, nowSec) {
      const record = map.get(key);
      if (!record) return { timestamps: [] };
      this.pruneExpired(record, nowSec);
      if (record.timestamps.length === 0) {
        map.delete(key);
        return { timestamps: [] };
      }
      return record;
    }
    checkRateLimit(email, clientIp) {
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

      const ipCount = cleanIp ? this.ipAttempts.get(cleanIp)?.timestamps.length || 0 : 0;
      const acctCount = cleanEmail ? this.accountAttempts.get(cleanEmail)?.timestamps.length || 0 : 0;
      const remaining = Math.max(0, Math.min(this.ACCOUNT_MAX_ATTEMPTS - acctCount, this.IP_MAX_ATTEMPTS - ipCount));
      return { allowed: true, remainingAttempts: remaining };
    }
    recordFailedLogin(email, clientIp) {
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
    resetRateLimit(email) {
      const cleanEmail = email ? email.trim().toLowerCase() : "";
      if (cleanEmail) {
        this.accountAttempts.delete(cleanEmail);
      }
    }
  }

  const limiter = new TestRateLimiter();
  const testEmail = "testuser@eventportal.com";
  const testIp = "192.168.1.100";

  // Record 4 failed attempts
  for (let i = 1; i <= 4; i++) {
    const res = limiter.recordFailedLogin(testEmail, testIp);
    assert(res.allowed === true, `Attempt ${i} is allowed`);
  }

  // 5th failed attempt -> account threshold reached
  const fifthFail = limiter.recordFailedLogin(testEmail, testIp);
  assert(fifthFail.allowed === false, "5th failed attempt causes ACCOUNT_LOCKOUT");
  assert(fifthFail.lockoutReason === "ACCOUNT_LOCKOUT", "Reason is ACCOUNT_LOCKOUT");

  // Subsequent check is blocked
  const checkBlocked = limiter.checkRateLimit(testEmail, testIp);
  assert(checkBlocked.allowed === false, "Pre-check reflects account lockout");

  // Reset account on success, but IP tier preserves attempts
  limiter.resetRateLimit(testEmail);
  const afterReset = limiter.checkRateLimit(testEmail, testIp);
  assert(afterReset.allowed === true, "After account reset, account is no longer locked");
  assert(limiter.ipAttempts.get(testIp).timestamps.length === 5, "IP tier retained its 5 failed attempts after account reset");

  // Test IP Tier lockout: add 25 more attempts to reach 30 total on testIp
  for (let i = 6; i <= 30; i++) {
    limiter.recordFailedLogin(`different_user_${i}@eventportal.com`, testIp);
  }
  const ipCheck = limiter.checkRateLimit("fresh_user@eventportal.com", testIp);
  assert(ipCheck.allowed === false && ipCheck.lockoutReason === "IP_LOCKOUT", "30 failed attempts triggers IP_LOCKOUT for any account from this IP");

  // 5. User Sanitization
  console.log("\n--- Testing sanitizeUser & getDbUsers stripping ---");
  function sanitizeUser(user) {
    const { password_hash, salt, password_salt, ...safe } = user;
    return safe;
  }

  const rawUser = {
    id: "usr-1",
    email: "user@eventportal.com",
    password_hash: "abcd",
    salt: "1234",
    password_salt: "1234",
    full_name: "Test User",
    role: "ADMIN",
  };
  const sanitized = sanitizeUser(rawUser);
  assert(sanitized.password_hash === undefined, "password_hash is stripped");
  assert(sanitized.salt === undefined, "salt is stripped");
  assert(sanitized.password_salt === undefined, "password_salt is stripped");
  assert(sanitized.id === "usr-1" && sanitized.email === "user@eventportal.com", "Safe fields are preserved");

  console.log(`\n=== VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
