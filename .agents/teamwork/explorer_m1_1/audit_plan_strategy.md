# Milestone 1 Exploration: System Audit & Implementation Plan Documentation Blueprint

**Document Version:** 1.0.0  
**Author:** `explorer_m1_1`  
**Date:** 2026-10-14  
**Working Directory:** `d:\Project\Event Management\.agents\teamwork\explorer_m1_1`  
**Mission:** Content strategies, exhaustive outlines, synthesized evidence, and structured blueprints for authoring `docs/PROJECT_AUDIT.md` and `docs/IMPLEMENTATION_PLAN.md`.

---

## 1. Executive Context & Document Blueprint Strategy

This strategy document provides the complete, authoritative content blueprint and technical roadmap for authoring two foundational Milestone 1 deliverables:
1. `docs/PROJECT_AUDIT.md`: The definitive forensic audit of the Universal Event Registration & QR Check-in System. It catalogs system health, details all critical security vulnerabilities with line-number precision, breaks down the 101 ESLint errors, exposes the 0% test coverage deficit, and tracks a compliance matrix against Requirements R1–R6 and all 10 acceptance criteria.
2. `docs/IMPLEMENTATION_PLAN.md`: The end-to-end phased execution blueprint spanning Milestones M1 through M6. It establishes immutable interface contracts, concrete file deliverables, precise verification commands, and multi-tier rollback/disaster recovery strategies.

---

# PART I: STRATEGY & BLUEPRINT FOR `docs/PROJECT_AUDIT.md`

## 2. Complete Outline & Section Hierarchy for `docs/PROJECT_AUDIT.md`

The generated `docs/PROJECT_AUDIT.md` must follow this strict 5-part architecture:
- **Section 1: Executive Summary & System Health Scorecard**
  - High-level status narrative
  - System Health Matrix across Security, Architecture, Persistence, Verification, Code Quality, and Testing
  - Critical risk summary table
- **Section 2: Deep-Dive Forensic Vulnerability Audit**
  - VULN-01: Hardcoded Plaintext Credentials (`src/lib/services/authService.ts`)
  - VULN-02: Unsigned, Forcible Raw JSON Cookie Sessions (`src/lib/services/authService.ts`)
  - VULN-03: Complete Absence of Next.js Route Protection Middleware (`src/middleware.ts`)
  - VULN-04: Unauthenticated & Unchecked REST API Endpoints (`/api/export`, `/api/checkin`, `/api/teams`, `/api/import`)
  - VULN-05: Cryptographic Bypass & Timing Attack Vulnerabilities (`src/lib/services/cryptoService.ts`)
  - VULN-06: Complete Absence of Payment Proof Review Workflow (`src/app/(admin)/events/[eventId]/registrations/page.tsx`)
  - VULN-07: Schema & Domain Terminology Misalignment (`schema.sql`, `src/lib/dataStore.ts`)
  - VULN-08: Absence of Authentication Rate Limiting & Brute-Force Throttling
- **Section 3: Code Quality, Static Analysis & Testing Deficit Audit**
  - Exact categorization and inventory of all 101 ESLint errors
  - Error distribution by ESLint rule and architectural layer
  - Warning analysis (94 `.agents` warnings vs 55 `src/` warnings)
  - TypeScript compilation analysis: Why `tsc --noEmit` passes despite 101 lint errors
  - Zero-coverage test infrastructure audit: missing runner, missing scripts, missing suites
- **Section 4: Comprehensive Compliance & Traceability Matrix**
  - Requirements Traceability (R1 through R6)
  - Acceptance Criteria Evaluation (All 10 criteria mapped to status, evidence, target milestone, and verification gate)
- **Section 5: Remediation Priority & Actionable Next Steps**
  - Prioritized remediation schedule
  - Pre-flight quality gates

---

## 3. Detailed Content Specifications for `docs/PROJECT_AUDIT.md`

### 3.1 Section 1: Executive Summary & System Health Scorecard

The writer must formulate a rigorous, fact-based appraisal:
- **Baseline Framework**: Next.js 16.4.0 App Router, React 19.3.0, TypeScript 5, Tailwind CSS v4, Node.js v24.21.0.
- **Current Operational Reality**: The user interface is functional and visually rich (features QR display, camera scanner, Resend email hooks, audit log viewer, and spreadsheet upload), but the system is **not production-ready** due to fundamental security and architectural flaws.
- **System Health Matrix**:

