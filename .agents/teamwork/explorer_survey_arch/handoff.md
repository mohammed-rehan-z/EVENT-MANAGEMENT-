# Handoff Report: Architecture & Gap Analysis (R1 - R6)

**Agent ID**: `explorer_survey_arch`  
**Working Directory**: `d:\Project\Event Management\.agents\teamwork\explorer_survey_arch`  
**Report Date**: 2026-10-14  
**Handoff Type**: Hard (Investigation & Analysis Complete)  
**Detailed Report**: `d:\Project\Event Management\.agents\teamwork\explorer_survey_arch\arch_report.md`  

---

## 1. Observation

### 1.1 Authentication & Session Management
- **File**: `src/lib/services/authService.ts:12-29`  
  *Observation*: Plaintext credentials stored directly in source code:
  ```typescript
  const DEFAULT_USERS: Array<UserAccount & { passwordHash: string }> = [
    { id: "usr-admin-1", email: "admin@eventportal.com", passwordHash: "admin123", ... },
    { id: "usr-volunteer-1", email: "volunteer@eventportal.com", passwordHash: "volunteer123", ... },
  ];
  ```
- **File**: `src/lib/services/authService.ts:44-46`  
  *Observation*: Passwords compared with direct equality:
  ```typescript
  const matched = DEFAULT_USERS.find(
    (u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === cleanPassword
  );
  ```
- **File**: `src/lib/services/authService.ts:58-65` & `76-85`  
  *Observation*: Unsigned, unencrypted raw JSON stored in cookie `event_auth_session`:
  ```typescript
  cookieStore.set(COOKIE_NAME, JSON.stringify(user), { httpOnly: true, ... });
  // and reading:
  return JSON.parse(session.value) as UserAccount;
  ```
- **Observation**: Zero rate-limiting, brute-force tracking, or account lockout in `authActions.ts` or `authService.ts`.

### 1.2 Authorization & RBAC
- **File Search**: `find_by_name` for `*middleware*` in `src/` returned 0 application files. Neither `src/middleware.ts` nor root `middleware.ts` exists.
- **File**: `src/app/(admin)/events/page.tsx:114-124` & `src/app/(admin)/events/[eventId]/layout.tsx:25-29`  
  *Observation*: Admin pages load `getSessionUserAction()` but never redirect unauthenticated callers.
- **File**: `src/app/(volunteer)/layout.tsx:14-21`  
  *Observation*: Volunteer layout links directly to the Admin Portal:
  ```tsx
  <Link href="/events/ev-1/dashboard" className="text-slate-500 hover:text-slate-900 ...">
    <ArrowLeft className="w-3.5 h-3.5" />
    <span className="hidden sm:inline">Admin Portal</span>
  </Link>
  ```
- **File**: `src/app/api/export/route.ts:4-29`  
  *Observation*: Endpoint `GET /api/export` executes without checking any authorization or session token, dumping all attendee full names, emails, and phone numbers.
- **File**: `src/app/api/checkin/route.ts:4-69`, `src/app/api/teams/route.ts:4-69`, `src/app/api/import/route.ts:4-37`  
  *Observation*: None of these endpoints verify caller identity or role.
- **File**: `src/app/actions/eventActions.ts:46-116` & `src/app/actions/qrActions.ts:40-450`  
  *Observation*: All 23 Server Actions execute without session verification.

### 1.3 Database Schema & Domain Model
- **File**: `schema.sql:1-86` & `src/lib/dataStore.ts:24-49`  
  *Observation*: Tables defined are `users`, `events`, `event_assignments`, `teams`, `participants`, `check_ins`, `audit_logs`.  
  There is NO `event_tracks` table (only optional string `category` on `Team`).  
  There is NO `registrations` table.  
  There is NO `groups` table (titled `teams`).  
  `participants` references `team_id` rather than `group_id` / `registration_id`.  
  `check_ins` references `team_id` only, without individual participant check-in support.
- **File**: `src/lib/supabase.ts:4-7`  
  *Observation*: Supabase client initialized with placeholder credentials.
- **File**: `src/lib/dataStore.ts:398-443`  
  *Observation*: Local JSON `data/events-data.json` is the active persistence store; background sync to Supabase is non-atomic and catches errors silently.

### 1.4 QR Cryptography & Payment Workflow
- **File**: `src/lib/services/cryptoService.ts:17-40`  
  *Observation*: `createSecureQRPayload` generates `SECQR:<base64-json>`.
- **File**: `src/lib/services/cryptoService.ts:58-65`  
  *Observation*: Critical bypass in `verifySecureQRPayload`:
  ```typescript
  if (!clean.startsWith("SECQR:")) {
    return { valid: true, isSignedPayload: false, token: clean };
  }
  ```
  Any raw string not starting with `SECQR:` is treated as valid.
- **File**: `src/lib/services/cryptoService.ts:83`  
  *Observation*: Signature verified using variable-time `payload.sig !== expectedSig`.
- **Grep Search**: Case-insensitive search for `payment` across `src/` returned 0 matches. No payment screenshot review modal, no `payment_screenshot_url`, and no `payment_status` exists.
- **File**: `src/app/(admin)/events/[eventId]/registrations/page.tsx:459-485`  
  *Observation*: `handleExportRoster` exports only client-side JSON (`event_roster_${eventId}.json`), not CSV.

