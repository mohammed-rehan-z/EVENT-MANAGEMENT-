# Authoritative Specification Report: Universal Event Registration & QR Check-in System

**Document Version:** 1.0  
**Timestamp:** 2026-10-14T16:00:00Z  
**Author:** Specification Miner (`spec_miner_survey`)  
**Workspace:** `d:\Project\Event Management`  

---

## 1. Executive Summary & Authoritative Specification Hierarchy

This specification defines the complete functional, cryptographic, structural, and operational requirements for the **Universal Event Registration & QR Check-in System**. The specification is synthesized directly from five authoritative sources:
1. `ORIGINAL_REQUEST.md` (Authoritative User Requirements & Acceptance Criteria)
2. `PRD.md` (Product Requirements Document v1.2)
3. `TSD.md` (Technical Specification Document v1.0)
4. `AGENTS.md` (Next.js App Router Architecture & Conventions)
5. `gemini.md` / `GEMINI.md` (Agent Technology Rules & Domain Guardrails)
6. Runtime Codebase Audit (`src/`, `schema.sql`, `package.json`, `data/events-data.json`)

### Hierarchy of Authority
1. **User Acceptance Criteria (`ORIGINAL_REQUEST.md`)**: Supreme precedence. Zero-error standards, cryptographic invariants, server-enforced RBAC, and payment verification workflows take priority.
2. **Technical Architecture (`TSD.md`) & Agent Rules (`gemini.md`)**: Definitive technical implementation rules: Next.js App Router, Supabase PostgreSQL with local JSON offline fallback, generalized entity terminology (`event_tracks`, `groups`, `participants`), and server action security boundaries.
3. **Product Requirements (`PRD.md`)**: Operational workflows, volunteer gate operations, spreadsheet reconciliation, bulk handling for 200+ attendees, and offline disaster recovery procedures.

---

## 2. Core Entities & Database Schema Specifications

The system operates under a **Dual-Mode Persistence Architecture**:
- **Primary Live Mode**: Supabase PostgreSQL with Row Level Security (RLS) policies.
- **Offline / Local Fallback Mode**: Local JSON persistent data store (`data/events-data.json`) providing zero-downtime operation when venue internet connectivity is compromised.

All entities use **generalized nomenclature** rather than domain-specific (e.g. gaming/e-sports) naming.

### 2.1 Entity Schema Definitions

#### 1. `events`
*Defines a high-level event gathering.*
- `id` (UUID / String, Primary Key): Unique identifier (e.g., `ev-1` or UUIDv4).
- `name` (Text, NOT NULL): Name of the event (e.g., "Apex Cyber League 2026", "Global Web3 Summit").
- `description` (Text): Short summary.
- `overview` (Text, Optional): Extended markdown/rich text background.
- `venue` (Text, NOT NULL): Physical location or arena name.
- `date` (Timestamp with Time Zone, NOT NULL): Start date/time.
- `end_date` (Timestamp with Time Zone, Optional): End date/time.
- `thumbnail_url` (Text, Optional): Event banner/thumbnail URL or base64 data URI.
- `capacity` (Integer, Optional): Total participant cap.
- `is_active` (Boolean, DEFAULT TRUE): Active state flag.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).

#### 2. `event_tracks`
*Categorizes sub-events, divisions, or tournament tracks within an event (replaces legacy `game_categories`).*
- `id` (UUID / String, Primary Key): Unique track identifier.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `name` (Text, NOT NULL): Name of track (e.g., "Hackathon - Web3", "Valorant Championship", "Keynote Session").
- `max_group_size` (Integer, NOT NULL, DEFAULT 1): Maximum group members allowed (1 for individual, 4 for hackathon, 5 for gaming).
- `min_group_size` (Integer, DEFAULT 1): Minimum team size.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).

#### 3. `registrations`
*The primary entry entity tracking participant or group application lifecycle and payment.*
- `id` (UUID / String, Primary Key): Unique registration reference code.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `track_id` (UUID / String, Foreign Key -> `event_tracks.id` ON DELETE SET NULL).
- `type` (Enum: `'INDIVIDUAL'`, `'GROUP'`).
- `source` (Enum: `'ADVANCE'`, `'ON_SPOT'`).
- `status` (Enum: `'PENDING_REVIEW'`, `'APPROVED'`, `'REJECTED'`).
- `email` (Text, NOT NULL): Contact/leader email address.
- `phone` (Text, Optional): Contact phone/WhatsApp number.
- `payment_screenshot_url` (Text, Nullable): URL/path to uploaded payment proof screenshot in Supabase Storage or local asset path.
- `payment_status` (Enum: `'PENDING'`, `'VERIFIED'`, `'REJECTED'`, DEFAULT `'PENDING'`).
- `payment_reviewed_by` (UUID / String, Nullable, Foreign Key -> `users.id`).
- `payment_reviewed_at` (Timestamp with Time Zone, Nullable).
- `payment_rejection_reason` (Text, Nullable).
- `qr_token` (Text, Unique, Nullable): Secure cryptographic token issued upon `'APPROVED'` status.
- `qr_expires_at` (Timestamp with Time Zone, Nullable): Expiration timestamp for the single-use pass.
- `qr_email_sent` (Boolean, DEFAULT FALSE): Dispatch tracking status.
- `qr_email_sent_at` (Timestamp with Time Zone, Nullable).
- `check_in_status` (Enum: `'NOT_CHECKED_IN'`, `'CHECKED_IN'`, DEFAULT `'NOT_CHECKED_IN'`).
- `checked_in_at` (Timestamp with Time Zone, Nullable).
- `checked_in_by` (UUID / String, Nullable, Foreign Key -> `users.id`).
- `scan_count` (Integer, DEFAULT 0): Total scan attempts recorded.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).