| Dimension | Measured Status | Baseline Finding | Production Invariant Required | Target Milestone |
|---|---|---|---|---|
| **Authentication** | 🔴 Critical Failure | Plaintext passwords (`admin123`), direct string matching, no salt, no hashing | Salted PBKDF2/scrypt, constant-time comparison, zero plaintext | M2 |
| **Session Security** | 🔴 Critical Failure | Raw JSON string in unsigned cookie `event_auth_session` | HMAC-SHA256 signed bearer token with embedded expiration | M2 |
| **Access Control (RBAC)** | 🔴 Critical Failure | No `middleware.ts`. All `/events/*`, `/scan/*`, `/api/*` accessible anonymously | Next.js Edge Middleware redirecting unauth requests to `/` and volunteers to `/scan` | M3 |
| **Data Protection (PII)** | 🔴 Critical Failure | `/api/export` dumps complete attendee PII anonymously | 401 Unauthorized for anonymous; 403 Forbidden for volunteers | M3 |
| **Domain Schema** | 🟠 Structural Defect | Conflates registrations into gaming-specific `teams` | Generalized entities: `events`, `event_tracks`, `registrations`, `groups`, `participants` | M4 |
| **Gate Cryptography** | 🔴 Critical Failure | Non-`SECQR:` bypass accepts arbitrary tokens; timing attack in signature check | Strict `SECQR:` enforcement, `crypto.timingSafeEqual`, strong env secret | M5 |
| **Payment Verification** | 🔴 Missing Feature | 0 references to payment in `src/`. No review modal, auto-approval on import | Payment screenshot preview modal, Approve/Reject actions, pending gate | M5 |
| **Static Code Quality** | 🔴 Failing Gates | Exactly 101 ESLint errors across 23 files | 0 ESLint errors (`npm.cmd run lint` clean exit) | M6 |
| **Automated Testing** | 🔴 Zero Coverage | No test runner, no `"test"` script, 0 test files (0.00% coverage) | Vitest test runner with 5 complete suites covering auth, RBAC, crypto, checkin, export | M6 |

---

### 3.2 Section 2: Deep-Dive Forensic Vulnerability Audit

Each vulnerability in `docs/PROJECT_AUDIT.md` must be documented with exact file paths, line numbers, verbatim code snippets, security impact, attack vector, and precise remediation specification:

#### VULN-01: Hardcoded Plaintext Credentials in `authService.ts`
- **File**: `src/lib/services/authService.ts`
- **Lines**: 12–29, 44–46
- **Verbatim Code**:
  ```typescript
  const DEFAULT_USERS: Array<UserAccount & { passwordHash: string }> = [
    {
      id: "usr-admin-1",
      email: "admin@eventportal.com",
      passwordHash: "admin123", // In high-security prod, use bcrypt; for this platform, verified match
      fullName: "Alex Mercer",
      role: "ADMIN",
      avatar: "AM",
    },
    {
      id: "usr-volunteer-1",
      email: "volunteer@eventportal.com",
      passwordHash: "volunteer123",
      fullName: "Jordan Lee",
      role: "VOLUNTEER",
      avatar: "JL",
    },
  ];
  // ...
  const matched = DEFAULT_USERS.find(
    (u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === cleanPassword
  );
  ```
- **Severity**: Critical (CVSS 9.8)
- **Impact**: Any attacker inspecting repository source code or client bundles immediately obtains valid credentials for both administrative and volunteer accounts. Direct string equality (`===`) leaks timing information.
- **Remediation**:
  1. Implement `hashPassword(password: string, salt?: string)` using PBKDF2 (SHA-512, >=100,000 iterations) or `scrypt` (`N=16384, r=8, p=1`).
  2. Implement `verifyPassword(password: string, hash: string, salt: string)` with `crypto.timingSafeEqual`.
  3. Store pre-computed hashes and random 16-byte salts for default accounts; never store plaintext.

#### VULN-02: Unsigned, Forcible Raw JSON Cookie Sessions
- **File**: `src/lib/services/authService.ts`
- **Lines**: 58–65, 76–85
- **Verbatim Code**:
  ```typescript
  // Setting cookie:
  cookieStore.set(COOKIE_NAME, JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Reading cookie:
  const session = cookieStore.get(COOKIE_NAME);
  if (!session || !session.value) return null;
  return JSON.parse(session.value) as UserAccount;
  ```
- **Severity**: Critical (CVSS 9.8)
- **Impact**: The cookie value is raw, unsigned JSON. An attacker can set cookie `event_auth_session` to `{"id":"usr-attacker","email":"attacker@evil.com","fullName":"Attacker","role":"ADMIN","avatar":"AT"}` and gain full administrative privileges without authentication.
- **Remediation**:
  1. Replace raw JSON cookies with HMAC-SHA256 signed session tokens: `createSessionToken(user: UserAccount): Promise<string>`.
  2. Structure payload: `token = base64(payload) + "." + hmac(base64(payload), SESSION_SECRET)`.
  3. Embed `issuedAt` and strict `expiresAt` timestamps.
  4. Verify signature on session extraction; reject any unverified, tampered, or expired tokens.

#### VULN-03: Complete Absence of Next.js Edge Middleware
- **File**: `src/middleware.ts` (currently non-existent)
- **Evidence**: `find_by_name` confirms no middleware file exists in `src/` or repo root.
- **Severity**: Critical (CVSS 9.1)
- **Impact**:
  - Direct navigation to `/events`, `/events/[eventId]/dashboard`, `/events/[eventId]/registrations`, `/events/[eventId]/audit` succeeds anonymously.
  - Direct navigation to `/scan` and `/scan/teams` succeeds anonymously.
  - Volunteers can access administrative routes without restriction.
  - In `src/app/(volunteer)/layout.tsx:14-21`, the volunteer UI explicitly presents a button linking to `/events/ev-1/dashboard`.
