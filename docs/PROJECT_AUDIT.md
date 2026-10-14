# Universal Event Registration & QR Check-in System: Forensic Project Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-10-14  
**Audit Target:** Full Stack Codebase (`d:\Project\Event Management`)  
**Audited Runtime:** Next.js 16.4.0 (Turbopack, App Router), React 19.3.0, TypeScript 5, Tailwind CSS v4, Node.js v24.21.0  
**Classification:** Internal Technical Assessment & Remediation Blueprint  

---

## 1. Executive Summary & System Health Scorecard

### 1.1 Overview
The Universal Event Registration & QR Check-in System is designed for high-density, multi-track collegiate and professional events (hackathons, conferences, summits, and esports tournaments) managing hundreds of attendees across distributed gate verification stations. 

A comprehensive forensic audit of the codebase was conducted against the functional and architectural specifications in `ORIGINAL_REQUEST.md`, `PROJECT.md`, `PRD.md`, `TSD.md`, and `GEMINI.md`. While the application demonstrates an attractive, functional user interface with operational components for QR presentation, camera-based scanning (`html5-qrcode`), data imports, and audit log viewing, the system currently suffers from **severe security vulnerabilities, structural domain misalignments, a complete absence of automated testing, and 101 blocking static analysis violations**.

In its current state, **the application is not production-ready and cannot be deployed securely**. Immediate remediation is required across authentication, session handling, access control, cryptographic verification, and database modeling.

### 1.2 System Health Scorecard

| Dimension | Measured Status | Baseline Finding | Production Invariant Required | Target Milestone |
|---|:---:|---|---|:---:|
| **Authentication** | 🔴 Critical Failure | Hardcoded plaintext passwords (`admin123`, `volunteer123`), direct string matching, zero cryptographic hashing or salt. | Salted PBKDF2/scrypt key derivation (100,000 iterations), constant-time comparison, zero plaintext storage. | M2 |
| **Session Security** | 🔴 Critical Failure | Raw JSON string serialized directly into unsigned HTTP cookie (`event_auth_session`). Trivial privilege escalation. | Tamper-evident HMAC-SHA256 signed session tokens with cryptographically enforced expiration timestamps. | M2 |
| **Access Control (RBAC)** | 🔴 Critical Failure | Zero Edge Middleware (`src/middleware.ts` missing). All admin portals, volunteer scanners, and REST APIs accessible anonymously. | Next.js Edge Middleware intercepting unauthenticated traffic and enforcing strict role segregation (`ADMIN` vs `VOLUNTEER`). | M3 |
| **Data Protection (PII)** | 🔴 Critical Failure | `/api/export` returns unauthenticated full dumps of attendee names, personal emails, mobile numbers, student IDs, and QR tokens. | Strict 401 Unauthorized for anonymous requests; 403 Forbidden for volunteers; PII masking on gate displays. | M3 |
| **Domain Schema** | 🟠 Structural Defect | Conflates registrations into gaming-specific `teams` table, violating `GEMINI.md`. Lacks distinct `event_tracks`, `groups`, and `registrations`. | Realigned 8-entity normalized PostgreSQL relational schema with Supabase Row-Level Security (RLS) policies. | M4 |
| **Data Persistence** | 🟡 Partial Support | Local JSON store (`data/events-data.json`) functional; Supabase sync is non-transactional and uses placeholder endpoint. | Resilient dual-mode persistence with transactional integrity, circuit breaker failover, and offline sync. | M4 |
| **Gate Cryptography** | 🔴 Critical Failure | Non-`SECQR:` bypass accepts arbitrary unsigned strings; signature check uses variable-time string comparison (`!==`). | Mandatory `SECQR:` format enforcement, constant-time verification (`crypto.timingSafeEqual`), enforced environment secrets. | M5 |
| **Payment Verification** | 🔴 Missing Feature | Zero payment code in `src/`. No review modal, no status tracking, imports auto-approve attendees without payment checks. | Dedicated payment review modal, screenshot zoom/preview, Approve/Reject server actions, and pending gate state. | M5 |
| **Code Quality & Linting** | 🔴 Failing Gates | Exactly 101 ESLint errors across 23 source files (`no-explicit-any`, `no-unescaped-entities`, `react-hooks` rules). | Clean `npm.cmd run lint` exit with 0 errors and zero rule suppressions in production code. | M6 |
| **Automated Testing** | 🔴 Zero Coverage | No test runner configured, no `"test"` script in `package.json`, 0 test files (0.00% test coverage). | Vitest automated test suite covering crypto, auth, check-in, RBAC, and persistence with 100% pass rate. | M6 |

