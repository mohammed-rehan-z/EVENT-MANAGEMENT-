# Comprehensive Architecture & Gap Analysis Report
**Universal Event Registration & QR Check-in System**

Date: October 14, 2026  
Agent: `explorer_survey_arch`  
Working Directory: `d:\Project\Event Management`  
Target Requirements: R1 to R6  

---

## Executive Summary

An exhaustive code audit and architectural survey of the Event Management System was conducted across all Next.js App Router routes, API endpoints, Server Actions, services, persistence stores, schemas, and configurations.

While the application possesses a rich user interface with event management, QR generation, email dispatch via Resend, on-spot OTP fallback, and security audit telemetry, critical vulnerabilities and architectural deviations prevent it from meeting production readiness:
1. **Critical Authentication Vulnerabilities**: Credentials are hardcoded in plaintext (`admin123`, `volunteer123`), session cookies are completely unsigned raw JSON (`JSON.stringify(user)`), passwords are checked via direct string equality without cryptographic hashing, and no brute-force rate limiting exists.
2. **Missing Server-Enforced RBAC & Middleware**: No Next.js `middleware.ts` exists. All admin routes (`/events/*`), volunteer routes (`/scan/*`), server actions, and REST API endpoints (`/api/export`, `/api/checkin`, `/api/teams`, `/api/import`) are completely accessible to anonymous users, leaking participant PII and permitting unauthorized event mutations.
3. **Database Schema & Domain Misalignment**: The current schema and store conflate `registrations`, `groups`, and `event_tracks` into gaming-specific `teams`, violating generalized event domain requirements.
4. **Missing Payment Verification Workflow**: Payment screenshot review, pending approval gates, and screenshot review modals are entirely missing from the codebase.
5. **Cryptographic Loopholes**: QR payload verification permits unverified raw tokens to bypass HMAC signature checks, uses variable-time string comparisons vulnerable to timing attacks, and relies on hardcoded fallback secrets.
6. **Code Quality & Testing Gaps**: ESLint reports exactly 101 errors (predominantly `@typescript-eslint/no-explicit-any`) across 16 files, no test framework is installed, and zero automated tests exist.

---

## 1. Directory Layout & App Router Route Mapping

### 1.1 Directory Structure
```
d:\Project\Event Management\
├── .agents/                    # Multi-agent orchestrator & skills
├── data/
│   └── events-data.json        # Local JSON persistent store (offline fallback)
├── public/                     # Static assets
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   │   └── events/
│   │   │       ├── page.tsx                           # /events (Event selection hub)
│   │   │       └── [eventId]/
│   │   │           ├── layout.tsx                     # Admin sidebar & header layout
│   │   │           ├── dashboard/page.tsx             # /events/[eventId]/dashboard
│   │   │           ├── registrations/page.tsx         # /events/[eventId]/registrations
│   │   │           ├── imports/page.tsx               # /events/[eventId]/imports
│   │   │           └── audit/page.tsx                 # /events/[eventId]/audit
│   │   ├── (volunteer)/
│   │   │   ├── layout.tsx                             # Volunteer header & bottom nav
│   │   │   └── scan/
│   │   │       ├── page.tsx                           # /scan (Gate camera scanner & OTP)
│   │   │       └── teams/page.tsx                     # /scan/teams (Authority roster lookup)
│   │   ├── actions/
│   │   │   ├── authActions.ts                         # loginAction, logoutAction, getSessionUserAction
│   │   │   ├── eventActions.ts                        # Event CRUD & stats actions
│   │   │   ├── importData.ts                          # Excel/CSV import parser & team creation
│   │   │   └── qrActions.ts                           # Check-in, approval, OTP, bulk QR actions
│   │   ├── api/
│   │   │   ├── checkin/route.ts                       # POST /api/checkin
│   │   │   ├── export/route.ts                        # GET /api/export
│   │   │   ├── health/route.ts                        # GET /api/health
│   │   │   ├── import/route.ts                        # POST /api/import
│   │   │   └── teams/
│   │   │       ├── route.ts                           # GET, POST /api/teams
│   │   │       └── [teamId]/
│   │   │           ├── route.ts                       # GET, PATCH /api/teams/[teamId]
│   │   │           └── email/route.ts                 # POST /api/teams/[teamId]/email
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx                                 # Root layout
│   │   └── page.tsx                                   # / (Login page)
│   ├── components/
│   │   ├── SignOutButton.tsx
│   │   └── ui/                                        # Shadcn UI primitives
│   └── lib/
│       ├── dataStore.ts                               # Dual-mode local JSON / Supabase store
│       ├── supabase.ts                                # Supabase client instance
│       ├── utils.ts                                   # Tailwind merge utilities
│       └── services/
│           ├── authService.ts                         # In-memory authentication service
│           ├── checkInService.ts                      # Gate check-in orchestration
│           ├── cryptoService.ts                       # HMAC signing & SECQR payload verification
│           ├── emailService.ts                        # Resend email tickets & dispatch logs
│           ├── qrService.ts                           # QRCode data URL and buffer generation
│           └── teamService.ts                         # Team queries & mutations
├── commands.md
├── components.json
├── eslint.config.mjs
├── memory.md
├── package.json
├── PRD.md
├── README.md
├── schema.sql
├── TSD.md
└── tsconfig.json
```