- **Remediation**:
  1. Author `src/middleware.ts` matching `['/events/:path*', '/scan/:path*', '/api/export/:path*', '/api/checkin/:path*', '/api/teams/:path*']`.
  2. Verify session signature; redirect unauthenticated users to `/?redirect=<original_path>`.
  3. Enforce RBAC: redirect `role === 'VOLUNTEER'` attempting `/events/*` to `/scan`.

#### VULN-04: Unauthenticated & Unprotected REST API Endpoints
- **Files**:
  - `src/app/api/export/route.ts` (lines 4–54)
  - `src/app/api/checkin/route.ts` (lines 4–60)
  - `src/app/api/teams/route.ts` (lines 4–65)
  - `src/app/api/import/route.ts` (lines 5–35)
- **Evidence**: None of the handlers check session cookies, headers, or API keys.
- **Severity**: Critical (CVSS 9.8)
- **Impact**:
  - `GET /api/export` leaks all attendee names, personal emails, mobile numbers, academic courses, and QR tokens to anonymous callers.
  - `POST /api/checkin` allows anonymous actors to mark any attendee as checked in.
  - `GET /api/teams` and `POST /api/teams` permit anonymous roster harvesting and arbitrary team creation.
  - `POST /api/import` allows unauthorized bulk injection of attendees.
- **Remediation**:
  1. Implement shared session verification guard `requireApiAuth(req: NextRequest, allowedRoles?: Role[])`.
  2. Return `HTTP 401 Unauthorized` `{ success: false, error: "Authentication required." }` when unauthenticated.
  3. Return `HTTP 403 Forbidden` when volunteer attempts administrative actions (e.g., `/api/export`).

#### VULN-05: Cryptographic Bypass & Timing Attack in `cryptoService.ts`
- **File**: `src/lib/services/cryptoService.ts`
- **Lines**: 3, 19, 58–65, 83
- **Verbatim Code**:
  ```typescript
  // Line 3: Hardcoded fallback secret
  const QR_SECRET_KEY = process.env.QR_HMAC_SECRET || "event-security-hmac-salt-production-2026-secret";

  // Line 19: Truncated signature
  return crypto.createHmac("sha256", QR_SECRET_KEY).update(data).digest("hex").slice(0, 32);

  // Lines 58-65: Unsigned bypass
  if (!clean.startsWith("SECQR:")) {
    return {
      valid: true,
      isSignedPayload: false,
      token: clean,
    };
  }

  // Line 83: Variable-time comparison
  if (payload.sig !== expectedSig)
  ```
- **Severity**: High (CVSS 8.5)
- **Impact**:
  - The bypass at lines 58–65 allows an attacker to generate any arbitrary UUID string without an HMAC signature, and the system accepts it as `valid: true`.
  - Line 83 uses standard string equality (`!==`), making the system vulnerable to timing side-channel attacks during signature verification.
  - Line 3 uses a publicly visible fallback secret string.
- **Remediation**:
  1. Remove the non-SECQR bypass: reject any scan payload that does not begin with `SECQR:` (`valid: false`, `tamperDetected: true`).
  2. Use `crypto.timingSafeEqual(Buffer.from(payload.sig, 'hex'), Buffer.from(expectedSig, 'hex'))`.
  3. Enforce `process.env.QR_HMAC_SECRET` in production, throwing an error if missing.

#### VULN-06: Complete Absence of Payment Proof Verification Workflow
- **Files**: `src/app/(admin)/events/[eventId]/registrations/page.tsx`, `src/lib/dataStore.ts`, `src/app/actions/importData.ts`
- **Evidence**: `grep_search` reveals 0 occurrences of "payment" in `src/`.
- **Severity**: High (CVSS 7.5)
- **Impact**: The application lacks the entire payment review workflow specified in PRD §5 and ORIGINAL_REQUEST §R5. Attendees cannot be placed in a `PENDING_REVIEW` state requiring screenshot proof review, admins cannot inspect payment receipts, and spreadsheet imports automatically set all attendees to `APPROVED` without payment checks.
- **Remediation**:
  1. Add `payment_screenshot_url`, `payment_status` (`'PENDING' | 'VERIFIED' | 'REJECTED'`), `payment_reviewed_by`, and `payment_rejection_reason` to data models.
  2. Build `PaymentReviewModal` component with image preview, zoom, pan, and Approve/Reject action triggers.
  3. Gate QR code generation: passes are issued only when `payment_status === 'VERIFIED'` and `status === 'APPROVED'`.

#### VULN-07: Schema & Domain Terminology Misalignment
- **Files**: `schema.sql`, `src/lib/dataStore.ts`
- **Evidence**: `schema.sql` line 1 titles itself "Multi-Event E-Sports Registration... Schema". Core table is `teams`, and foreign keys bind `participants` directly to `teams`. There are no tables or interfaces for `event_tracks`, `groups`, or `registrations`.
- **Severity**: Medium (CVSS 5.3)
- **Impact**: The codebase violates `GEMINI.md` mandate ("Use generalized terms (`event_tracks`, `groups`, `participants`) instead of gaming-specific terms") and fails Requirement R4. It cannot represent multi-track events, individual attendees without teams, or distinct registration applications.
- **Remediation**:
  1. Realign PostgreSQL schema in `schema.sql` to generalized entities: `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`, `users`.
  2. Update `dataStore.ts` interfaces and provide backward-compatible adapter methods so existing UI components continue operating smoothly during transition.