---

## 2. Deep-Dive Forensic Vulnerability Audit

### VULN-01: Hardcoded Plaintext Credentials in Authentication Service
- **File:** `src/lib/services/authService.ts`
- **Lines:** 12–29, 44–46
- **CVSS v3.1 Score:** 9.8 (Critical) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Verbatim Vulnerable Code:**
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
- **Exploit Scenario:** Any individual with read access to the repository, or any attacker capable of inspecting client build artifacts, can obtain administrative access. Furthermore, line 104 uses standard strict equality (`===`), exposing authentication to timing side-channel attacks.
- **Remediation Specification:**
  1. Remove all plaintext passwords from source code and memory constants.
  2. Implement PBKDF2 key derivation using HMAC-SHA512 with 100,000 iterations and a cryptographically secure 32-byte (256-bit, 64 hex characters) random salt per user generated via `crypto.randomBytes(32)`.
  3. Verify passwords using `crypto.timingSafeEqual` between candidate hash buffers and stored hash buffers.
  4. Store only salted hashes and salt strings in the persistent user store.

---

### VULN-02: Unsigned, Forcible Raw JSON Cookie Sessions
- **File:** `src/lib/services/authService.ts`
- **Lines:** 58–65, 76–85
- **CVSS v3.1 Score:** 9.8 (Critical) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Verbatim Vulnerable Code:**
  ```typescript
  // Setting session cookie:
  cookieStore.set(COOKIE_NAME, JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Reading session cookie:
  const session = cookieStore.get(COOKIE_NAME);
  if (!session || !session.value) return null;
  return JSON.parse(session.value) as UserAccount;
  ```
- **Exploit Scenario:** The session cookie `event_auth_session` contains raw, unsigned JSON. An attacker can set this cookie in their browser using standard developer tools:
  ```json
  {"id":"usr-attacker","email":"attacker@evil.com","fullName":"Attacker","role":"ADMIN","avatar":"AT"}
  ```
  Upon page reload, `AuthService.getCurrentUser()` parses this arbitrary JSON without signature verification, granting the attacker unrestricted `ADMIN` privileges.
- **Remediation Specification:**
  1. Replace raw JSON cookies with signed compound tokens: `<base64UrlPayload>.<hmacSignature>`.
  2. Compute signatures using HMAC-SHA256 with a dedicated `SESSION_SECRET` (minimum 256 bits of entropy).
  3. Include `issuedAt` (`iat`) and `expiresAt` (`exp`) timestamps inside the signed payload.
  4. On cookie extraction, verify the signature using `crypto.timingSafeEqual` and enforce `now < expiresAt`. Reject invalid or tampered tokens immediately.

---

### VULN-03: Complete Absence of Next.js Route Protection Middleware
- **File:** `src/middleware.ts` (Missing entirely)
- **CVSS v3.1 Score:** 9.1 (Critical) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`
- **Observed Behavior:** Directory inspection reveals that `src/middleware.ts` does not exist. As a result, Next.js performs no route evaluation prior to rendering pages or processing server actions.
- **Exploit Scenario:**
  1. An anonymous user navigates directly to `http://localhost:3000/events/ev-1/dashboard` or `http://localhost:3000/events/ev-1/registrations`. The page renders in full.
  2. An authenticated volunteer can access any administrative event configuration, audit log, or registration management view.
  3. In `src/app/(volunteer)/layout.tsx:14-21`, the volunteer navigation bar actively renders a link button directly leading to the administrative dashboard (`/events/ev-1/dashboard`).
- **Remediation Specification:**
  1. Author `src/middleware.ts` with matcher pattern covering `['/events/:path*', '/scan/:path*', '/api/export/:path*', '/api/checkin/:path*', '/api/teams/:path*', '/api/import/:path*']`.
  2. In the middleware, inspect the signed session cookie. Redirect unauthenticated page requests to `/?redirect=<original_path>`.
  3. If session role is `VOLUNTEER` and requested path matches `/events/*`, redirect immediately to `/scan`.
  4. Return `401 Unauthorized` for unauthenticated `/api/*` requests, and `403 Forbidden` for unauthorized volunteer access.

