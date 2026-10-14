/**
 * Utility script to generate pre-hashed PBKDF2 credentials for default users.
 * 
 * Algorithm: PBKDF2 with HMAC-SHA512
 * Iterations: 100,000
 * Salt: 32 bytes (256 bits) random entropy -> 64 hex characters
 * Derived Key Length: 64 bytes (512 bits) -> 128 hex characters
 * 
 * Run with: node .agents/teamwork/explorer_m2_1/generate_prehashed_users.js
 */

const crypto = require("crypto");

function hashPassword(password, saltHex) {
  return new Promise((resolve, reject) => {
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

async function generate() {
  console.log("Generating cryptographically secure 32-byte salts and PBKDF2 SHA-512 hashes...\n");

  const adminSalt = crypto.randomBytes(32).toString("hex");
  const adminResult = await hashPassword("admin123", adminSalt);

  const volunteerSalt = crypto.randomBytes(32).toString("hex");
  const volunteerResult = await hashPassword("volunteer123", volunteerSalt);

  console.log("// --- COPY BELOW INTO src/lib/dataStore.ts ---");
  console.log(`export const DEFAULT_USERS: UserRecord[] = [
  {
    id: "usr-admin-1",
    email: "admin@eventportal.com",
    password_hash: "${adminResult.hash}",
    salt: "${adminResult.salt}",
    full_name: "Alex Mercer",
    role: "ADMIN",
    avatar: "AM",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-volunteer-1",
    email: "volunteer@eventportal.com",
    password_hash: "${volunteerResult.hash}",
    salt: "${volunteerResult.salt}",
    full_name: "Jordan Lee",
    role: "VOLUNTEER",
    avatar: "JL",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
];`);
  console.log("// --- END COPY ---\n");

  console.log("Verification checks:");
  console.log(`Admin salt byte length: ${Buffer.from(adminResult.salt, "hex").length} (expected 32)`);
  console.log(`Admin salt hex length: ${adminResult.salt.length} (expected 64)`);
  console.log(`Admin hash byte length: ${Buffer.from(adminResult.hash, "hex").length} (expected 64)`);
  console.log(`Admin hash hex length: ${adminResult.hash.length} (expected 128)`);
}

generate().catch(console.error);