#### 4. `groups`
*Represents collective cohorts, rosters, or teams (replaces legacy `teams`). Nullable or 1-to-1 for individual registrations.*
- `id` (UUID / String, Primary Key): Unique group identifier.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `registration_id` (UUID / String, Foreign Key -> `registrations.id` ON DELETE CASCADE).
- `track_id` (UUID / String, Foreign Key -> `event_tracks.id` ON DELETE RESTRICT).
- `name` (Text, NOT NULL): Name of the group/team.
- `normalized_name` (Text, NOT NULL): Stripped, lowercase name for duplicate collision prevention.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).
- *Constraints*: `UNIQUE(event_id, normalized_name)` prevents duplicate group titles within the same event.

#### 5. `participants`
*Individual human attendees associated with either a group or an individual registration.*
- `id` (UUID / String, Primary Key): Unique participant identifier.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `group_id` (UUID / String, Nullable, Foreign Key -> `groups.id` ON DELETE CASCADE).
- `registration_id` (UUID / String, Nullable, Foreign Key -> `registrations.id` ON DELETE CASCADE).
- `full_name` (Text, NOT NULL): Attendee's full legal name.
- `email` (Text, NOT NULL): Attendee's individual email.
- `mobile_number` (Text, Optional): Mobile phone number.
- `course` (Text, Optional): Academic branch or corporate department.
- `year_of_study` (Text, Optional): E.g., "1st Year", "4th Year", "Professional".
- `semester` (Text, Optional): Academic semester.
- `identifier` (Text, Optional): Student ID, In-Game Name (IGN), or badge designation.
- `is_leader` (Boolean, DEFAULT FALSE): Designates primary contact/group captain.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).

#### 6. `check_ins`
*Atomic admission transaction records.*
- `id` (UUID / String, Primary Key): Unique check-in record.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `registration_id` (UUID / String, Nullable, Foreign Key -> `registrations.id` ON DELETE CASCADE).
- `group_id` (UUID / String, Nullable, Foreign Key -> `groups.id` ON DELETE CASCADE).
- `participant_id` (UUID / String, Nullable, Foreign Key -> `participants.id` ON DELETE CASCADE).
- `volunteer_id` (UUID / String, Foreign Key -> `users.id` ON DELETE SET NULL).
- `method` (Enum: `'QR_CAMERA_SCAN'`, `'OTP_GATE_MATCH'`, `'MANUAL_OVERRIDE'`, DEFAULT `'QR_CAMERA_SCAN'`).
- `timestamp` (Timestamp with Time Zone, DEFAULT NOW()).
- *Constraints*: `UNIQUE(registration_id)` or `UNIQUE(group_id)` guarantees atomic single-use admission.

#### 7. `audit_logs`
*Immutable security and administrative telemetry log.*
- `id` (UUID / String, Primary Key): Unique audit entry.
- `event_id` (UUID / String, Foreign Key -> `events.id` ON DELETE CASCADE).
- `timestamp` (Timestamp with Time Zone, DEFAULT NOW()).
- `action` (Enum / Text, NOT NULL): Action classification (e.g., `'CHECK_IN_SUCCESS'`, `'CHECK_IN_DUPLICATE_ATTEMPT'`, `'CHECK_IN_TAMPER_ATTEMPT'`, `'CHECK_IN_EXPIRED_ATTEMPT'`, `'OTP_GENERATED'`, `'OTP_MATCH_SUCCESS'`, `'OTP_LOCKOUT'`, `'PAYMENT_APPROVED'`, `'PAYMENT_REJECTED'`).
- `severity` (Enum: `'INFO'`, `'WARNING'`, `'CRITICAL'`).
- `actor_id` (Text, NOT NULL): User ID or `"SYSTEM"`.
- `actor_role` (Enum: `'ADMIN'`, `'VOLUNTEER'`, `'SYSTEM'`).
- `target_id` (Text, Optional): ID of the affected registration, group, or pass.
- `target_name` (Text, Optional): Name of the affected target.
- `ip_address` (Text, Optional): Client IP address.
- `user_agent` (Text, Optional): Client browser/scanner user agent.
- `details` (JSONB / Record, NOT NULL): Structured metadata containing before/after state, cryptographic error reasons, or scan counts.

#### 8. `users`
*System accounts and authentication principals.*
- `id` (UUID / String, Primary Key).
- `email` (Text, UNIQUE, NOT NULL).
- `full_name` (Text, NOT NULL).
- `role` (Enum: `'ADMIN'`, `'VOLUNTEER'`).
- `password_hash` (Text, NOT NULL): Salted PBKDF2/scrypt digest (NEVER plaintext).
- `password_salt` (Text, NOT NULL): Cryptographically secure random salt hex/base64.
- `avatar` (Text, Optional): Initials or avatar URL.
- `created_at` (Timestamp with Time Zone, DEFAULT NOW()).

---