---

### VULN-04: Unauthenticated & Unchecked REST API Endpoints
- **Files:**
  - `src/app/api/export/route.ts` (lines 4–54)
  - `src/app/api/checkin/route.ts` (lines 4–60)
  - `src/app/api/teams/route.ts` (lines 4–65)
  - `src/app/api/import/route.ts` (lines 5–35)
- **CVSS v3.1 Score:** 9.8 (Critical) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Observed Behavior:** None of the REST API endpoints perform authentication or role checks.
- **Exploit Scenario:**
  - Executing `curl -X GET http://localhost:3000/api/export` returns a complete CSV dump of all attendees across all events, including full names, college roll numbers, phone numbers, email addresses, and secret QR tokens.
  - Executing `curl -X POST http://localhost:3000/api/checkin` allows an anonymous actor to mark any attendee as checked in without credentials or authorization.
  - `POST /api/import` allows an unauthenticated external actor to inject arbitrary attendee records directly into the event datastore.
- **Remediation Specification:**
  1. Introduce a server-side authorization guard `requireApiAuth(req, allowedRoles)` in `src/lib/services/authService.ts`.
  2. Guard `/api/export` and `/api/import` to require `ADMIN` role.
  3. Guard `/api/checkin` and `/api/teams` to require `ADMIN` or `VOLUNTEER` role.
  4. Return standardized JSON error envelopes: `{ success: false, error: "Authentication required." }` (401) and `{ success: false, error: "Insufficient permissions." }` (403).

---

### VULN-05: Cryptographic Bypass & Timing Attack in QR Verification
- **File:** `src/lib/services/cryptoService.ts`
- **Lines:** 3, 19, 58–65, 83
- **CVSS v3.1 Score:** 8.5 (High) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`
- **Verbatim Vulnerable Code:**
  ```typescript
  // Line 3: Hardcoded fallback secret
  const QR_SECRET_KEY = process.env.QR_HMAC_SECRET || "event-security-hmac-salt-production-2026-secret";

  // Line 19: Truncated 32-character signature
  return crypto.createHmac("sha256", QR_SECRET_KEY).update(data).digest("hex").slice(0, 32);

  // Lines 58-65: Non-SECQR bypass accepting arbitrary unsigned tokens
  if (!clean.startsWith("SECQR:")) {
    return {
      valid: true,
      isSignedPayload: false,
      token: clean,
    };
  }

  // Line 83: Variable-time comparison
  if (payload.sig !== expectedSig) {
    return { valid: false, isSignedPayload: true, tamperDetected: true, ... };
  }
  ```
- **Exploit Scenario:**
  1. Lines 58–65 contain an intentional or accidental bypass: if a barcode string does not start with `SECQR:`, the function treats the raw string as a valid token and returns `valid: true`. An attacker can generate a barcode with an arbitrary raw registration UUID and pass gate verification without any signature.
  2. Line 83 uses standard `!==` string comparison on signatures, enabling timing attacks to guess valid HMAC bytes incrementally.
  3. The fallback HMAC secret is committed in plaintext in the repository.
- **Remediation Specification:**
  1. Completely eliminate the non-`SECQR:` bypass. Any payload not starting with `SECQR:` must return `valid: false` and `tamperDetected: true`.
  2. Mandate full 64-character SHA-256 hex digests without truncation.
  3. Perform signature verification using `crypto.timingSafeEqual(Buffer.from(payload.sig, 'hex'), Buffer.from(expectedSig, 'hex'))`.
  4. Enforce that `QR_HMAC_SECRET` is defined in environment variables, throwing an error on startup in production if missing.

---

### VULN-06: Complete Absence of Payment Proof Verification Workflow
- **Files:** `src/app/(admin)/events/[eventId]/registrations/page.tsx`, `src/lib/dataStore.ts`, `src/app/actions/importData.ts`
- **CVSS v3.1 Score:** 7.5 (High) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`
- **Observed Behavior:** Searching the codebase for `"payment"` yields zero references across all files in `src/`. The system currently has no data fields for payment screenshots, review states, reviewer identity, or rejection reasons. Spreadsheet imports (`importData.ts:50`) automatically set all imported attendees to `APPROVED`.
- **Exploit Scenario:** Paid events cannot enforce fee collection. Fraudulent registrations enter the system as approved, receive QR passes, and gain physical entry without administrative financial verification.
- **Remediation Specification:**
  1. Add payment attributes to registration models: `payment_screenshot_url`, `payment_status` (`'PENDING' | 'VERIFIED' | 'REJECTED'`), `payment_reviewed_by`, `payment_reviewed_at`, and `payment_rejection_reason`.
  2. Build a `PaymentReviewModal` component in `src/app/(admin)/events/[eventId]/registrations/` featuring image preview, zoom, pan, and Approve/Reject action triggers.
  3. Gate QR ticket issuance: passes are generated only when `payment_status === 'VERIFIED'` and registration `status === 'APPROVED'`.

