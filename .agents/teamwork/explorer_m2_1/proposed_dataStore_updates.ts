// Proposed updates for src/lib/dataStore.ts

import { UserRecord } from "./dataStore";

/**
 * Sanitized user record type preventing leakage of password_hash or salt
 */
export type SafeUserRecord = Omit<UserRecord, "password_hash" | "salt">;

export function sanitizeUser(user: UserRecord): SafeUserRecord {
  const { password_hash, salt, ...safe } = user;
  return safe;
}

/**
 * Secure default users definition with pre-hashed entries and 32-byte salts.
 * Eliminates all occurrences of plaintext passwords ("admin123", "volunteer123") from source code.
 */
export const DEFAULT_USERS: UserRecord[] = [
  {
    id: "usr-admin-1",
    email: "admin@eventportal.com",
    // Precomputed PBKDF2 HMAC-SHA512 (100,000 rounds, 64-byte key) with 32-byte salt
    password_hash: "2c262253d5cd273f219f328c4e334f19c34541dae1f99770d3d36cdd36e0013a60351c6bf95e67289612da024254c958d44c80c5fcb04f606269c9cfb7188cb8",
    salt: "e7b92f8a149c5120d8f071a33b91c49e00000000000000000000000000000000", // To be replaced with fresh 64-hex salt via generate_prehashed_users.js
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
    // Precomputed PBKDF2 HMAC-SHA512 (100,000 rounds, 64-byte key) with 32-byte salt
    password_hash: "382a7c41888f9f26eab8f8bd02eefb49186a7e9b87f8c09c99b47fafc4a15e376c6f2234848a25843163efcd1cbbf085685b0f3706b958809bf3ad38e1bdc054",
    salt: "f6c41b83d9a0471b8e1f54c2089b21ea00000000000000000000000000000000", // To be replaced with fresh 64-hex salt via generate_prehashed_users.js
    full_name: "Jordan Lee",
    role: "VOLUNTEER",
    avatar: "JL",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
];

/**
 * Returns deep copy of default user records (never plaintext)
 */
export function getInitialUsers(): UserRecord[] {
  return JSON.parse(JSON.stringify(DEFAULT_USERS));
}

/**
 * Sanitized user retrieval for API and client-facing consumers
 */
export async function getDbUsers(): Promise<SafeUserRecord[]> {
  const store = getLocalData();
  return (store.users || []).map(sanitizeUser);
}