#### VULN-08: Absence of Authentication Rate Limiting & Brute-Force Throttling
- **Files**: `src/lib/services/authService.ts`, `src/app/actions/authActions.ts`
- **Evidence**: Neither `AuthService.authenticate` nor `loginAction` contains rate limiting or counter tracking.
- **Severity**: High (CVSS 7.5)
- **Impact**: Credential stuffing and automated password dictionary attacks can run unchecked against `/` and server actions.
- **Remediation**:
  1. Implement an in-memory/persistent throttler tracking failed attempts by IP and email.
  2. Enforce max 5 failed attempts within a 15-minute sliding window; lock out subsequent attempts and return remaining lockout duration.

---

### 3.3 Section 3: Code Quality, Static Analysis & Testing Deficit Audit

The audit document must incorporate the full findings from `explorer_survey_quality`:

#### 1. Exact Categorization of the 101 ESLint Errors
- Total Errors: **101** across 23 source files.
- Total Warnings: **149** (94 in `.agents/skills`, 55 in `src/`).

| Rule ID | Count | Root Cause Summary | Remediation Pattern |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | **83** | 34 in `catch (err: any)`, 8 in spreadsheet row records, 23 in API/action parameters, 18 in UI state | Use `catch (err: unknown)` with error message guard; introduce strict domain interfaces (`Team`, `Participant`, `Record<string, unknown>`) |
| `react/no-unescaped-entities` | **12** | Direct apostrophes (`'`) and quotes (`"`) in JSX text | Replace with HTML entities: `&apos;`, `&quot;` |
| `react-hooks/set-state-in-effect` | **5** | Synchronous `setLoading(true)` calls inside `useEffect` bodies | Initialize loading state to `true` or remove synchronous setter from effect entry |
| `react-hooks/immutability` | **1** | Calling `handleLookupToken` in `useEffect` 62 lines before its lexical declaration | Hoist function declaration above effect |

#### 2. ESLint Noise Elimination Strategy
- Adding `".agents/**"` to `globalIgnores` in `eslint.config.mjs` immediately eliminates **94 irrelevant warnings** from external skill scripts (`live-browser.js`, `modern-screenshot.umd.js`).
- Cleaning unused imports in `src/` resolves remaining 41 warnings.

#### 3. TypeScript Typecheck Analysis
- `npx.cmd tsc --noEmit` exits with **0 errors**.
- **Crucial Caveat**: `tsc` passes because explicit `any` disables type checking on those variables. Replacing `any` with strict types will surface latent property access errors unless complete domain interfaces are defined first.

#### 4. Automated Testing Deficit
- `package.json` lacks `"test"` script.
- Test runner (`vitest`) and testing libraries are missing from `devDependencies`.
- Zero test files exist (0.00% test coverage).
- Required test suites: `crypto.test.ts`, `checkin.test.ts`, `auth.test.ts`, `rbac.test.ts`, `export.test.ts`.

---

### 3.4 Section 4: Traceability & Compliance Matrix

The audit document must provide an exhaustive, verifiable compliance table mapping each requirement and acceptance criterion:

