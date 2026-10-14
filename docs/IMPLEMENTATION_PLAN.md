# Comprehensive Engineering Implementation Plan
## Universal Event Registration & QR Check-in System

**Document Version:** 1.0.0  
**Status:** Approved Engineering Roadmap  
**Target Architecture:** Next.js 16.4.0 (Turbopack, App Router), React 19.3.0, TypeScript 5  
**Execution Horizon:** Milestones M1 through M6  
**Related Requirements:** R1 through R6 (per `ORIGINAL_REQUEST.md`)  

---

## 1. Architecture Roadmap & Engineering Principles

### 1.1 Milestone Dependency Sequence

The project execution is organized into 6 strictly sequenced milestones to guarantee defense-in-depth, minimize architectural regressions, and maintain continuous buildability.

```
┌────────────────────────────────────────────────────────────────────────┐
│ M1: Documentation & Environment Configuration (Features 1, 2)         │
│   - Formal architecture, audit, schema, security docs, .env.example    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ M2: Authentication & Account Lifecycle Hardening (Features 3, 4, 5)    │
│   - Salted PBKDF2/scrypt, signed HMAC sessions, brute-force throttling │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ M3: Server-Enforced RBAC & Route/API Protection (Features 6, 7, 8, 9)  │
│   - Edge Middleware, API 401/403 guards, volunteer isolation, PII mask │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ M4: Database Schema Realignment & Dual-Mode Persistence (10, 11)       │
│   - Generalized 8 entities, Supabase RLS, atomic local JSON fallback   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ M5: Gate Verification, Payment Review Modal & Offline Roster (12-17)   │
│   - SECQR crypto, atomic check-in, payment review modal, CSV export    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ M6: Code Quality, 0-Error Linting & Automated Test Suite (18-25)       │
│   - Eliminate 101 ESLint errors, Vitest setup, 5 test suites, build    │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Architectural Principles
1. **Zero-Trust Defense-in-Depth:** Every layer (Edge Middleware, Server Action guards, API routes, database RLS) independently validates identity and authorization.
2. **Resilient Dual-Mode Operation:** The system never halts due to network outages; the local JSON datastore (`data/events-data.json`) acts as an autonomous local engine.
3. **Strict Cryptographic Invariants:** Admission requires valid HMAC-SHA256 signatures (`SECQR:`); pass verification uses constant-time byte comparisons (`crypto.timingSafeEqual`).
4. **Clean Builds & Continuous Verification:** Every milestone must pass TypeScript compilation (`npx.cmd tsc --noEmit`) and production build generation (`npm.cmd run build`) without regressions.

---

## 2. Phased Execution Specifications (M1 to M6)

### 2.1 Milestone M1: Documentation & Environment Configuration
- **Scope:** Features 1, 2 (`docs/*`, `.env.example`).
- **Dependencies:** None.
- **Technical Deliverables:**
  1. `docs/PROJECT_AUDIT.md`: System health scorecard, vulnerability audit, catalog of 101 ESLint errors, compliance matrix.
  2. `docs/ARCHITECTURE.md`: Component topology, dual-mode persistence, session lifecycle, 3-tier RBAC, SECQR gate verification, disaster recovery.
  3. `docs/DATABASE_SCHEMA.md`: PostgreSQL DDL for 8 entities, ERD, indexes, Supabase RLS policies, dual-mode JSON mapping.
  4. `docs/SECURITY.md`: Threat model (STRIDE), password hashing, signed cookies, SECQR protocol, audit invariants.
  5. `docs/IMPLEMENTATION_PLAN.md`: Phased roadmap, interface contracts, risk management.
  6. `.env.example`: Complete environment variable template with defaults, secrets, and generation instructions.
- **Verification Procedures:**
  - Verify all 5 documents exist under `docs/` and `.env.example` exists in root.
  - Run `npx.cmd tsc --noEmit` to confirm zero compilation regressions.
  - Run `npm.cmd run build` to confirm zero production build regressions.
- **Exit Gate:** Formal documentation suite complete and verified.

---

### 2.2 Milestone M2: Authentication & Account Lifecycle Hardening
- **Scope:** Features 3, 4, 5 (Password hashing, signed session tokens, brute-force rate limiting).
- **Prerequisites:** Milestone M1.
- **Technical Deliverables:**
  1. `src/lib/services/authService.ts`:
     - Implement `hashPassword(password, salt)` with PBKDF2 (SHA-512, 100,000 iterations, 32-byte / 256-bit salt via `crypto.randomBytes(32)`).
     - Implement `verifyPassword(password, hash, salt)` with `crypto.timingSafeEqual`.
     - Implement `createSessionToken(user)` returning `<payloadBase64Url>.<signatureHex>` with integer epoch seconds (`Math.floor(Date.now() / 1000)`).
     - Implement `verifySessionToken(token)` enforcing timing-safe HMAC signature verification (`crypto.timingSafeEqual`) and epoch expiration.
     - Implement dual-tier sliding-window rate limiter: Account Tier (5 attempts / 15m) and IP Tier (30 attempts / 15m).
     - Emit system authentication audit telemetry (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`) with `event_id: null`.
  2. `src/app/actions/authActions.ts`:
     - Update `loginAction` to use rate-limited authentication and set signed cookie.
     - Update `logoutAction` to clear signed session cookie.
     - Update `getSessionUserAction` to return validated session user.
  3. `src/app/page.tsx`:
     - Update login interface to display secured credentials.
- **Step-by-Step Implementation:**
  1. Implement PBKDF2 key derivation (SHA-512, 100,000 iterations, 64-byte key) and random 32-byte (256-bit, 64 hex characters) salt generation in `authService.ts`.
  2. Replace plaintext password constants with precomputed salted hashes.
  3. Author HMAC-SHA256 session token serializer and deserializer with `crypto.timingSafeEqual`.
  4. Author dual-tier in-memory rate limiter tracking failed attempts independently by IP (`ip:${clientIp}`, threshold: 30) and account (`account:${email}`, threshold: 5).
  5. Wire rate limiting checks and system auth telemetry into `AuthService.authenticate`.
- **Verification Procedures:**
  - Authenticate with valid credentials -> Inspect cookie: matches `<payloadBase64Url>.<signatureHex>` format.
  - Tamper with 1 character of cookie -> Session returns `null`.
  - Submit 5 invalid passwords for single account -> 6th attempt returns account lockout notice (HTTP 429).
  - Submit invalid passwords across 30 accounts from single IP -> 31st attempt returns IP throttle notice (HTTP 429).
- **Exit Gate:** Plaintext credentials eliminated; signed sessions enforced; dual-tier brute-force throttled.

---

### 2.3 Milestone M3: Server-Enforced RBAC & Route/API Protection
- **Scope:** Features 6, 7, 8, 9 (Edge Middleware, route isolation, API guards, PII shielding).
- **Prerequisites:** Milestone M2.
- **Technical Deliverables:**
  1. `src/middleware.ts`:
     - Matcher: `['/events/:path*', '/scan/:path*', '/api/export/:path*', '/api/checkin/:path*', '/api/teams/:path*', '/api/import/:path*']`.
     - Redirect unauthenticated web requests to `/?redirect=<path>`.
     - Redirect authenticated volunteers from `/events/*` to `/scan`.
     - Return HTTP 401 for unauthenticated API requests; HTTP 403 for unauthorized volunteers.
  2. `src/lib/authGuard.ts`: Server Action guard `requireAuth(allowedRoles)`.
  3. REST API Handlers (`src/app/api/`):
     - `export/route.ts`: Enforce `ADMIN` role; return 401/403.
     - `checkin/route.ts`: Enforce authenticated access; return 401.
     - `teams/route.ts`: Enforce authenticated access; return 401.
     - `import/route.ts`: Enforce `ADMIN` role; return 401/403.
  4. Attendee PII Shielding: Mask contact data on volunteer gate endpoints.
- **Verification Procedures:**
  - `curl -i http://localhost:3000/api/export` -> Returns `HTTP 401 Unauthorized`.
  - Navigate to `/events` in incognito browser -> Redirects to `/?redirect=%2Fevents`.
  - Log in as volunteer -> Navigate to `/events/ev-1/dashboard` -> Redirects to `/scan`.
- **Exit Gate:** All 4 acceptance criteria under Security & Access Control satisfied.

---

### 2.4 Milestone M4: Database Schema Realignment & Dual-Mode Persistence
- **Scope:** Features 10, 11 (Generalized 8 entities, Supabase RLS, atomic local JSON fallback).
- **Prerequisites:** Milestones M1, M2, M3.
- **Technical Deliverables:**
  1. `schema.sql`: Full DDL for 8 generalized entities (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`, `users`) with:
     - `audit_logs.event_id UUID REFERENCES events(id) ON DELETE CASCADE` (nullable to permit system auth logs).
     - Standalone `CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp DESC);`.
     - Hardened RLS policies: `p_audit_logs_authenticated_insert` (for staff) and `p_audit_logs_anon_security_insert` (for system auth events).
     - `users.password_salt` specifying 32-byte (256-bit, 64-hex-character) cryptographic salt.
  2. `src/lib/dataStore.ts`:
     - Update domain TypeScript interfaces to generalized models.
     - Provide backward-compatible adapters (`getTeams`, `getTeamById`, `updateTeam`) wrapping generalized entities so existing UI does not break.
     - Implement atomic file staging writes (`.tmp` + rename) for local JSON store.
     - Implement circuit breaker: automatic fallback on network drop or placeholder URL.
- **Verification Procedures:**
  - Verify `schema.sql` compiles against PostgreSQL 15+.
  - Test offline fallback: run with placeholder Supabase URL -> application operates smoothly using `data/events-data.json`.
- **Exit Gate:** Generalized entities operational; dual-mode persistence verified.

---

### 2.5 Milestone M5: Gate Verification, Payment Review Modal & Offline Roster
- **Scope:** Features 12, 13, 14, 15, 16, 17 (SECQR crypto, atomic check-in, payment review modal, CSV export).
- **Prerequisites:** Milestones M2, M3, M4.
- **Technical Deliverables:**
  1. `src/lib/services/cryptoService.ts`:
     - Completely eliminate non-`SECQR:` bypass.
     - Use RFC 4648 Base64URL encoding and decoding (`Buffer.from(..., 'base64url')`) for SECQR payloads.
     - Enforce constant-time signature verification with `crypto.timingSafeEqual`.
     - Return harmonized `QRVerificationResult` with aliases `error` / `errorMessage` and `teamId` / `registrationId`.
     - Enforce `process.env.QR_HMAC_SECRET` validation.
  2. `src/app/actions/qrActions.ts`:
     - Enforce atomic single-use check-in.
     - Intercept duplicate scans: reject with `DUPLICATE_CHECK_IN`, log exact previous timestamp and volunteer ID to `audit_logs`.
     - Return harmonized `CheckInResult` with aliases `error` / `errorMessage` and `team` / `registration`.
     - Implement `approveRegistration` and `rejectRegistration` server actions.
     - Implement on-spot 6-digit OTP fallback with 4-attempt lockout.
  3. `src/app/(admin)/events/[eventId]/registrations/page.tsx`:
     - Author `PaymentReviewModal` component with screenshot zoom, pan, and Approve/Reject controls.
     - Wire CSV export button to download offline roster.
     - Implement printable emergency roster view with print CSS (`@media print`).
- **Verification Procedures:**
  - Scan valid SECQR pass -> Check-in succeeds.
  - Scan same pass second time -> Rejected with duplicate alert, previous timestamp, and audit log.
  - Alter 1 character of QR payload -> Cryptographic signature failure.
  - Open Registrations page -> Click "Review Payment" -> Inspect screenshot -> Click "Approve" -> Status changes to APPROVED.
  - Download offline CSV roster -> Contains complete attendee data.
- **Exit Gate:** All 5 Functionality & Verification acceptance criteria verified.

---

### 2.6 Milestone M6: Code Quality, 0-Error Linting & Automated Test Suite
- **Scope:** Features 18, 19, 20, 21, 22, 23, 24, 25 (ESLint 101 fixes, Vitest setup, automated test suites, clean build).
- **Prerequisites:** Milestones M1 through M5.
- **Technical Deliverables:**
  1. `eslint.config.mjs`: Add `".agents/**"` to `globalIgnores` to eliminate 94 external warnings.
  2. Codebase Refactoring across 23 files to resolve all 101 ESLint errors:
     - 34 `catch (err: any)` replaced with typed error helper `catch (err: unknown)`.
     - 8 spreadsheet import rows typed with `Record<string, unknown>`.
     - 41 parameters and state variables typed with strict domain interfaces.
     - 12 unescaped JSX entities replaced with `&apos;` and `&quot;`.
     - 5 `set-state-in-effect` errors resolved.
     - 1 `react-hooks/immutability` declaration hoisted.
  3. `vitest.config.ts` and `package.json` test script:
     - Install `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`.
     - Add `"test": "vitest run"`.
  4. Test Suites in `tests/`:
     - `tests/crypto.test.ts`: SECQR generation, constant-time verification, tampering rejection, expiration.
     - `tests/checkin.test.ts`: Atomic single-use check-in, duplicate detection, OTP fallback.
     - `tests/auth.test.ts`: Salted password hashing, signed sessions, brute-force rate limiting.
     - `tests/rbac.test.ts`: Edge middleware redirection, API 401/403 protection.
     - `tests/export.test.ts`: CSV roster generation and offline store fallback.
  5. Clean Build: Run `npm.cmd run build`.
- **Verification Procedures:**
  - `npm.cmd run lint` -> Exits with **0 errors**.
  - `npx.cmd tsc --noEmit` -> Exits with **0 errors**.
  - `npm.cmd test` -> All 5 test suites pass (100% success).
  - `npm.cmd run build` -> Next.js production build succeeds cleanly.
- **Exit Gate:** All Code Quality & Build Verification acceptance criteria satisfied.

---

## 3. Interface Contracts Directory

### 3.1 Authentication & Session Contract (`src/lib/services/authService.ts`)
```typescript
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
  email: string;
  role: "ADMIN" | "VOLUNTEER";
  fullName: string;
  avatar?: string;
  issuedAt: number; // Unix epoch seconds (Math.floor(Date.now() / 1000))
  expiresAt: number; // Unix epoch seconds (Math.floor(Date.now() / 1000) + lifetimeSeconds)
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSec?: number;
  lockoutReason?: "ACCOUNT_LOCKOUT" | "IP_RATE_LIMITED";
  errorMessage?: string;
}

export class AuthService {
  static hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }>;
  static verifyPassword(password: string, hash: string, salt: string): Promise<boolean>;
  static createSessionToken(user: UserAccount): Promise<string>;
  static verifySessionToken(token: string): Promise<SessionPayload | null>;
  static checkRateLimit(identifier: string, tier?: "ACCOUNT" | "IP"): RateLimitResult;
  static checkDualRateLimit(params: { email?: string; clientIp?: string }): RateLimitResult;
  static recordFailedLogin(params: { email?: string; clientIp?: string }): void;
  static resetRateLimit(email: string): void;
  static authenticate(email: string, password: string, clientIp?: string): Promise<{ success: boolean; user?: UserAccount; error?: string }>;
  static getCurrentUser(): Promise<UserAccount | null>;
  static logout(): Promise<void>;
}
```

### 3.2 QR & Gate Cryptography Contract (`src/lib/services/cryptoService.ts`)
```typescript
export interface SignedQRPayload {
  v: number;
  tid: string;
  eid: string;
  tok: string;
  exp: number; // Unix epoch seconds
  sig: string; // 64-char hex HMAC-SHA256
}

export interface QRVerificationResult {
  valid: boolean;
  isSignedPayload: boolean;
  tamperDetected?: boolean;
  isExpired?: boolean;
  teamId?: string; // Group / Team ID
  registrationId?: string; // Generalized registration ID (alias for teamId)
  eventId?: string; // Event ID
  token?: string; // Unique pass nonce/token
  expiresAt?: string; // ISO 8601 string
  errorMessage?: string; // Detailed error message
  error?: string; // Backward-compatible alias for errorMessage
}

export class CryptoService {
  static createSecureQRPayload(teamId: string, eventId: string, uniqueToken?: string, expirationHours?: number): string;
  static verifySecureQRPayload(rawPayload: string): QRVerificationResult;
}
```

### 3.3 Check-in & Gate Verification Contract (`src/app/actions/qrActions.ts`)
```typescript
export interface CheckInResult {
  success: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  isExpired?: boolean;
  tamperDetected?: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
  team?: unknown; // Legacy team entity
  registration?: unknown; // Generalized registration entity
  violationType?: "DUPLICATE_CHECK_IN" | "INVALID_SIGNATURE" | "EXPIRED_PASS" | "UNAPPROVED_REGISTRATION" | "NOT_FOUND";
  error?: string;
  errorMessage?: string; // Alias for error
}

export async function processCheckIn(params: {
  eventId: string;
  qrPayload: string;
  volunteerId: string;
}): Promise<CheckInResult>;

export async function verifyOtpCheckIn(params: {
  eventId: string;
  teamId: string;
  otpCode: string;
  volunteerId: string;
}): Promise<CheckInResult>;
```

### 3.4 Payment Review Contract
```typescript
export interface PaymentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  registration: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    trackName?: string;
    payment_screenshot_url?: string;
    created_at: string;
  };
  onApprove: (registrationId: string) => Promise<void>;
  onReject: (registrationId: string, reason: string) => Promise<void>;
}

export async function approveRegistration(registrationId: string, reviewerId: string): Promise<{ success: boolean }>;
export async function rejectRegistration(registrationId: string, reviewerId: string, reason: string): Promise<{ success: boolean }>;
```

### 3.5 Security Audit Telemetry Contract (`src/lib/dataStore.ts` / Supabase `audit_logs`)
```typescript
export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";
export type ActorRole = "ADMIN" | "VOLUNTEER" | "SYSTEM";

export interface AuditLogEntry {
  id?: string;
  event_id?: string | null; // NULLABLE: system authentication events have no event_id
  timestamp?: string; // ISO 8601 string
  action:
    | "AUTH_LOGIN_SUCCESS"
    | "AUTH_LOGIN_FAILURE"
    | "AUTH_LOCKOUT"
    | "CHECK_IN_SUCCESS"
    | "CHECK_IN_DUPLICATE_ATTEMPT"
    | "CHECK_IN_TAMPER_ATTEMPT"
    | "CHECK_IN_RESET"
    | "PAYMENT_APPROVED"
    | "PAYMENT_REJECTED"
    | "OTP_GENERATED"
    | "OTP_LOCKOUT"
    | "UNAUTHORIZED_ROUTE_ACCESS";
  severity: AuditSeverity;
  actor_id: string; // User ID, volunteer ID, or "SYSTEM"
  actor_role: ActorRole;
  target_id?: string | null;
  target_name?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditService {
  recordAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry>;
  getAuditLogs(filter: {
    eventId?: string | null;
    severity?: AuditSeverity | "ALL";
    action?: string | "ALL";
    search?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]>;
}
```

---

## 4. Risk Management, Rollback & Disaster Recovery Strategies

### 4.1 Risk Matrix & Contingencies

| Risk ID | Description | Likelihood | Impact | Mitigation Strategy | Contingency Plan |
|---|---|:---:|:---:|---|---|
| **RSK-01** | Strict typing refactoring introduces compile regressions | Medium | High | Define centralized domain interfaces before replacing `any`; run `tsc` continuously. | Revert affected file using git checkpoint and apply typed wrapper. |
| **RSK-02** | Edge Middleware breaks client navigation or hydration | Medium | High | Use minimal Edge-compatible crypto; test matcher paths; keep public routes exempt. | Temporarily exempt specific sub-route while debugging matcher. |
| **RSK-03** | Schema changes break legacy UI views expecting `teams` | High | High | Keep backward-compatible adapter methods in `dataStore.ts` mapping `teams` to `groups`. | Adapter translates relational models to legacy structures on the fly. |
| **RSK-04** | Venue network blackout during event gate operations | High | High | Dual-mode persistence: local JSON store handles all reads/writes autonomously. | Offline CSV/printable roster exported prior to event. |
| **RSK-05** | Vitest configuration conflict with Next.js 16 App Router | Low | Medium | Use `node` test environment for services/crypto and standard TS mocking. | Isolate unit tests to service layer. |

### 4.2 Multi-Tier Rollback Protocols
1. **Source Code Rollback:** Every milestone maintains atomic git commits. If a regression is detected post-deployment, rollback to previous tag via `git checkout -b rollback-<milestone> <previous_tag>`.
2. **Database Schema Rollback:** Schema migrations in `schema.sql` are written with idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). If relational migration encounters issues, views alias `groups` as `teams`.
3. **Session Cookie Secret Rotation:** Maintain `AUTH_SECRET_PREVIOUS` support so rotating the master secret does not invalidate existing active user sessions prematurely.

### 4.3 Venue Disaster Recovery Protocol
In the event of total venue internet outage:
1. **Tier 1 (Autonomous Local Server):** Gate scanners connect to local network hosting the application with `data/events-data.json`.
2. **Tier 2 (Pre-Exported CSV Roster):** Supervisors search attendee records using local spreadsheet applications on mobile tablets.
3. **Tier 3 (Emergency Hardcopy Roster):** Gate staff verify attendees using pre-printed alphabetical paper rosters with verification signature boxes.
4. **Post-Event Reconciliation:** Offline check-ins are synced to Supabase PostgreSQL using idempotent batch upserts when internet connectivity is restored.