### 1.2 Route Inventory & Security Status

| Route / Path | Type | Render | Current Security Guard | Vulnerability / Issue |
|---|---|---|---|---|
| `/` | Page (`src/app/page.tsx`) | Client | Public Login | Autofills demo plaintext credentials |
| `/events` | Page (`src/app/(admin)/events/page.tsx`) | Client | None | Anonymous access permitted; loads user but never redirects if unauthenticated |
| `/events/[eventId]/dashboard` | Page | Client | None | Direct anonymous access |
| `/events/[eventId]/registrations` | Page | Client | None | Direct anonymous access; exports JSON instead of CSV; no payment modal |
| `/events/[eventId]/imports` | Page | Client | None | Direct anonymous access; auto-approves all imports without payment check |
| `/events/[eventId]/audit` | Page | Client | None | Direct anonymous access to security audit log |
| `/scan` | Page (`src/app/(volunteer)/scan/page.tsx`) | Client | None | Direct anonymous access to scanner |
| `/scan/teams` | Page (`src/app/(volunteer)/scan/teams/page.tsx`) | Client | None | Direct anonymous access to team roster |
| `/api/health` | REST API | Server | Public | Diagnostic endpoint |
| `/api/export` | REST API | Server | **None (Critical)** | Anonymous access exports all participant PII (names, emails, phones, courses) |
| `/api/checkin` | REST API | Server | **None (Critical)** | Anonymous access allows check-in mutations |
| `/api/teams` | REST API | Server | **None (Critical)** | Anonymous query or creation of teams |
| `/api/teams/[teamId]` | REST API | Server | **None** | Anonymous fetch and patch |
| `/api/teams/[teamId]/email` | REST API | Server | **None** | Anonymous trigger of emails |
| `/api/import` | REST API | Server | **None (Critical)** | Anonymous bulk ingestion of participant records |

---

## 2. Authentication & Session Management Investigation (R2)