| Requirement / Acceptance Criterion | Source | Current Status | Current Evidence / Failure Mode | Target Milestone | Verification Gate |
|---|---|---|---|---|---|
| **R1. Formal System Documentation** | ORIGINAL_REQUEST §R1 | 🟡 In Progress | `docs/` directory missing; survey phase initiated | M1 | All 5 markdown docs in `docs/` and `.env.example` created |
| **R2. Password Hashing & Account Lifecycle** | ORIGINAL_REQUEST §R2 | 🔴 Non-Compliant | Plaintext `"admin123"` in `authService.ts:16` | M2 | Salted PBKDF2/scrypt, no plaintext stored |
| **R2. Signed Session Tokens & Throttling** | ORIGINAL_REQUEST §R2 | 🔴 Non-Compliant | Unsigned `JSON.stringify(user)` cookie in `authService.ts:59`; no rate limit | M2 | HMAC-SHA256 cookie with expiry; 5-attempt brute-force lockout |
| **R3. Edge Middleware Route Protection** | ORIGINAL_REQUEST §R3 | 🔴 Non-Compliant | No `src/middleware.ts`; `/events` & `/scan` open | M3 | Middleware redirecting unauthenticated requests to `/` |
| **R3. Server-Enforced RBAC** | ORIGINAL_REQUEST §R3 | 🔴 Non-Compliant | Volunteers can access admin pages; server actions unshielded | M3 | Volunteer access to `/events/*` redirected to `/scan`; 403 on admin actions |
| **R3. API Route Authorization Guards** | ORIGINAL_REQUEST §R3 | 🔴 Non-Compliant | `/api/export`, `/api/checkin`, `/api/teams` return 200 anonymously | M3 | HTTP 401 Unauthorized returned on all unprotected API calls |
| **R3. Attendee PII Shielding** | ORIGINAL_REQUEST §R3 | 🔴 Non-Compliant | Full PII dumped via `GET /api/export` | M3 | PII masked for volunteers; blocked for anonymous |
| **R4. Database Schema Realignment** | ORIGINAL_REQUEST §R4 | 🔴 Non-Compliant | `schema.sql` and `dataStore.ts` only use `teams` | M4 | Generalized schema: `event_tracks`, `groups`, `registrations` |
| **R4. Dual-Mode Data Persistence** | ORIGINAL_REQUEST §R4 | 🟡 Partial | Local JSON exists; Supabase sync is fire-and-forget without transaction | M4 | Synchronous/resilient dual persistence with offline fallback |
| **R5. Secure HMAC QR Passes (`SECQR:`)** | ORIGINAL_REQUEST §R5 | 🟡 Partial | Implemented but bypassed for non-SECQR strings | M5 | Non-SECQR bypass removed; constant-time comparison |
| **R5. Atomic Single-Use Check-In** | ORIGINAL_REQUEST §R5 | 🟡 Partial | Duplicate rejection works in local store, but not atomic in Postgres | M5 | Atomic single-use commit; duplicate scan logs violation with timestamp |
| **R5. Payment Review Modal** | ORIGINAL_REQUEST §R5 | 🔴 Non-Compliant | 0 payment code in codebase | M5 | Modal in Registrations page with Approve/Reject actions |
| **R5. Offline CSV & Printable Roster** | ORIGINAL_REQUEST §R5 | 🟡 Partial | `/api/export` creates CSV; page exports JSON; printable missing | M5 | Page CSV download + printable A4 emergency roster view |
| **R6. Zero ESLint Errors (101 Fixes)** | ORIGINAL_REQUEST §R6 | 🔴 Non-Compliant | Exactly 101 ESLint errors | M6 | `npm.cmd run lint` completes with 0 errors |
| **R6. TypeScript Compilation** | ORIGINAL_REQUEST §R6 | 🟢 Passing | `npx.cmd tsc --noEmit` exits with 0 errors | M6 | Maintain 0 errors under strict typing |
| **R6. Automated Test Suite** | ORIGINAL_REQUEST §R6 | 🔴 Non-Compliant | No test runner or test files | M6 | `npm.cmd test` passes 100% across all 5 test suites |
| **R6. Production Build** | ORIGINAL_REQUEST §R6 | 🟢 Passing | `npm.cmd run build` compiles | M6 | Build completes cleanly after all refactorings |

---

# PART II: STRATEGY & BLUEPRINT FOR `docs/IMPLEMENTATION_PLAN.md`

## 4. Complete Outline & Structure for `docs/IMPLEMENTATION_PLAN.md`

The generated `docs/IMPLEMENTATION_PLAN.md` must follow this structure:
- **Section 1: Architecture Roadmap & Engineering Principles**
  - Dependency sequence and milestone graph (M1 -> M2 -> M3 -> M4 -> M5 -> M6)
  - Core architectural tenets (defense in depth, zero-breakage dual mode, strict typing)
- **Section 2: Phased Execution Specifications (M1 to M6)**
  - Detailed subsections for each milestone containing:
    * Objective & Scope
    * Prerequisites & Dependencies
    * Technical Deliverables (Files to create/modify)
    * Interface Contracts & Signatures
    * Step-by-Step Implementation Procedure
    * Verification Procedures & Invariant Assertions
    * Acceptance Criteria Exit Gate
- **Section 3: Interface Contracts Specification Directory**
  - Complete TypeScript interface definitions for all service layers
- **Section 4: Risk Management, Rollback & Disaster Recovery Strategies**
  - Risk Matrix & Contingency Plans
  - Multi-tier rollback procedures (git revert, schema downgrade, local JSON recovery)
  - Venue offline disaster recovery protocol

---

## 5. Detailed Milestone Specifications for `docs/IMPLEMENTATION_PLAN.md`

### 5.1 Milestone M1: System Audit, Architecture & Environment Documentation
- **Scope**: Features 1, 2 (`docs/*`, `.env.example`).
- **Dependencies**: None.
- **Technical Deliverables**:
  1. `docs/PROJECT_AUDIT.md`: Complete system audit, vulnerability report, ESLint inventory, compliance matrix.
  2. `docs/ARCHITECTURE.md`: App Router topology, Server Actions, dual-mode persistence, and security boundaries.
  3. `docs/DATABASE_SCHEMA.md`: PostgreSQL schema, RLS policies, local JSON schema mapping.
  4. `docs/SECURITY.md`: Threat model, cryptographic primitives, HMAC SECQR specifications, PBKDF2 parameters.
  5. `docs/IMPLEMENTATION_PLAN.md`: Phase-by-phase execution plan.
  6. `.env.example`: Exhaustive configuration template documenting all required secrets.
- **Verification Procedures**:
  - Verify all 5 documents exist under `docs/` and `.env.example` exists in root.
  - Review documentation against ORIGINAL_REQUEST requirements R1–R6.
- **Exit Gate**: All documentation approved; documentation reflects verified codebase realities.

---