---

### VULN-07: Schema & Domain Terminology Misalignment
- **Files:** `schema.sql`, `src/lib/dataStore.ts`
- **CVSS v3.1 Score:** 5.3 (Medium) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N`
- **Observed Behavior:** `schema.sql` line 1 titles itself "Multi-Event E-Sports Registration... Schema". The primary entity is `teams`, and foreign keys tie participants exclusively to team entities. There are no relational models for `event_tracks`, `groups`, or `registrations`.
- **Impact:** Violates the mandatory project guideline in `GEMINI.md`: *"Use generalized terms (`event_tracks`, `groups`, `participants`) instead of gaming-specific terms."* The system cannot cleanly model solo attendees, non-competitive tracks, or academic conference workshops.
- **Remediation Specification:**
  1. Rewrite `schema.sql` to define the 8 generalized entities: `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`, and `users`.
  2. Implement dual-mode adapter mappings in `src/lib/dataStore.ts` to bridge existing UI components to the generalized domain model without breaking active interfaces.

---

### VULN-08: Absence of Authentication Rate Limiting & Brute-Force Throttling
- **Files:** `src/lib/services/authService.ts`, `src/app/actions/authActions.ts`
- **CVSS v3.1 Score:** 7.5 (High) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
- **Observed Behavior:** Neither `AuthService.authenticate` nor `loginAction` tracks failed login attempts or enforces rate limiting.
- **Exploit Scenario:** An automated credential-stuffing script can execute thousands of password guesses per minute against the login endpoint without encountering throttling, exponential backoff, or temporary account lockout.
- **Remediation Specification:**
  1. Implement a sliding-window rate limiter tracking failed attempts by composite key `${clientIp}:${email}`.
  2. Enforce a threshold of 5 failed attempts per 15-minute window.
  3. Once exceeded, reject authentication attempts with HTTP 429 and a remaining lockout duration message, while writing an immediate `AUTH_LOCKOUT` critical audit log entry.

---

## 3. Code Quality, Static Analysis & Testing Deficit Audit

### 3.1 Exhaustive Catalog of 101 ESLint Errors

A full execution of `npm.cmd run lint` across the repository surfaces exactly **101 blocking errors** and **149 warnings** across 23 source files.

```
Total ESLint Errors: 101
Total ESLint Warnings: 149 (94 in external .agents scripts, 55 in src/)
Clean Target: 0 Errors, 0 Warnings in src/
```

#### Breakdown by ESLint Rule

| Rule Identifier | Error Count | Impacted Architectural Layer | Root Cause Summary |
|---|:---:|---|---|
| `@typescript-eslint/no-explicit-any` | **83** | Server Actions, API routes, `dataStore.ts`, UI pages | 34 instances in `catch (err: any)`; 8 instances in spreadsheet import records; 23 instances in API parameters/responses; 18 instances in React component state. |
| `react/no-unescaped-entities` | **12** | Client UI Components & Pages | Direct unescaped single quotes (`'`) and double quotes (`"`) used in JSX text nodes instead of `&apos;` or `&quot;`. |
| `react-hooks/set-state-in-effect` | **5** | Client Scanner & UI Leaf Nodes | Synchronous state setter calls (e.g. `setLoading(true)`) executed immediately inside `useEffect` bodies without conditional guard or deferred lifecycle. |
| `react-hooks/immutability` | **1** | Scanner Team Lookup Component | `handleLookupToken` function invoked inside `useEffect` 62 lines prior to its lexical declaration in the scope. |