### 2.1 Password Hashing & Storage
- **Observed Location**: `src/lib/services/authService.ts:12-29`
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
```
- **Password Comparison**: `src/lib/services/authService.ts:44-46`
```typescript
const matched = DEFAULT_USERS.find(
  (u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === cleanPassword
);
```
- **Vulnerabilities**:
  1. Passwords are saved directly in plaintext inside source code.
  2. No password hashing algorithm (PBKDF2/scrypt/argon2/bcrypt) is utilized.
  3. No salt is generated or applied.
  4. Comparison is vulnerable to timing attacks.

### 2.2 Cookie Session Management
- **Observed Location**: `src/lib/services/authService.ts:58-65`
```typescript
const cookieStore = await cookies();
cookieStore.set(COOKIE_NAME, JSON.stringify(user), {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
});
```
- **Session Retrieval**: `src/lib/services/authService.ts:76-85`
```typescript
static async getCurrentUser(): Promise<UserAccount | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(COOKIE_NAME);
    if (!session || !session.value) return null;
    return JSON.parse(session.value) as UserAccount;
  } catch {
    return null;
  }
}
```
- **Vulnerabilities**:
  1. The cookie payload is raw, unsigned JSON: `{"id":"usr-admin-1","email":"admin@eventportal.com","fullName":"Alex Mercer","role":"ADMIN","avatar":"AM"}`.
  2. Any client or attacker can manipulate this cookie to elevate privileges from `VOLUNTEER` to `ADMIN` or impersonate arbitrary users.
  3. No cryptographic signature (HMAC-SHA256) protects against tampering.
  4. No expiration timestamp or session issue time is encoded within the payload.
  5. No session revocation or session table is checked.

### 2.3 Brute-Force Throttling
- **Observed Status**: Completely absent.
- `loginAction` (`src/app/actions/authActions.ts:5-14`) and `AuthService.authenticate` permit unlimited authentication attempts without rate-limiting, IP-based backoff, or temporary account lockout.

---

## 3. Authorization & RBAC Investigation (R3)

### 3.1 Next.js Middleware
- **Observed Status**: File `src/middleware.ts` (and root `middleware.ts`) does **NOT** exist.
- Because there is no middleware:
  - Unauthenticated requests to `/events`, `/events/[eventId]/*`, `/scan`, `/scan/teams` pass through to the page components.
  - Role verification (`ADMIN` vs `VOLUNTEER`) is never performed at the edge/routing layer.
  - Volunteers can type `/events/ev-1/dashboard` and access admin controls.
  - In `src/app/(volunteer)/layout.tsx:14-21`, the volunteer header explicitly provides a button linking directly to the Admin Portal:
  ```tsx
  <Link href="/events/ev-1/dashboard" className="text-slate-500 hover:text-slate-900 ...">
    <ArrowLeft className="w-3.5 h-3.5" />
    <span className="hidden sm:inline">Admin Portal</span>
  </Link>
  ```

### 3.2 Server Actions RBAC
- None of the 23 server actions check the caller's session or role:
  - `eventActions.ts`: `createEventAction`, `updateEventAction`, `deleteEventAction` can be executed by anyone.
  - `qrActions.ts`: `approveTeamAndGenerateQR`, `bulkDeleteTeamsAction`, `bulkApproveTeamsAction`, `resetTeamCheckInAction` can be executed by anyone.
  - `importData.ts`: `processRegistrationImport` can be executed by anyone.

### 3.3 REST API Endpoints RBAC
- All API routes in `src/app/api/` execute handler logic without verifying session cookies or bearer tokens:
  - `GET /api/export`: Exposes complete attendee rosters including PII (`Full_Name`, `Email`, `Mobile_Number`, `Course`).
  - `POST /api/checkin`: Allows anonymous clients to check in attendees.
  - `GET, POST /api/teams`: Anonymous querying and creation of teams.

---

## 4. Database Schema Realignment & Resilience (R4)

### 4.1 Comparison: Current Codebase vs. Generalized Domain Specifications

| Specification Entity (PRD §9, TSD §2, R4) | Current Codebase (`schema.sql`, `dataStore.ts`) | Status / Discrepancy |
|---|---|---|
| `events` (id, name, dates, capacity, venue) | `events` (id, name, description, venue, date, end_date, thumbnail_url, is_active) | Exists; mostly aligned |
| `event_tracks` (id, event_id, name, max_group_size) | Missing. Code only has optional string `category?: string` on `Team` | **Missing Table / Entity** |
| `registrations` (id, type: INDIVIDUAL/GROUP, source: ADVANCE/ON_SPOT, status: PENDING_REVIEW/APPROVED/REJECTED, email, phone, payment_screenshot_url, qr_token) | Missing. Conflated into monolithic `Team` model | **Missing Table / Entity** |
| `groups` (id, registration_id, track_id, name) | Titled `teams` throughout `schema.sql` and `dataStore.ts` | **Misaligned Nomenclature & Relational Keys** |
| `participants` (id, group_id, registration_id, full_name, identifier, email, mobile_number, course, year_of_study) | `participants` (id, team_id, event_id, full_name, email, mobile_number, course, year_of_study, semester, is_leader) | Relies on `team_id`; lacks `group_id` / `registration_id` / `identifier` |
| `check_ins` (id, participant_id, volunteer_id, timestamp) | `check_ins` (id, event_id, team_id, volunteer_id, timestamp) | Keys on `team_id` only; cannot record attendance per participant member |
| `audit_logs` (id, event_id, user_id, action, severity, details, created_at) | `audit_logs` (id, event_id, user_id/actor_id, action, severity, details, created_at) | Well implemented in `dataStore.ts` |

### 4.2 Dual-Mode Persistence Architecture
- **Supabase Connectivity**:
  - `src/lib/supabase.ts` uses fallback placeholder URL:
  ```typescript
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  ```
  - `isSupabaseLive()` (`src/lib/dataStore.ts:398-401`):
  ```typescript
  function isSupabaseLive(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return Boolean(url && !url.includes("placeholder"));
  }
  ```
- **Local JSON Store**:
  - `data/events-data.json` stores `{ events: [], teams: [], audit_logs: [] }`.
  - Concurrency & Atomicity: File writes (`saveLocalData`) use synchronous `fs.writeFileSync`. However, there is no file locking or in-memory concurrency mutex. Concurrent requests could lead to race conditions.
  - Background Sync Vulnerability: When Supabase is configured, check-ins update the local store first and then attempt a fire-and-forget background insert into Supabase:
  ```typescript
  // checkInService.ts:70-85
  if (url && !url.includes("placeholder") && result.success && result.team) {
    try {
      await supabase.from("check_ins").insert([...]);
    } catch (sbErr) {
      console.warn("Supabase check-in background sync notice:", sbErr);
    }
  }
  ```
  If the Supabase insert fails, the state is inconsistent between the two stores.

---

## 5. QR Check-In, Cryptography & Payment Workflows (R5)

### 5.1 QR Payload Generation & Cryptography
- **Observed Location**: `src/lib/services/cryptoService.ts`
- **SECQR Payload Structure**:
  ```typescript
  export interface SignedQRPayload {
    v: number;       // version (1)
    tid: string;     // team_id / registration_id
    eid: string;     // event_id
    tok: string;     // unique random token
    exp: number;     // unix timestamp seconds
    sig: string;     // hmac-sha256 signature
  }
  ```
- **Flaws Identified in `cryptoService.ts`**:
  1. **Hardcoded Fallback Secret** (line 3):
     `const QR_SECRET_KEY = process.env.QR_HMAC_SECRET || "event-security-hmac-salt-production-2026-secret";`
  2. **Truncated Signature** (line 19):
     `return crypto.createHmac("sha256", QR_SECRET_KEY).update(data).digest("hex").slice(0, 32);`
  3. **Timing Attack in Signature Check** (line 83):
     `if (payload.sig !== expectedSig)` uses standard JavaScript string comparison rather than `crypto.timingSafeEqual(Buffer.from(payload.sig), Buffer.from(expectedSig))`.
  4. **Critical Bypass for Unsigned Payloads** (lines 58-65):
     ```typescript
     // If not prefixed with SECQR:, it is a raw UUID or legacy token
     if (!clean.startsWith("SECQR:")) {
       return {
         valid: true,
         isSignedPayload: false,
         token: clean,
       };
     }
     ```
     This bypass allows any forged, non-SECQR input to be marked as `valid: true`, completely undermining cryptographic verification!
  5. **Inconsistent Supabase Sync** (`qrActions.ts:48`):
     When updating Supabase on approval, `qrActions.ts` sets `qrToken = 'qr-${crypto.randomUUID()}'` rather than the HMAC-signed `SECQR:` string.

### 5.2 Duplicate Check-In Prevention & Atomicity
- **Observed Mechanism**: `src/lib/dataStore.ts:736-769`
  - Validates `team.check_in_status === "CHECKED_IN"`.
  - Increments `scan_count`.
  - Logs `CHECK_IN_DUPLICATE_ATTEMPT` with previous check-in timestamp and volunteer ID.
  - Returns `SINGLE-USE VIOLATION: Team '...' was already admitted on ... by ...`.
- **Gaps**:
  - The check-in occurs at the team level, not supporting individual participant check-ins or group leader checking in specific present members.
  - Database-level atomic transaction (e.g. Postgres conditional update `UPDATE check_ins ...` or RPC function) is not utilized when Supabase is active.

### 5.3 Payment Verification Workflow
- **Observed Status**: **COMPLETELY MISSING** from current implementation.
  - There is no `payment_screenshot_url` or `payment_status` on any data entity.
  - In `src/app/(admin)/events/[eventId]/registrations/page.tsx`, there is no modal or button to inspect payment screenshots or approve/reject pending registrations.
  - In `src/app/actions/importData.ts`, all imported records are automatically set to `status: "APPROVED"`, skipping the payment review gate entirely.

### 5.4 Offline Roster Export (CSV & Printable)
- **Observed Status**:
  - `GET /api/export?format=csv` generates a valid CSV string, but is completely unprotected.
  - In `src/app/(admin)/events/[eventId]/registrations/page.tsx:459-485`, `handleExportRoster` creates a client-side JSON download (`event_roster_${eventId}.json`) and does NOT export CSV.
  - There is no printable roster layout formatted for physical paper verification.

---

## 6. Code Quality, Zero-Error Linting & Test Suite (R6)

### 6.1 ESLint Audit
Running `npm.cmd run lint` produces **250 problems (101 errors, 149 warnings)**:
- **101 Errors**:
  - All 101 errors are `@typescript-eslint/no-explicit-any` across:
    - `src/app/actions/authActions.ts` (1 error)
    - `src/app/actions/eventActions.ts` (5 errors)
    - `src/app/actions/importData.ts` (3 errors)
    - `src/app/actions/qrActions.ts` (19 errors)
    - `src/app/api/checkin/route.ts` (1 error)
    - `src/app/api/export/route.ts` (1 error)
    - `src/app/api/health/route.ts` (1 error)
    - `src/app/api/import/route.ts` (1 error)
    - `src/app/api/teams/[teamId]/email/route.ts` (1 error)
    - `src/app/api/teams/[teamId]/route.ts` (2 errors)
    - `src/app/api/teams/route.ts` (4 errors)
    - `src/app/page.tsx` (1 error)
    - `src/lib/dataStore.ts` (2 errors)
    - `src/lib/services/cryptoService.ts` (1 error)
    - `src/lib/services/emailService.ts` (5 errors)
    - `src/lib/services/qrService.ts` (2 errors)
    - `src/app/(admin)/events/[eventId]/audit/page.tsx`
    - `src/app/(admin)/events/[eventId]/dashboard/page.tsx`
    - `src/app/(admin)/events/[eventId]/imports/page.tsx`
    - `src/app/(admin)/events/[eventId]/registrations/page.tsx`
    - `src/app/(volunteer)/scan/page.tsx`
    - `src/app/(volunteer)/scan/teams/page.tsx`
- **149 Warnings**:
  - Unused variables: `UserCheck`, `CheckCircle2`, `passwordHash`, `e`.
  - Next.js `<img>` element warnings (should use `<Image />` or standard styling).
  - Unescaped entity quotes in JSX.

### 6.2 TypeScript Compilation
- Running `npx.cmd tsc --noEmit` exits with **code 0 (0 errors)**.

### 6.3 Automated Test Suite
- In `package.json`, there is no `test` script.
- Neither `jest`, `vitest`, nor `@testing-library/react` is installed.
- Zero unit or integration test files exist in the project.

---

## 7. Actionable Refactoring & Hardening Roadmap (R1 - R6)

### R1. Formal Documentation & Environment Configuration
1. Create `docs/PROJECT_AUDIT.md` (comprehensive audit of all modules, vulnerabilities, and resolution status).
2. Create `docs/ARCHITECTURE.md` (Next.js App Router, dual-mode store, security boundaries, and data flow diagrams).
3. Create `docs/DATABASE_SCHEMA.md` (PostgreSQL Supabase schema + local JSON fallback schema for generalized events).
4. Create `docs/SECURITY.md` (threat model, PBKDF2/scrypt password hashing, signed sessions, HMAC SECQR specifications).
5. Create `docs/IMPLEMENTATION_PLAN.md` (step-by-step phased execution guide).
6. Create `.env.example` documenting all configuration keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `QR_HMAC_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`).

### R2. Authentication & Session Hardening
1. In `src/lib/services/authService.ts`:
   - Replace plaintext passwords with salted PBKDF2 or scrypt hashing (`crypto.scryptSync(password, salt, 64)`).
   - Sign session cookie with HMAC-SHA256 (`signature = hmac(sessionPayload, SESSION_SECRET)`).
   - Encode `{ userId, email, role, fullName, issuedAt, expiresAt }` into session token.
   - Implement brute-force rate-limiting: track failed login attempts by IP / email with 5-attempt limit and 15-minute lockout.
2. In `src/app/actions/authActions.ts`:
   - Enforce typed inputs and return types; eliminate `any`.
3. In `src/app/page.tsx`:
   - Remove hardcoded demo password references from the UI or display them as secured demo accounts with hashed backends.

### R3. Server-Enforced RBAC & Route/API Protection
1. Create `src/middleware.ts`:
   - Intercept `/events/:path*`, `/scan/:path*`, and `/api/:path*`.
   - Verify signed session token. If missing or invalid, redirect to `/` with `returnUrl`.
   - If user has role `VOLUNTEER` attempting to access `/events/*`, redirect to `/scan` or return 403 Forbidden.
   - Ensure static assets, `_next`, `favicon.ico`, and `/api/health` remain accessible.
2. Implement server action guard helper `requireAuth(role?: "ADMIN" | "VOLUNTEER")`:
   - Guard every server action in `eventActions.ts`, `qrActions.ts`, `importData.ts`.
3. Protect REST API routes:
   - In `/api/export`, `/api/checkin`, `/api/teams`, `/api/import`: check session or API authorization; return `401 Unauthorized` if unauthenticated.

### R4. Database Schema Realignment & Dual-Mode Resilience
1. In `schema.sql`:
   - Define generalized tables: `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`.
   - Add RLS policies for `ADMIN`, `VOLUNTEER`, and public registration.
2. In `src/lib/dataStore.ts`:
   - Align TypeScript types (`EventData`, `EventTrack`, `Registration`, `Group`, `Participant`, `CheckIn`, `AuditLog`).
   - Add helper adapter functions to maintain compatibility with existing team views while storing generalized entities.
   - Implement concurrency-safe write operations.

### R5. Payment Proof Review, Atomic Check-In & Gate Verification
1. Add payment proof attributes (`payment_screenshot_url`, `payment_status`: `'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'`) to registrations.
2. Build Payment Review Modal in `src/app/(admin)/events/[eventId]/registrations/page.tsx`:
   - View uploaded payment screenshot.
   - Approve (triggers SECQR generation) or Reject with audit log.
3. In `src/lib/services/cryptoService.ts`:
   - Remove unsigned non-SECQR bypass: reject any scan payload that is not valid `SECQR:`.
   - Use `crypto.timingSafeEqual` for signature comparison.
   - Enforce environment secret with strong validation.
4. In `src/app/(admin)/events/[eventId]/registrations/page.tsx`:
   - Connect CSV export button to generate and download `roster_${eventId}.csv`.
   - Add printable roster view for venue internet drop protocol.

### R6. Code Quality, Zero-Error Linting & Automated Test Suite
1. Eliminate all 101 ESLint errors:
   - Replace all `catch (err: any)` with `catch (err: unknown)` and proper error extraction (`err instanceof Error ? err.message : String(err)`).
   - Replace all `any[]` and `Record<string, any>` with strict interfaces or `unknown`.
   - Clean up unused variables and JSX entity warnings.
2. Configure automated testing:
   - Install `vitest` (or node test runner) as devDependency.
   - Add `"test": "vitest run"` script to `package.json`.
   - Create test suite under `test/`:
     - `auth.test.ts`: Password hashing, brute force throttling, signed session verification.
     - `crypto.test.ts`: SECQR generation, HMAC signature validation, tamper rejection, expiration rejection.
     - `checkin.test.ts`: Atomic single-use check-in, duplicate scan rejection with timestamp, audit logging.
     - `rbac.test.ts`: Route protection, 401 unauthorized API guards.
3. Verify:
   - `npx.cmd tsc --noEmit` -> 0 errors
   - `npm.cmd run lint` -> 0 errors
   - `npm.cmd test` -> all tests pass
   - `npm.cmd run build` -> completes successfully