## 3. Cryptographic & Security Specifications

### 3.1 Password Hashing & Account Security
- **Algorithm**: PBKDF2 with SHA-512 (minimum 100,000 iterations) or `scrypt` (`N=16384, r=8, p=1`).
- **Salt Generation**: 16-byte cryptographically secure random salt (`crypto.randomBytes(16)`).
- **Prohibition**: Storing or comparing passwords in plaintext (such as current `"admin123"`) is strictly forbidden.
- **Brute-Force Throttling**:
  - In-memory/persistent tracking of failed authentication attempts per IP/email.
  - Maximum 5 failed attempts within 15 minutes before exponential delay or temporary lockout.

### 3.2 Secure Session Token Specification
- **Session Format**: Cryptographically signed JWT or HMAC-SHA256 signed bearer token: `header.payload.signature` or `token:expiry:hmac`.
- **Payload Contents**: `userId`, `email`, `role` (`'ADMIN'` | `'VOLUNTEER'`), `issuedAt`, `expiresAt`.
- **Expiration**: Strict 7-day or 24-hour expiration window.
- **Cookie Security Attributes**:
  - `HttpOnly`: True (inaccessible to JavaScript).
  - `Secure`: True in production (`process.env.NODE_ENV === "production"`).
  - `SameSite`: `'lax'` or `'strict'`.
  - `Path`: `'/'`.
- **Anti-Tampering**: Verification must validate HMAC signature against `process.env.SESSION_SECRET`. Unsigned JSON strings in cookies are strictly rejected.

### 3.3 SECQR Cryptographic QR Pass Specification
- **QR Token Format**:
  `SECQR:<Base64EncodedJSON>`
- **Decoded Payload Structure**:
  ```json
  {
    "v": 1,
    "tid": "<registration_or_group_id>",
    "eid": "<event_id>",
    "tok": "<cryptographically_random_uuid_or_nonce>",
    "exp": 1792166400,
    "sig": "<hmac_sha256_hex_digest_first_32_chars>"
  }
  ```
- **Signing Key**: Secret key loaded from `process.env.QR_HMAC_SECRET` (fallback development salt permitted with security warning).
- **Signature Message**: `${tid}:${eid}:${tok}:${exp}` signed with HMAC-SHA256.
- **Tamper Resistance**: If `sig !== expectedSig`, check-in is aborted immediately, status `400/403` is returned, and a `CHECK_IN_TAMPER_ATTEMPT` with `severity: "CRITICAL"` is logged to `audit_logs`.
- **Pass Expiration**: If `nowUnix > exp`, admission is denied with `isExpired: true`, and a `CHECK_IN_EXPIRED_ATTEMPT` is recorded.
- **Idempotent Single-Use Invariant**:
  - A valid scan atomically transitions `check_in_status` from `'NOT_CHECKED_IN'` to `'CHECKED_IN'`.
  - A secondary scan of the same QR code is rejected atomically, increments `scan_count`, and triggers a `CHECK_IN_DUPLICATE_ATTEMPT` with `severity: "CRITICAL"`, displaying the exact previous check-in timestamp and operator ID.

### 3.4 Venue Gate OTP Fallback Protocol
- **Code Format**: 6-digit cryptographically random numeric string (`crypto.randomInt(100000, 1000000)`).
- **Validity Window**: Strict 10-minute expiration.
- **Rate Limiting & Lockout**: Maximum 4 verification attempts. After 4 failures, code is locked, `isLocked: true` returned, and `OTP_LOCKOUT` (`severity: "CRITICAL"`) logged.
- **Consumption**: Upon successful match, code is immediately purged (`otp_code = null`), marking admission complete.

---

## 4. RBAC, Route Protection & API Authorization Rules

### 4.1 Role Matrix

| Capability / Resource | ADMIN | VOLUNTEER | PUBLIC / ANONYMOUS |
| :--- | :---: | :---: | :---: |
| Access Login Page (`/`) | Yes | Yes | Yes |
| Access Admin Hub (`/events`) | **Allowed** | **BLOCKED (Redirect `/scan`)** | **BLOCKED (Redirect `/`)** |
| Access Event Dashboard (`/events/[eventId]/dashboard`) | **Allowed** | **BLOCKED (Redirect `/scan`)** | **BLOCKED (Redirect `/`)** |
| Access Registrations Management (`/events/[eventId]/registrations`) | **Allowed** | **BLOCKED (Redirect `/scan`)** | **BLOCKED (Redirect `/`)** |
| Review & Approve Payment Proof Screenshots | **Allowed** | **BLOCKED** | **BLOCKED** |
| Upload & Import Spreadsheet (`/events/[eventId]/imports`) | **Allowed** | **BLOCKED** | **BLOCKED** |
| Access Security Audit Telemetry (`/events/[eventId]/audit`) | **Allowed** | **BLOCKED** | **BLOCKED** |
| Create, Edit, or Delete Events | **Allowed** | **BLOCKED** | **BLOCKED** |
| Access Camera Gate Scanner (`/scan`) | **Allowed** | **Allowed** | **BLOCKED (Redirect `/`)** |
| Access Gate Teams Directory (`/scan/teams`) | **Allowed** | **Allowed** | **BLOCKED (Redirect `/`)** |
| Perform QR Code Lookup & Check-in | **Allowed** | **Allowed** | **BLOCKED** |
| Submit On-Spot Walk-in Registration | **Allowed** | **Allowed** | **Allowed (via dedicated public form)** |
| Call `POST /api/checkin` | **Allowed** | **Allowed** | **401 Unauthorized** |
| Call `GET /api/export` | **Allowed** | **BLOCKED (403 Forbidden)** | **401 Unauthorized** |
| Call `GET /api/teams` | **Allowed** | **Allowed (sanitized)** | **401 Unauthorized** |
| Call `POST /api/teams` | **Allowed** | **Allowed** | **401 Unauthorized** |
| Call `PATCH /api/teams/[teamId]` | **Allowed** | **BLOCKED (403 Forbidden)** | **401 Unauthorized** |
| Call `POST /api/teams/[teamId]/email` | **Allowed** | **BLOCKED (403 Forbidden)** | **401 Unauthorized** |
| Inspect Anonymous Participant PII (Phone, Email, Identity) | **Allowed** | **Masked / Minimal** | **STRICTLY BLOCKED** |