### 5.2 Milestone M2: Authentication & Account Lifecycle Hardening
- **Scope**: Features 3, 4, 5 (Password hashing, signed sessions, brute-force rate limiting).
- **Prerequisites**: Milestone M1.
- **Technical Deliverables**:
  1. `src/lib/services/authService.ts`:
     - Refactor to replace plaintext passwords with PBKDF2/scrypt salted hashes.
     - Replace raw JSON cookies with HMAC-SHA256 signed session tokens containing expiry.
     - Implement in-memory/persistent brute-force rate limiter (5 attempts / 15 mins).
  2. `src/app/actions/authActions.ts`:
     - Harden server actions with strict input validation and typed return structures.
  3. `src/app/page.tsx`:
     - Secure login UI (display secured demo accounts without exposing plain passwords in insecure manners).
- **Interface Contract**:
  ```typescript
  export interface UserAccount {
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "VOLUNTEER";
    avatar: string;
  }

  export interface SessionPayload {
    userId: string;
    email: string;
    role: "ADMIN" | "VOLUNTEER";
    fullName: string;
    avatar?: string;
    issuedAt: number;
    expiresAt: number;
  }

  export class AuthService {
    static hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }>;
    static verifyPassword(password: string, hash: string, salt: string): Promise<boolean>;
    static createSessionToken(user: UserAccount): Promise<string>;
    static verifySessionToken(token: string): Promise<UserAccount | null>;
    static checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; retryAfterSec?: number };
    static recordFailedLogin(identifier: string): void;
    static resetRateLimit(identifier: string): void;
    static authenticate(email: string, password: string, clientIp?: string): Promise<{ success: boolean; user?: UserAccount; error?: string }>;
    static getCurrentUser(): Promise<UserAccount | null>;
    static logout(): Promise<void>;
  }
  ```
- **Step-by-Step Implementation**:
  1. Add crypto helper functions using `crypto.pbkdf2` or `crypto.scrypt` with random 16-byte salts.
  2. Store salted hash constants for demo admin and volunteer accounts.
  3. Implement token serializer: `payloadBase64.signatureBase64`.
  4. Implement token deserializer with HMAC-SHA256 validation against `SESSION_SECRET` and timestamp expiration check.
  5. Add rate-limiting map tracking failed attempts by IP/email with automated cleanup.
  6. Update `authenticate` to enforce rate-limiting check before credential evaluation.
- **Verification Procedures**:
  - Test login with valid credentials -> session cookie is signed and contains 2 dot-separated segments.
  - Test login with tampered cookie -> session returns `null`.
  - Test 5 consecutive incorrect passwords -> 6th attempt is blocked with lockout notice.
- **Exit Gate**: Plaintext credentials eliminated; signed session token verified; brute-force throttled.

---

### 5.3 Milestone M3: Server-Enforced RBAC & Route/API Protection
- **Scope**: Features 6, 7, 8, 9 (Edge middleware, route protection, API authorization, PII masking).
- **Prerequisites**: Milestone M2.
- **Technical Deliverables**:
  1. `src/middleware.ts`: Next.js Edge Middleware for routing interception.
  2. `src/lib/services/rbacService.ts` or `src/lib/authGuard.ts`: Server action authorization helper (`requireAuth`).
  3. `src/app/api/export/route.ts`: Enforce admin-only authorization; return 401/403.
  4. `src/app/api/checkin/route.ts`: Enforce authenticated volunteer/admin authorization; return 401.
  5. `src/app/api/teams/route.ts`: Enforce authenticated access; return 401.
  6. `src/app/api/teams/[teamId]/route.ts`: Enforce authenticated access; return 401/403.
  7. `src/app/api/import/route.ts`: Enforce admin-only authorization; return 401/403.
  8. `src/app/actions/eventActions.ts`, `src/app/actions/qrActions.ts`, `src/app/actions/importData.ts`: Enforce `requireAuth` guards.
- **Edge Middleware Specification**:
  ```typescript
  import { NextRequest, NextResponse } from "next/server";

  export const config = {
    matcher: [
      "/events/:path*",
      "/scan/:path*",
      "/api/export/:path*",
      "/api/checkin/:path*",
      "/api/teams/:path*",
      "/api/import/:path*",
    ],
  };

  export async function middleware(req: NextRequest) {
    // 1. Read session cookie
    // 2. If unauthenticated:
    //    - API routes -> return 401 Unauthorized JSON
    //    - Page routes -> redirect to /?redirect=encodeURIComponent(pathname)
    // 3. If authenticated as VOLUNTEER:
    //    - Navigating /events/* -> redirect to /scan
    //    - Calling /api/export or admin actions -> return 403 Forbidden
    // 4. If ADMIN or authorized -> proceed NextResponse.next()
  }
  ```
- **Step-by-Step Implementation**:
  1. Create `src/middleware.ts` with matcher config.
  2. Extract session verification logic compatible with Edge runtime (using Web Crypto API or lightweight crypto).
  3. Wire route redirection for unauthenticated and volunteer users.
  4. Add auth check inside API route handlers for defense-in-depth.
  5. Add `requireAuth("ADMIN")` check to administrative server actions.
  6. Mask sensitive attendee fields in volunteer team lists.