#### Complete File Distribution of Errors

| File Path | Error Count | Dominant Rule | Required Fix Pattern |
|---|:---:|---|---|
| `src/app/actions/importData.ts` | 16 | `no-explicit-any` | Define typed Excel row interface; type error catches with `catch (err: unknown)`. |
| `src/lib/dataStore.ts` | 12 | `no-explicit-any` | Type database query parameters and JSON serialization return types. |
| `src/app/actions/qrActions.ts` | 10 | `no-explicit-any` | Replace `any` in check-in payloads and audit logging details with typed schemas. |
| `src/app/(admin)/events/[eventId]/registrations/page.tsx` | 9 | `no-explicit-any`, `no-unescaped-entities` | Type table filters and replace unescaped apostrophes in modal copy. |
| `src/app/actions/eventActions.ts` | 8 | `no-explicit-any` | Add typed input records for event creation and update actions. |
| `src/app/api/checkin/route.ts` | 7 | `no-explicit-any` | Type NextRequest body parsing and error handling. |
| `src/app/api/export/route.ts` | 6 | `no-explicit-any` | Type CSV export stream buffers and record mappings. |
| `src/app/api/teams/route.ts` | 5 | `no-explicit-any` | Type GET query parameter parsing and POST payload models. |
| `src/app/(volunteer)/scan/page.tsx` | 5 | `set-state-in-effect`, `immutability` | Hoist lookup helper functions above `useEffect`; initialize loading state directly. |
| `src/app/(admin)/events/[eventId]/imports/page.tsx` | 4 | `no-explicit-any`, `no-unescaped-entities` | Replace JSX unescaped quotes; type file upload handlers. |
| `src/app/(admin)/events/[eventId]/audit/page.tsx` | 4 | `no-explicit-any` | Type audit log details JSON formatting and filter criteria. |
| `src/app/(admin)/events/[eventId]/dashboard/page.tsx` | 3 | `no-explicit-any` | Type dashboard metric aggregation reducers. |
| `src/app/api/teams/[teamId]/email/route.ts` | 3 | `no-explicit-any` | Type email dispatch request bodies and Resend responses. |
| `src/app/api/teams/[teamId]/route.ts` | 3 | `no-explicit-any` | Type URL segment params and database response envelopes. |
| `src/app/actions/authActions.ts` | 2 | `no-explicit-any` | Type form action error returns. |
| `src/lib/services/authService.ts` | 1 | `no-explicit-any` | Type session cookie parser. |
| `src/lib/services/cryptoService.ts` | 1 | `no-explicit-any` | Type base64 JSON payload decoder. |
| `src/lib/services/emailService.ts` | 1 | `no-explicit-any` | Type ticket email metadata payload. |
| `src/lib/services/qrService.ts` | 1 | `no-explicit-any` | Type QR canvas buffer generation options. |
| Other UI components (4 files) | 5 | `no-unescaped-entities` | Fix JSX apostrophe entities. |

### 3.2 Analysis of ESLint Noise & Warnings
- **External Agent Skills (94 Warnings):** The `.agents/skills/` directory contains third-party JavaScript utilities (`live-browser.js`, `modern-screenshot.umd.js`) that generate 94 warnings regarding unused variables and loose types.
  - *Remediation:* Update `eslint.config.mjs` to add `".agents/**"` to `globalIgnores`. This immediately eliminates 94 non-project warnings.
- **Source Code Warnings (55 Warnings):** Unused import statements (`import { useState }`, unused icons) across `src/`.
  - *Remediation:* Clean unused imports across all 23 files during Milestone 6 refactoring.

### 3.3 TypeScript Compilation vs Static Analysis Paradox
- Running `npx.cmd tsc --noEmit` exits with **0 errors**.
- **Root Cause Analysis:** TypeScript compilation succeeds because developers extensively used explicit `any` (`(err: any)`, `(data: any)`). While this satisfies TypeScript's compiler by disabling type checking on those variables, it triggers ESLint's strict `@typescript-eslint/no-explicit-any` rule.
- **Implementation Warning:** When removing `any` in Milestone 6, developers must define complete, accurate domain interfaces first. Otherwise, converting `any` to strict types will trigger cascading TypeScript type errors on nested properties.