### 4.2 Middleware Route Guard Rules (`src/middleware.ts`)
Next.js Edge Middleware must protect all routes:
1. **Unauthenticated Access**:
   - Any request to `/events`, `/events/*`, `/scan`, `/scan/*` without a valid signed session cookie must immediately redirect to `/?redirect=<original_path>`.
   - Any request to `/api/export`, `/api/checkin`, `/api/teams`, `/api/teams/*` without a valid signed session cookie must return `401 Unauthorized` with JSON `{ success: false, error: "Authentication required." }`.
2. **Volunteer Role Enforcement**:
   - If user has `role === 'VOLUNTEER'`, navigation to `/events` or `/events/*` must be intercepted and redirected to `/scan`.
   - Administrative API endpoints (`/api/export`, `/api/teams/[teamId]`, `/api/teams/[teamId]/email`) must reject volunteer sessions with `403 Forbidden`.
3. **Public Exemptions**:
   - `/` (login), `/_next/*`, `/favicon.ico`, `/public/*`, and `/api/health` remain accessible without credentials.

---

## 5. Functional Features & Operational Workflows

### 5.1 Payment Screenshot Verification Workflow
1. **Participant Upload**: During advance registration, attendee submits payment proof (screenshot/receipt image). The image is stored in Supabase Storage bucket `payment-proofs` or local filesystem.
2. **Pending Queue**: Registration enters `status = 'PENDING_REVIEW'`, `payment_status = 'PENDING'`. No QR code is issued yet.
3. **Admin Verification Modal**:
   - Admin opens Registrations page. Pending payment count is badged.
   - Admin clicks "Review Payment" to trigger the Verification Modal.
   - Modal renders high-resolution screenshot with zoom, pan, attendee contact info, requested track, and transaction reference.
   - Admin can click:
     - **"Approve Registration"**: Sets `status = 'APPROVED'`, `payment_status = 'VERIFIED'`. Triggers generation of `SECQR:` HMAC token and automated email ticket dispatch.
     - **"Reject Registration"**: Sets `status = 'REJECTED'`, `payment_status = 'REJECTED'`, prompt for optional rejection reason (e.g., "Illegible receipt", "Incorrect amount").
4. **Gate Protection**: If a pending or rejected registration is scanned at the venue, admission is blocked with `Registration pending review: Payment not verified`.

### 5.2 Gate Verification & Attendance Recording
1. **Camera Scanning**: Browser scans QR via camera using `html5-qrcode` (environment camera preferred, flashlight toggle, audio feedback).
2. **Cryptographic Validation**: Validates `SECQR:` HMAC signature and expiration date.
3. **Atomic Commit**: If valid and unconsumed, atomically marks attendance with timestamp, volunteer ID, and method.
4. **Duplicate Interception**: If already scanned, immediately halts admission with red audio warning, vibrates device, and displays exact prior arrival time.

### 5.3 On-Spot Walk-In Registration
- Volunteer completes on-spot form at venue.
- Enforces track group-size limits (e.g. max 4 for hackathon track).
- Checks for duplicate group or participant names.
- Immediately issues digital QR pass and offers on-screen ticket display.

### 5.4 Offline Roster Export & Disaster Recovery Protocol
- In case of venue internet blackout, admin downloads offline fallback roster.
- Formats:
  - **CSV Export**: Contains `Team_Name`, `Full_Name`, `Role`, `Email`, `Mobile`, `Track`, `Approval_Status`, `QR_Token`, `Attendance_Status`.
  - **Printable Roster**: Formatted for standard A4 printing with alphabetical indexing, attendee checkboxes, and emergency sign-in rows.

---

## 6. Code Quality, Documentation & Test Criteria