### 1.5 Code Quality, Lint & Build
- **Command**: `npx.cmd tsc --noEmit`  
  *Result*: Exited with code 0 (0 compilation errors).
- **Command**: `npm.cmd run lint`  
  *Result*: Exited with code 1. Output: `✖ 250 problems (101 errors, 149 warnings)`. All 101 errors are `@typescript-eslint/no-explicit-any`.
- **File**: `package.json:5-10`  
  *Observation*: Scripts contain only `"dev"`, `"build"`, `"start"`, `"lint"`. No `"test"` script. No test runner installed. Zero test files exist in the project.

---

## 2. Logic Chain

1. **Authentication Insecurity**: From Observation 1.1, passwords are stored in plaintext and evaluated with `===`. Session cookies store unhashed, unsigned JSON strings. Because any client can write to their own HTTP cookies or forge requests, anyone can spoof the identity of an Administrator. Therefore, cryptographic password hashing (PBKDF2/scrypt with salt) and HMAC-signed session tokens with expiration and rate limiting are required (R2).
2. **Access Control Absence**: From Observation 1.2, neither Next.js middleware nor server-side authorization guards exist. Unauthenticated requests to `/events`, `/scan`, and API routes (`/api/export`, `/api/checkin`) succeed without restriction. Therefore, a Next.js `middleware.ts` and API/server action authorization guards must be implemented to enforce role boundaries (`ADMIN` vs `VOLUNTEER`) and protect participant PII (R3).
3. **Domain & Entity Misalignment**: From Observation 1.3, the system models all registrations as gaming-specific `teams`, omitting `event_tracks`, `registrations`, and `groups`. This violates user rules (GEMINI.md: "Use generalized terms") and requirement R4. Therefore, `schema.sql` and `dataStore.ts` must be aligned with generalized entities (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`).
4. **Cryptographic & Verification Loopholes**: From Observation 1.4, `verifySecureQRPayload` contains a bypass allowing raw, unsigned tokens, and signature checks are vulnerable to timing attacks. Furthermore, payment verification is completely absent, and client export only supports JSON. Therefore, strict `SECQR:` cryptographic enforcement, a payment proof review modal, and offline CSV/printable roster exports must be implemented (R5).
5. **Quality & Test Deficits**: From Observation 1.5, ESLint fails with 101 `@typescript-eslint/no-explicit-any` errors, and no test suite exists. Therefore, all 101 any-types must be replaced with strict types, a test runner (`vitest`) must be installed, and comprehensive unit/integration tests must be added (R6).

---

## 3. Caveats

- **Supabase Credentials**: Supabase is configured with placeholder values (`https://placeholder.supabase.co`). All real testing operates against the local JSON store (`data/events-data.json`). Dual-mode persistence logic must ensure seamless local operation when remote Supabase is unconfigured.
- **App Router Login Route**: Currently, the login interface is rendered at `/` (`src/app/page.tsx`). Middleware redirection should redirect unauthenticated requests to `/` (or maintain a `/login` alias redirecting to `/`).
- **Data Migration**: Existing seeded data in `data/events-data.json` contains `teams`. Schema alignment must either adaptively read existing records or provide a migration adapter so existing data does not break.

---

## 4. Conclusion

The application architecture has solid UI primitives and end-to-end features, but requires systematic hardening across six core pillars:
1. **R1**: Create documentation under `docs/` (`PROJECT_AUDIT.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SECURITY.md`, `IMPLEMENTATION_PLAN.md`) and `.env.example`.
2. **R2**: Implement salted PBKDF2/scrypt password hashing, signed HMAC session tokens with expiration, and brute-force throttling in `authService.ts`.
3. **R3**: Implement `src/middleware.ts` and server action/API authorization guards returning 401 for anonymous access and 403 for role violations.
4. **R4**: Align schema and dataStore entities to generalized event specifications (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`).
5. **R5**: Implement the Payment Proof Review Modal, fix `SECQR:` verification bypasses and timing vulnerabilities, and wire offline CSV/printable roster exports.
6. **R6**: Eliminate all 101 ESLint errors, configure `vitest`, and create automated test suites validating security, auth, cryptography, and check-in workflows.

---

## 5. Verification Method

To independently verify the observations and analysis:
1. **Lint Check**:
   ```powershell
   npm.cmd run lint
   ```
   *Expected*: Fails with 101 `@typescript-eslint/no-explicit-any` errors.
2. **Typecheck**:
   ```powershell
   npx.cmd tsc --noEmit
   ```
   *Expected*: Passes with 0 errors.
3. **Inspect Authentication & Secrets**:
   View `src/lib/services/authService.ts` lines 12-29 (plaintext passwords) and lines 58-65 (unsigned `JSON.stringify(user)` cookie).
4. **Inspect Route Protection & API Exposure**:
   Inspect `src/middleware.ts` (file not found).
   View `src/app/api/export/route.ts` lines 4-29 (unprotected PII export).
   View `src/app/api/checkin/route.ts` lines 4-69 (unprotected check-in).
5. **Inspect QR Verification Bypass**:
   View `src/lib/services/cryptoService.ts` lines 58-65 (unsigned non-SECQR bypass).
6. **Inspect Payment Verification**:
   Grep `src/` for `payment` (0 matches).