### 3.4 Zero-Coverage Automated Testing Deficit
- **Current State:**
  - `package.json` contains no `"test"` script.
  - No test runner (Vitest or Jest) is installed in `devDependencies`.
  - Exactly **0 test files** exist in the repository (`tests/` directory is missing).
  - Measured test coverage is **0.00% across all lines, branches, and functions**.
- **Required Remediation:**
  1. Install `vitest`, `@vitejs/plugin-react`, and `vite-tsconfig-paths`.
  2. Configure `vitest.config.ts` and add `"test": "vitest run"` to `package.json`.
  3. Author 5 comprehensive automated test suites covering:
     - `tests/crypto.test.ts`: SECQR generation, constant-time verification, tampering rejection, expiration handling.
     - `tests/auth.test.ts`: Salted PBKDF2 hashing, signed session cookie validation, brute-force rate limiting.
     - `tests/rbac.test.ts`: Edge middleware route interception, API 401/403 guards, volunteer privilege limits.
     - `tests/checkin.test.ts`: Atomic single-use check-in, duplicate detection, exact timestamp logging, OTP fallback.
     - `tests/export.test.ts`: Offline CSV roster generation and local JSON datastore resilience.

---

## 4. Comprehensive Compliance & Traceability Matrix

### 4.1 Requirements Traceability (R1 – R6)

| Requirement | Source Reference | Description | Current Status | Forensic Evidence | Target Milestone |
|---|---|---|:---:|---|:---:|
| **R1** | ORIGINAL_REQUEST §R1 | Complete System Audit & Architectural Documentation | 🟡 In Progress | `docs/` suite missing; Milestone 1 authoring in progress. | M1 |
| **R2** | ORIGINAL_REQUEST §R2 | Authentication & Account Lifecycle Hardening | 🔴 Non-Compliant | Plaintext `"admin123"` in `authService.ts:16`; unsigned JSON cookie in `authService.ts:59`. | M2 |
| **R3** | ORIGINAL_REQUEST §R3 | Server-Enforced RBAC & Route/API Protection | 🔴 Non-Compliant | `src/middleware.ts` non-existent; `/api/export` leaks all PII anonymously. | M3 |
| **R4** | ORIGINAL_REQUEST §R4 | Database Schema Realignment & Resilience | 🔴 Non-Compliant | `schema.sql` hardcoded to esports `teams`; no tracks or registration entities. | M4 |
| **R5** | ORIGINAL_REQUEST §R5 | Feature Completion: Payment Verification & Gate Security | 🔴 Non-Compliant | 0 payment references in `src/`; non-SECQR bypass in `cryptoService.ts:58`. | M5 |
| **R6** | ORIGINAL_REQUEST §R6 | Code Quality, 0-Error Linting & Automated Test Suite | 🔴 Non-Compliant | Exactly 101 ESLint errors; 0 test files; no test runner configured. | M6 |

### 4.2 Acceptance Criteria Evaluation Matrix (All 10 Criteria)