### 6.1 Documentation Requirements (`docs/`)
Formal markdown documents required:
1. `docs/PROJECT_AUDIT.md`: Complete audit of architecture, vulnerabilities found, remediation status, and tech debt.
2. `docs/ARCHITECTURE.md`: High-level system architecture, App Router topology, Server Actions, dual-mode persistence, and data flow diagrams.
3. `docs/DATABASE_SCHEMA.md`: Complete ERD, PostgreSQL table definitions, constraints, indexes, RLS policies, and JSON store schema.
4. `docs/SECURITY.md`: Threat model, cryptographic primitives, HMAC-SHA256 SECQR specifications, PBKDF2/scrypt parameters, cookie policy, and audit trail.
5. `docs/IMPLEMENTATION_PLAN.md`: Phase-by-phase execution plan for hardening, migration, and release.
6. `.env.example`: Exhaustive configuration template documenting all required secrets (`SESSION_SECRET`, `QR_HMAC_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, etc.).

### 6.2 Code Quality & Verification Gates
1. **Linting**:
   - `npm.cmd run lint` must exit with **0 errors**.
   - Must resolve all 101 existing ESLint errors (`@typescript-eslint/no-explicit-any`, unused variables, React hook rules).
2. **Type Checking**:
   - `npx.cmd tsc --noEmit` must complete with **0 errors**.
3. **Automated Test Suite**:
   - Automated unit and integration tests using Jest or Vitest.
   - Coverage:
     - Authentication: password hashing with salt, password verification, session signing, session validation, brute-force rate limiting.
     - RBAC: middleware route redirects, API 401/403 authorization checks.
     - Cryptography: SECQR generation, HMAC verification, tamper detection, expired token rejection.
     - Check-In & Gate Verification: atomic single-use check-in, duplicate scan blocking, audit logging.
     - Payment Review: approve and reject actions.
     - Offline Fallback: CSV export generation.
   - `npm.cmd test` passes 100% of tests.
4. **Build Verification**:
   - `npm.cmd run build` completes successfully.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth & Identity | PBKDF2/scrypt Password Hashing | Authenticate users via salted cryptographic hashes instead of plaintext passwords. | Email, password string | `UserAccount` session, success boolean | Rejects with "Invalid account name or password" on mismatch | `ORIGINAL_REQUEST.md` R2, `TSD.md` §2.7 |
| 2 | Auth & Identity | Cryptographically Signed Session Cookie | Issue tamper-resistant signed session token with expiry and secure cookie flags. | `UserAccount` object, secret key | Signed session cookie (`event_auth_session`) | Unsigned or tampered cookie fails verification and clears session | `ORIGINAL_REQUEST.md` R2, `authService.ts` audit |
| 3 | Auth & Identity | Brute-Force Login Throttling | Prevent credential stuffing by throttling repeated failed login attempts. | Client IP, email address | Throttled status or allowed attempt | After 5 consecutive failures, blocks further attempts for 15 minutes | `ORIGINAL_REQUEST.md` R2 |
| 4 | RBAC & Protection | Next.js Route Protection Middleware | Intercept unauthenticated visits to `/events` and `/scan`, redirecting to login. | NextRequest URL, session cookie | NextRequest rewrite/redirect or next() | Unauthenticated requests redirected to `/?redirect=<path>` | `ORIGINAL_REQUEST.md` R3, Acceptance Criteria |
| 5 | RBAC & Protection | Volunteer Privilege Restriction | Enforce role isolation so volunteers cannot access `/events/*` or admin actions. | Session user role (`'VOLUNTEER'`) | Redirection to `/scan` or 403 Forbidden | Access to admin routes redirected; API calls return 403 | `ORIGINAL_REQUEST.md` R3, `PRD.md` §4 |
| 6 | RBAC & Protection | API Route Authorization Guards | Guard `/api/export`, `/api/checkin`, `/api/teams` against anonymous requests. | NextRequest headers, cookies | 401 Unauthorized or authorized execution | Returns HTTP 401 `{ success: false, error: "Unauthorized" }` | `ORIGINAL_REQUEST.md` R3, API routes audit |
| 7 | Data Architecture | Generalized Schema Realignment | Schema entities: `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`. | SQL schema definitions, TS types | Generalized database entities | Schema validation errors logged on missing foreign keys | `ORIGINAL_REQUEST.md` R4, `TSD.md` §2, `gemini.md` |
| 8 | Data Architecture | Dual-Mode Data Persistence | Support primary Supabase PostgreSQL with seamless fallback to `data/events-data.json`. | CRUD query parameters, DB credentials | Entity data from Supabase or local JSON | If Supabase is unreachable, automatically logs notice and uses local store | `ORIGINAL_REQUEST.md` R4, `dataStore.ts` |
| 9 | Payment Verification | Payment Screenshot Upload | Participants upload payment transaction screenshot during advance registration. | Form file payload (PNG, JPEG, WebP) | Storage path / URL attached to registration | Rejects files > 5MB or invalid MIME types | `ORIGINAL_REQUEST.md` R5, `TSD.md` §3 |
| 10 | Payment Verification | Admin Payment Proof Review Modal | Interactive admin dialog displaying payment screenshot with zoom/pan and approve/reject actions. | Registration ID, review action (Approve/Reject), optional reason | Updated status (`'APPROVED'` or `'REJECTED'`), triggered QR | Throws error if registration already approved or not found | `ORIGINAL_REQUEST.md` R5, `PRD.md` §5 |
| 11 | Gate Security | SECQR HMAC-SHA256 Signed Pass Generation | Generate tamper-evident, versioned, base64 payload prefixed with `SECQR:`. | `registration_id`, `event_id`, token nonce, expiration Date | String `SECQR:<base64-payload>`, QR image | Fails if HMAC secret key is missing | `ORIGINAL_REQUEST.md` R5, `cryptoService.ts` |
| 12 | Gate Security | Cryptographic Tamper Detection | Decodes `SECQR:` payload and recalculates HMAC signature against shared secret. | Raw scanned QR string | `{ valid: true, isSignedPayload: true, ... }` | Returns `valid: false, tamperDetected: true`, logs `CHECK_IN_TAMPER_ATTEMPT` | `ORIGINAL_REQUEST.md` R5, `cryptoService.ts` |
| 13 | Gate Security | Single-Use QR Pass Expiration | Reject QR passes whose embedded expiration timestamp has passed. | Scanned QR payload, current timestamp | Decoded token or expiration error | Returns `valid: false, isExpired: true`, logs `CHECK_IN_EXPIRED_ATTEMPT` | `ORIGINAL_REQUEST.md` R5, `cryptoService.ts` |
| 14 | Gate Security | Atomic Single-Use Check-In Enforcement | Guarantee exactly one check-in per registration/group pass; reject second scans. | Registration ID, QR token, volunteer ID | Success message, committed check-in record | Returns `alreadyCheckedIn: true`, logs `CHECK_IN_DUPLICATE_ATTEMPT` | `ORIGINAL_REQUEST.md` R5, `PRD.md` §6.5 |
| 15 | Gate Security | On-Spot 2FA Venue OTP Fallback | Generate 6-digit numeric OTP sent to attendee inbox for gate check-in without camera. | Registration / Group ID, event ID | 6-digit OTP dispatched via Resend or displayed | Maximum 4 attempts; locks team after 4 failures, logs `OTP_LOCKOUT` | `ORIGINAL_REQUEST.md` R5, `dataStore.ts` |
| 16 | Disaster Recovery | Offline CSV Roster Export | Export complete event roster with attendee details, QR tokens, and check-in statuses to CSV. | `eventId`, optional search/status filters | CSV file download stream (`roster_<eventId>.csv`) | Returns empty CSV or error message if event not found | `ORIGINAL_REQUEST.md` R5, `TSD.md` §3 |
| 17 | Disaster Recovery | Printable Offline Attendance Roster | Formatted printable HTML/PDF view with checkboxes for paper-based venue backup protocol. | `eventId` | Printable styled tabular view with signature lines | Shows empty state if event has no registered attendees | `ORIGINAL_REQUEST.md` R5, `gemini.md` |
| 18 | Quality & Testing | Zero ESLint Errors (Resolution of 101 Errors) | Eliminate all 101 ESLint errors across actions, APIs, pages, and services. | ESLint flat config, TypeScript source files | 0 errors exit code from `npm.cmd run lint` | ESLint reports nonzero exit code on lint violations | `ORIGINAL_REQUEST.md` R6 |
| 19 | Quality & Testing | Clean TypeScript Typechecking | Strict TypeScript compilation across App Router and server actions. | `tsconfig.json`, all `.ts` and `.tsx` files | Clean exit (0 errors) from `npx.cmd tsc --noEmit` | `tsc` prints errors and returns exit code 1 | `ORIGINAL_REQUEST.md` R6 |
| 20 | Quality & Testing | Automated Test Suite Execution | Automated unit and integration tests covering security, auth, crypto, and check-in workflows. | Test runner (Jest/Vitest), test specs in `tests/` | Test report with passing assertions | Non-zero exit code if any test assertion fails | `ORIGINAL_REQUEST.md` R6 |
| 21 | Quality & Testing | Formal Project Documentation (`docs/`) | Standardized markdown documentation in `docs/` and environment example file. | Markdown specs, system architecture | `PROJECT_AUDIT.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SECURITY.md`, `IMPLEMENTATION_PLAN.md`, `.env.example` | Missing documents violate R1 acceptance criteria | `ORIGINAL_REQUEST.md` R1 |
| 22 | Operations | Batch QR Code Regeneration | Regenerate fresh signed, expiring QR passes across an entire event roster. | `eventId`, expiration hours | Count of regenerated teams, new signed QR tokens | Returns failure message if event not found or update fails | Discovered via `dataStore.ts`, `qrActions.ts` |
| 23 | Operations | Administrative Check-In Status Reset | Allow admins to reset accidental check-ins with mandatory audit reason logging. | `teamId`, admin ID, justification text | Reset check-in state to `'NOT_CHECKED_IN'`, audit entry | Rejects empty reason; requires admin privileges | Discovered via `dataStore.ts`, `qrActions.ts` |
| 24 | Operations | Security Audit Telemetry Logging | Immutable audit logging of all gate attempts, duplicate scans, and administrative overrides. | Event ID, action, severity, actor ID, details | Log entry stored in local store and Supabase | Keeps latest 2000 logs in local storage to prevent unbounded growth | Discovered via `dataStore.ts`, `schema.sql` |
| 25 | Operations | Spreadsheet Bulk Import & Header Mapping | Upload XLSX/CSV files, map variable column headers, auto-group into teams, generate QRs. | CSV/XLSX file buffer, optional column mappings | Import summary: added count, updated count, conflicts | Reports invalid rows, rejects non-spreadsheet MIME types | Discovered via `importData.ts`, `PRD.md` §6.2 |
| 26 | Communications | Automated Branded Email Ticket Dispatch | Deliver HTML entry passes with embedded base64 QR images to attendee emails via Resend. | Attendee email, captain name, team name, QR data URL | Dispatched email ID, delivery log | In development without API key, runs in simulation mode | Discovered via `emailService.ts`, `memory.md` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Cryptographic SECQR Pass | Payload altered by 1 character (e.g. `tid` changed in base64 string) | Recalculated HMAC signature does not match embedded signature; immediately returns `tamperDetected: true`, rejects admission, and logs `CHECK_IN_TAMPER_ATTEMPT` with `severity: "CRITICAL"`. |
| 2 | Cryptographic SECQR Pass | Scanned QR string lacks `SECQR:` prefix (raw UUID or legacy string) | Legacy fallback recognizes clean string as raw token; verifies against database token field without HMAC signature verification. |
| 3 | Single-Use QR Pass | Valid QR pass scanned a second time 5 minutes after first check-in | System rejects check-in atomically, increments `scan_count`, returns `alreadyCheckedIn: true`, and displays exact prior check-in time and volunteer ID; logs `CHECK_IN_DUPLICATE_ATTEMPT`. |
| 4 | Single-Use QR Pass | Valid QR pass scanned after expiration timestamp (`exp < now`) | Verification identifies expiration, returns `isExpired: true`, refuses gate entry, and logs `CHECK_IN_EXPIRED_ATTEMPT`; prompts user to use OTP fallback. |
| 5 | Single-Use QR Pass | QR pass of a deleted or revoked registration is scanned | System detects `qr_token` has been cleared in store, returns `ACCESS DENIED: QR Pass has been REVOKED or DELETED`, and logs `CHECK_IN_REVOKED_ATTEMPT`. |
| 6 | 2FA Venue OTP Fallback | Incorrect 6-digit code entered by volunteer | Decrements `attempts_left` by 1; returns error stating remaining attempts; logs `OTP_MATCH_FAILURE`. |
| 7 | 2FA Venue OTP Fallback | Incorrect 6-digit code entered 4 consecutive times | Triggers security lockout; sets `otp_locked = true`; returns `isLocked: true`; logs `OTP_LOCKOUT` (`severity: "CRITICAL"`); requires admin intervention. |
| 8 | 2FA Venue OTP Fallback | Correct 6-digit code entered after 10-minute window has elapsed | Rejects code with "Verification code expired (10-minute validity window elapsed)"; requires generation of a fresh code. |
| 9 | Payment Verification | Registration has `status = 'PENDING_REVIEW'` and is scanned at gate | Gate inspection rejects admission with "Team admission is currently PENDING_REVIEW. Verification rejected."; blocks entry until admin approves. |
| 10 | Route Protection | Anonymous user directly enters URL `http://localhost:3000/events/ev-1/dashboard` in browser | Middleware intercepts request before rendering, redirects user to `/?redirect=%2Fevents%2Fev-1%2Fdashboard`. |
| 11 | Route Protection | User with `role = 'VOLUNTEER'` attempts to access `/events` or `/events/[eventId]/registrations` | Middleware detects volunteer role, blocks access to admin dashboard, and redirects volunteer to `/scan`. |
| 12 | API Authorization | External script sends `GET /api/export?format=csv` without session cookie | API route middleware returns `HTTP 401 Unauthorized` with JSON `{ success: false, error: "Unauthorized" }`; prevents anonymous PII exfiltration. |
| 13 | API Authorization | Volunteer session sends `GET /api/export` | Returns `HTTP 403 Forbidden`; volunteers are not permitted to dump full event PII rosters. |
| 14 | Spreadsheet Import | Uploaded CSV has empty team name column for multiple rows | Grouping logic prevents lumping all rows together into one massive team; creates distinct individual registrations (`"Team - <Participant Name>"`). |
| 15 | Spreadsheet Import | Uploaded CSV contains a team name that matches an existing team (case-insensitive) | Normalized collision detected; merges newly listed participants into existing team without creating duplicate team entities; increments `conflicts` count. |
| 16 | On-Spot Registration | Walk-in registration attempted with team name already registered in event | Registration rejected with "Team '<teamName>' already exists in this event." |
| 17 | Dual-Mode Persistence | Venue loses internet connectivity; Supabase PostgreSQL connection times out | Data store logs background warning, seamlessly queries or persists to local `data/events-data.json`; zero interruption to volunteer scanning. |
| 18 | Offline Export | Export requested for an event with 0 accepted registrations | Returns empty CSV with standard CSV column headers or JSON `{ teamsCount: 0, participantsCount: 0, roster: [] }`. |
| 19 | Check-In Reset | Administrator resets checked-in team without providing justification reason | Action rejected; audit logging requires mandatory non-empty reason string for tracking accountability. |
| 20 | Login Brute Force | Attacker submits 20 failed login requests within 60 seconds | Throttler detects brute-force pattern; locks source IP/identifier; returns `429 Too Many Requests` or lockout message. |

---

## 7. Gap Analysis: Current Codebase vs Authoritative Specification

| Specification Requirement | Authoritative Source | Current Codebase State | Status / Gap |
| :--- | :--- | :--- | :--- |
| **Password Hashing** | `ORIGINAL_REQUEST.md` R2, `TSD.md` | Plaintext passwords `"admin123"`, `"volunteer123"` in `authService.ts`. No salt, no PBKDF2/scrypt. | **Critical Gap**: Must implement salted PBKDF2/scrypt hashing. |
| **Secure Session Tokens** | `ORIGINAL_REQUEST.md` R2 | Raw unsigned JSON string stored in cookie `event_auth_session`. Can be easily forged by client. | **Critical Gap**: Must sign session cookie using HMAC-SHA256 with expiration. |
| **Login Throttling** | `ORIGINAL_REQUEST.md` R2 | No throttling mechanism exists in `authService.ts` or `authActions.ts`. | **Critical Gap**: Must implement rate limiting on failed logins. |
| **Next.js Middleware Guard** | `ORIGINAL_REQUEST.md` R3 | No `middleware.ts` exists in the repository. `/events` and `/scan` accessible unauthenticated. | **Critical Gap**: Must create `src/middleware.ts` enforcing route RBAC. |
| **API Route Protection** | `ORIGINAL_REQUEST.md` R3 | `/api/export`, `/api/checkin`, `/api/teams` have no authorization checks. Anonymous PII access possible. | **Critical Gap**: Must add auth guards returning 401/403. |
| **Payment Verification Modal** | `ORIGINAL_REQUEST.md` R5, `PRD.md` §5 | Zero payment references in `src/`. No screenshot preview modal, no approval/rejection button. | **Critical Gap**: Must implement Payment Verification Modal in Registrations view. |
| **Schema Realignment** | `ORIGINAL_REQUEST.md` R4, `TSD.md` §2, `gemini.md` | Code uses legacy `teams` instead of generalized `groups`, `event_tracks`, and `registrations`. | **Structural Gap**: Align dataStore interfaces and database schema with generalized specs. |
| **Documentation Suite** | `ORIGINAL_REQUEST.md` R1 | Directory `docs/` and `.env.example` do not exist. | **Documentation Gap**: Deliver all 5 required docs under `docs/` and `.env.example`. |
| **101 ESLint Errors** | `ORIGINAL_REQUEST.md` R6 | Exactly 101 ESLint errors reported during `npm.cmd run lint`. | **Quality Gap**: Resolve all 101 ESLint errors across the codebase. |
| **Automated Test Suite** | `ORIGINAL_REQUEST.md` R6 | No test runner (Jest/Vitest), test configuration, or test specs exist. | **Testing Gap**: Configure test framework and provide automated security/workflow tests. |
| **SECQR HMAC Token System** | `ORIGINAL_REQUEST.md` R5, `cryptoService.ts` | Fully implemented in `cryptoService.ts` with versioning, expiry, and signature verification. | **Implemented**: Operational and verified. |
| **Dual-Mode Persistence** | `ORIGINAL_REQUEST.md` R4, `TSD.md` | Implemented in `dataStore.ts` with local JSON fallback and Supabase sync logic. | **Implemented**: Needs alignment with generalized entities. |
| **Offline CSV Roster Export** | `ORIGINAL_REQUEST.md` R5, `PRD.md` §5 | Implemented in `/api/export` and `RegistrationsPage.tsx`. | **Implemented**: Needs auth protection and printable view. |
| **On-Spot OTP Fallback** | `ORIGINAL_REQUEST.md` R5, `PRD.md` §6.4 | Implemented in `dataStore.ts`, `qrActions.ts`, and `scan/page.tsx` with Resend and simulation. | **Implemented**: Operational and verified. |
| **TypeScript Typecheck** | `ORIGINAL_REQUEST.md` R6 | `npx.cmd tsc --noEmit` exits with 0 errors. | **Passing**: Maintained. |
| **Production Build** | `ORIGINAL_REQUEST.md` R6 | `npm.cmd run build` successfully compiles all routes. | **Passing**: Maintained. |

---

## 8. Verification Strategy & Acceptance Checklists

To achieve full compliance with `ORIGINAL_REQUEST.md`, subsequent implementation phases must verify:

1. **Security & Access Control Verification**:
   - Navigate directly to `http://localhost:3000/events` in an incognito window -> Verify immediate redirect to `/?redirect=%2Fevents`.
   - Log in with `volunteer@eventportal.com` -> Attempt navigation to `/events` -> Verify redirection to `/scan`.
   - Send `curl -i http://localhost:3000/api/export` without headers -> Verify `HTTP 401 Unauthorized`.
   - Send `curl -i http://localhost:3000/api/checkin` without headers -> Verify `HTTP 401 Unauthorized`.
   - Inspect cookie storage -> Verify session cookie is signed and cannot be manually modified to elevate privileges.

2. **Cryptographic & Verification Testing**:
   - Verify that modifying a single character in a `SECQR:` string results in signature mismatch and `tamperDetected = true`.
   - Perform a scan of an approved pass -> Check-in succeeds.
   - Scan the same pass a second time -> Rejected with duplicate violation alert and exact timestamp.
   - Scan an expired pass -> Rejected with expiration notice.

3. **Payment & Operational Testing**:
   - Upload payment screenshot for a registration -> Verify registration appears as "Pending Review" with badge.
   - Open Review Modal -> Verify image rendering, approve registration -> Verify status changes to "Approved" and single-use `SECQR:` pass is generated.
   - Export CSV roster -> Verify columns match specification and PII is properly structured.

4. **Code Quality Gates**:
   - `npm.cmd run lint` -> **0 errors, 0 warnings**.
   - `npx.cmd tsc --noEmit` -> **0 errors**.
   - `npm.cmd test` -> **All tests pass**.
   - `npm.cmd run build` -> **Build succeeds**.