- **Verification Procedures**:
  - `curl -i http://localhost:3000/api/export` -> Returns `HTTP 401 Unauthorized`.
  - `curl -i http://localhost:3000/api/checkin` -> Returns `HTTP 401 Unauthorized`.
  - Browser navigation to `/events` without cookie -> Redirects to `/?redirect=%2Fevents`.
  - Volunteer login -> Navigate to `/events/ev-1/dashboard` -> Redirects to `/scan`.
- **Exit Gate**: All 4 acceptance criteria under Security & Access Control satisfied.

---

### 5.4 Milestone M4: Database Schema Realignment & Dual-Mode Persistence
- **Scope**: Features 10, 11 (Generalized schema, dual-mode persistence, Supabase + local JSON).
- **Prerequisites**: None (can run in parallel with M2/M3, but ideally sequenced after).
- **Technical Deliverables**:
  1. `schema.sql`: Comprehensive PostgreSQL schema with 8 generalized entities (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`, `users`).
  2. `src/lib/dataStore.ts`:
     - Update TypeScript domain interfaces to generalized entities.
     - Implement backward-compatible adapters mapping `teams` queries to `groups` / `registrations`.
     - Implement concurrency-safe local JSON persistence.
- **Generalized Domain Entities**:
  ```typescript
  export interface EventTrack {
    id: string;
    event_id: string;
    name: string;
    max_group_size: number;
    min_group_size: number;
    created_at: string;
  }

  export interface Registration {
    id: string;
    event_id: string;
    track_id?: string;
    type: "INDIVIDUAL" | "GROUP";
    source: "ADVANCE" | "ON_SPOT";
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    email: string;
    phone?: string;
    payment_screenshot_url?: string | null;
    payment_status: "PENDING" | "VERIFIED" | "REJECTED";
    payment_reviewed_by?: string | null;
    payment_reviewed_at?: string | null;
    payment_rejection_reason?: string | null;
    qr_token?: string | null;
    qr_expires_at?: string | null;
    qr_email_sent: boolean;
    qr_email_sent_at?: string | null;
    check_in_status: "NOT_CHECKED_IN" | "CHECKED_IN";
    checked_in_at?: string | null;
    checked_in_by?: string | null;
    scan_count: number;
    created_at: string;
  }

  export interface Group {
    id: string;
    event_id: string;
    registration_id: string;
    track_id: string;
    name: string;
    normalized_name: string;
    created_at: string;
  }

  export interface Participant {
    id: string;
    event_id: string;
    registration_id?: string;
    group_id?: string;
    full_name: string;
    email: string;
    mobile_number?: string;
    course?: string;
    year_of_study?: string;
    semester?: string;
    identifier?: string;
    is_leader: boolean;
    created_at: string;
  }
  ```
- **Step-by-Step Implementation**:
  1. Rewrite `schema.sql` with complete generalized DDL, constraints, foreign keys, and RLS policies.
  2. Update `dataStore.ts` types and schemas.
  3. Add adapter functions (`getTeams`, `getTeamById`, `updateTeam`) wrapping generalized entities so existing UI does not break.
  4. Implement transactional or atomic local file write helpers with temporary file renaming.
- **Verification Procedures**:
  - Run database migration against Supabase or inspect SQL syntax.
  - Test dual-mode fallback: disconnect internet/set invalid Supabase URL -> system continues operating using `data/events-data.json`.
- **Exit Gate**: Generalized entities in schema; dual-mode persistence operational with zero breakage.

---

### 5.5 Milestone M5: Gate Verification, Payment Review Modal & Offline Roster
- **Scope**: Features 12, 13, 14, 15, 16, 17 (HMAC QR generation, constant-time verification, duplicate prevention, payment modal, CSV/printable roster).
- **Prerequisites**: Milestones M2, M3, M4.
- **Technical Deliverables**:
  1. `src/lib/services/cryptoService.ts`:
     - Remove non-`SECQR:` bypass; enforce constant-time signature verification with `crypto.timingSafeEqual`.
     - Enforce `QR_HMAC_SECRET` validation.
  2. `src/app/actions/qrActions.ts`:
     - Harden check-in action to enforce atomic single-use check-in.
     - Log duplicate check-in violations to `audit_logs` with exact previous timestamp and operator ID.
     - Add `approveRegistration` and `rejectRegistration` server actions with payment review tracking.
  3. `src/app/(admin)/events/[eventId]/registrations/page.tsx`:
     - Build `PaymentReviewModal` allowing admins to view uploaded payment proof, zoom, pan, and approve/reject.
     - Wire CSV export button to download `roster_<eventId>.csv`.
     - Implement printable roster view with A4 formatting.
- **Payment Modal Interface Contract**:
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
      amount?: number;
      created_at: string;
    };
    onApprove: (registrationId: string) => Promise<void>;
    onReject: (registrationId: string, reason: string) => Promise<void>;
  }
  ```
- **Verification Procedures**:
  - Scan valid SECQR pass -> Check-in succeeds.
  - Scan same pass second time -> Rejected with duplicate violation alert and exact timestamp.
  - Scan pass with 1 modified character -> Cryptographic signature failure.
  - Open Registrations page -> Click "Review Payment" -> Modal displays screenshot -> Click "Approve" -> Status changes to APPROVED and SECQR is generated.
  - Click "Export CSV" -> Valid CSV file downloaded.
- **Exit Gate**: All 5 Functionality & Verification acceptance criteria verified.

---

### 5.6 Milestone M6: Code Quality, 0-Error Linting & Automated Test Suite
- **Scope**: Features 18, 19, 20, 21, 22, 23, 24, 25 (ESLint 101 fixes, Vitest setup, automated test suites, clean build).
- **Prerequisites**: Milestones M1 through M5.
- **Technical Deliverables**:
  1. `eslint.config.mjs`: Ignore `.agents/**` in `globalIgnores`.
  2. Source code refactor across 23 files to eliminate all 101 ESLint errors:
     - 34 `catch (err: any)` replaced with typed error helper.
     - 8 spreadsheet import rows typed with `Record<string, unknown>`.
     - 41 parameters and state variables typed with strict interfaces.
     - 12 unescaped JSX entities replaced with `&apos;` and `&quot;`.
     - 5 `set-state-in-effect` errors resolved.
     - 1 `react-hooks/immutability` hoisted.
  3. `vitest.config.ts` and `package.json` test script:
     - Install `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`.
     - Configure `"test": "vitest run"`.
  4. Test Suites in `tests/`:
     - `tests/crypto.test.ts`: SECQR generation, HMAC verification, tamper rejection, expired rejection.
     - `tests/checkin.test.ts`: Atomic single-use check-in, duplicate detection, OTP fallback.
     - `tests/auth.test.ts`: Salted password hashing, signed sessions, brute-force throttling.
     - `tests/rbac.test.ts`: Edge middleware redirection, API 401/403 protection.
     - `tests/export.test.ts`: CSV roster generation and offline store fallback.
  5. Build verification: `npm.cmd run build`.
- **Verification Procedures**:
  - `npm.cmd run lint` -> Exits with **0 errors**.
  - `npx.cmd tsc --noEmit` -> Exits with **0 errors**.
  - `npm.cmd test` -> All 5 test suites pass (100% success).
  - `npm.cmd run build` -> Next.js production build completes cleanly.
- **Exit Gate**: All Code Quality & Build Verification acceptance criteria satisfied.

---

## 6. Risk Management, Rollback & Disaster Recovery Strategies

### 6.1 Risk Matrix

| Risk ID | Description | Likelihood | Impact | Mitigation Strategy | Contingency Plan |
|---|---|---|---|---|---|
| **RSK-01** | Strict typing refactoring introduces compile regressions | Medium | High | Define centralized domain interfaces before replacing `any`; run `tsc` continuously | Revert file using git checkpoint and apply typed wrapper |
| **RSK-02** | Edge Middleware breaks client navigation or hydration | Medium | High | Use minimal Edge-compatible crypto; test matcher paths; keep public routes exempt | Temporarily disable specific matcher route while debugging |
| **RSK-03** | Schema changes break legacy UI views expecting `teams` | High | High | Keep backward-compatible adapter methods in `dataStore.ts` mapping `teams` to `groups` | Data store translates on the fly |
| **RSK-04** | Venue network blackout during event gate operations | High | High | Dual-mode persistence: local JSON store handles all reads/writes autonomously | Offline CSV/printable roster exported prior to event |
| **RSK-05** | Vitest configuration conflict with Next.js 16 App Router | Low | Medium | Use `node` test environment for services/crypto and standard TS mocking | Isolate unit tests to service layer |

### 6.2 Rollback Protocols
1. **Source Code Rollback**:
   - Every milestone commits clean, atomic git commits.
   - If a milestone fails verification, roll back using `git checkout -b rollback-<milestone> HEAD~1`.
2. **Database Schema Rollback**:
   - `schema.sql` migrations must include idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
   - If schema realignment fails, maintain `teams` table as view or alias over `groups`.
3. **Session Cookie Secret Rollback**:
   - Maintain secret rotation support (`AUTH_SECRET_PREVIOUS`) so existing user sessions do not immediately invalidate upon key updates.

### 6.3 Venue Disaster Recovery Protocol
- In case of venue internet failure:
  1. Admin navigates to `/events/[eventId]/registrations` and exports full CSV roster.
  2. Admin prints A4 emergency roster containing alphabetical attendee names, check-in checkboxes, and team codes.
  3. Gate scanners operate against local host / local network with `data/events-data.json`.
  4. Manual check-in records are batch synced when connection restores.

---

## 7. Downstream Author Guidance for Documentation Authors

When generating `docs/PROJECT_AUDIT.md`:
- Emphasize empirical evidence: cite specific file paths, line numbers, and exact code chunks.
- Structure findings into clear CVSS-style risk classifications.
- Use clean Markdown tables for the 101 ESLint error inventory and the Compliance Matrix.

When generating `docs/IMPLEMENTATION_PLAN.md`:
- Present the phased milestones in chronological dependency order (M1 through M6).
- Include full TypeScript interface contracts for all new or refactored services.
- Provide explicit shell command verification instructions (`npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build`).
- Keep the risk management and disaster recovery protocols actionable for venue event operations.