| Category | # | Acceptance Criterion | Measured Status | Baseline Code Evidence | Target Milestone | Verification Gate |
|---|:---:|---|:---:|---|:---:|---|
| **Security & Access Control** | AC-01 | Direct unauthenticated navigation to `/events` or `/scan` is blocked and redirected to login. | 🔴 Non-Compliant | No middleware exists; navigating to `/events` or `/scan` loads directly without auth check. | M3 | `curl -i http://localhost:3000/events` returns HTTP 307 redirect to `/?redirect=%2Fevents`. |
| | AC-02 | Volunteers cannot access `/events/*` admin routes or administrative server actions. | 🔴 Non-Compliant | Volunteer navigation renders admin links; server actions perform no role verification. | M3 | Volunteer session navigating to `/events/ev-1/dashboard` is intercepted and redirected to `/scan`. |
| | AC-03 | Unauthenticated requests to `/api/export`, `/api/checkin`, `/api/teams` return 401 Unauthorized. | 🔴 Non-Compliant | Endpoints return 200 OK with sensitive data when called anonymously. | M3 | `curl -i http://localhost:3000/api/export` returns HTTP 401 with JSON `{ success: false, error: "Authentication required." }`. |
| | AC-04 | Password hashes and session secrets are never stored in plaintext or exposed in API responses. | 🔴 Non-Compliant | Passwords stored as `"admin123"`, `"volunteer123"`; default secret exposed in code. | M2 | Passwords derived with PBKDF2/scrypt; session secrets loaded from `.env`; credentials omitted from user payloads. |
| **Functionality & Verification** | AC-05 | Approved registrations generate single-use HMAC-signed QR passes (`SECQR:`). | 🟡 Partial | SECQR format exists, but non-SECQR bypass is active; approvals lack payment gate. | M5 | Passes require `payment_status === 'VERIFIED'` and format validates as `SECQR:<base64>`. |
| | AC-06 | A second scan of an already checked-in QR pass is rejected atomically and logged as a duplicate violation with exact timestamp. | 🟡 Partial | Duplicate rejection works in local store, but lacks atomic DB transaction and comprehensive violation telemetry. | M5 | Second scan rejected with duplicate alert, previous timestamp, and `CHECK_IN_DUPLICATE_ATTEMPT` audit log. |
| | AC-07 | Tampered QR payloads are rejected with cryptographic signature failure. | 🔴 Non-Compliant | Any non-SECQR payload is accepted as valid; signature comparison vulnerable to timing attack. | M5 | Modified payload byte returns `valid: false, tamperDetected: true` via `crypto.timingSafeEqual`. |
| | AC-08 | Offline CSV export produces complete roster data for venue network failure protocol. | 🟡 Partial | `/api/export` generates CSV, but is unprotected; UI page lacks direct CSV download button. | M5 | Admin registrations page provides instant offline CSV roster download with complete participant records. |
| | AC-09 | Payment verification modal enables admins to review uploaded screenshots and approve/reject registrations. | 🔴 Non-Compliant | Zero payment fields or UI components exist anywhere in the application. | M5 | Modal in Registrations page renders screenshot preview with Approve and Reject actions. |
| **Code Quality & Verification** | AC-10 | `npx.cmd tsc --noEmit` completes with 0 errors; `npm.cmd run lint` completes with 0 errors; `npm.cmd test` passes; `npm.cmd run build` completes. | 🔴 Non-Compliant | `tsc` passes (0 errors); `lint` fails with 101 errors; `test` command missing; `build` passes. | M6 | `npm.cmd run lint` exits 0; `npm.cmd test` passes 5 test suites; `npm.cmd run build` succeeds cleanly. |

---

## 5. Remediation Priority & Actionable Next Steps

To transform the platform into a hardened, production-ready system without introducing regressions, remediation must follow a disciplined, chronological 6-milestone execution sequence:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REMEDIATION EXECUTION ROADMAP                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 1: Complete Documentation Suite & Environment Template (docs/*)   │
│   └─ Establish architectural invariants, threat models, and schemas.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 2: Authentication & Account Lifecycle Hardening                   │
│   └─ Salted PBKDF2/scrypt, signed HMAC sessions, brute-force rate limiting. │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 3: Server-Enforced RBAC & Route/API Protection                    │
│   └─ Edge Middleware, API 401/403 guards, volunteer isolation, PII shielding│
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 4: Database Schema Realignment & Dual-Mode Persistence            │
│   └─ Generalized 8 entities, Supabase RLS, atomic local JSON fallback.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 5: Gate Verification, Payment Review Modal & Offline Roster       │
│   └─ Strict SECQR crypto, atomic check-in, payment review modal, CSV export.│
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 6: Code Quality, 0-Error Linting & Automated Test Suite           │
│   └─ Eliminate 101 ESLint errors, configure Vitest, 5 test suites, clean build│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pre-Flight Quality Gates for Milestone Progression
1. **No Broken Builds:** Every milestone must maintain clean TypeScript compilation (`npx.cmd tsc --noEmit`) and successful production build generation (`npm.cmd run build`).
2. **Minimal Changes:** Avoid unnecessary architectural churn; preserve existing operational UI workflows while swapping underlying security and persistence engines.
3. **Independent Verification:** A Teamwork Preview Auditor will verify all deliverables against empirical test runs and source inspection before any milestone is signed off.
