# Project: Universal Event Registration & QR Check-in System

## Architecture
- **Framework**: Next.js 16.4.0 (App Router), React 19, TypeScript
- **Styling & UI**: Tailwind CSS, Shadcn UI primitives, Lucide React
- **Data Persistence**: Dual-mode architecture:
  - Primary: Supabase PostgreSQL (`schema.sql`)
  - Offline Fallback: Local JSON datastore (`data/events-data.json`)
- **Security & Cryptography**:
  - Passwords: Salted PBKDF2 / scrypt hashing
  - Sessions: HMAC-SHA256 signed HTTP-only cookies with expiration and brute-force throttling
  - QR Passes: `SECQR:` HMAC-SHA256 signed payloads with constant-time verification (`crypto.timingSafeEqual`)
- **Access Control**: Next.js Edge Middleware (`middleware.ts`) + API and Server Action authorization guards protecting `/events/*`, `/scan/*`, `/api/export`, `/api/checkin`, `/api/teams`.
- **Testing**: Vitest automated unit & integration test runner.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | System Documentation Suite | Complete formal architectural documentation: `docs/PROJECT_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Environment Configuration Template | Complete `.env.example` with Supabase, auth, and crypto configuration keys | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Salted Cryptographic Password Hashing | Replace hardcoded plaintext credentials with PBKDF2/scrypt + salt | M2 | ORIGINAL_REQUEST §R2 |
| 4 | Signed Session Tokens with Expiration | Replace raw JSON cookies with HMAC-SHA256 signed session cookies with timestamp expiration | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Authentication Brute-Force Throttling | Track failed login attempts and enforce rate-limiting / temporary lockout | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Edge Middleware Route Protection | Next.js Edge Middleware blocking unauthenticated navigation to `/events` and `/scan`, redirecting to `/` (login) | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Server-Enforced RBAC | Enforce `ADMIN` vs `VOLUNTEER` privileges in middleware, pages, and server actions; volunteers cannot access admin routes | M3 | ORIGINAL_REQUEST §R3 |
| 8 | API Route Authorization Guards | Enforce 401 Unauthorized for unauthenticated requests to `/api/export`, `/api/checkin`, `/api/teams`, `/api/import` | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Attendee PII Shielding | Protect attendee phone numbers, emails, student IDs, and tokens from anonymous access and unauthorized roles | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Generalized Entity Schema Realignment | Realign database models to generalized event entities (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`) | M4 | ORIGINAL_REQUEST §R4, GEMINI.md |
| 11 | Dual-Mode Data Persistence | Support Supabase PostgreSQL persistence with resilient local JSON fallback (`data/events-data.json`) | M4 | ORIGINAL_REQUEST §R4, TSD.md |
| 12 | Secure HMAC QR Code Generation | Generate single-use HMAC-SHA256 signed QR passes prefixed with `SECQR:` | M5 | ORIGINAL_REQUEST §R5 |
| 13 | Strict QR Cryptographic Verification | Eliminate non-SECQR bypass in `cryptoService.ts`; enforce constant-time signature comparison | M5 | ORIGINAL_REQUEST §R5 |
| 14 | Atomic Single-Use Gate Check-in | Enforce atomic single-use check-in; reject duplicate scans with exact violation timestamp and audit logging | M5 | ORIGINAL_REQUEST §R5 |
| 15 | Venue OTP Fallback Check-in | 6-digit OTP fallback verification with lockout protection after failed attempts | M5 | ORIGINAL_REQUEST §R5, PRD.md |
| 16 | Payment Proof Review Modal | Admin dialog to inspect uploaded payment screenshots and approve or reject registrations | M5 | ORIGINAL_REQUEST §R5 |
| 17 | Offline Roster CSV & Printable Export | Export full attendee roster as CSV and printable roster for network outage protocols | M5 | ORIGINAL_REQUEST §R5, PRD.md |
| 18 | 101 ESLint Error Elimination | Resolve all 101 ESLint errors (`no-explicit-any`, `no-unescaped-entities`, `react-hooks`) for 0 errors | M6 | ORIGINAL_REQUEST §R6 |
| 19 | Clean TypeScript Compilation | Ensure `npx.cmd tsc --noEmit` passes with 0 errors | M6 | ORIGINAL_REQUEST §R6 |
| 20 | Vitest Test Suite Configuration | Install and configure Vitest runner with `"test": "vitest run"` script | M6 | ORIGINAL_REQUEST §R6 |
| 21 | Auth & Crypto Automated Unit Tests | Tests covering password hashing, session signing, SECQR generation, and tamper rejection | M6 | ORIGINAL_REQUEST §R6 |
| 22 | Check-in & Gate Verification Tests | Tests covering atomic single-use check-in, duplicate detection, and OTP fallback | M6 | ORIGINAL_REQUEST §R6 |
| 23 | RBAC & Route Protection Tests | Tests covering API 401 responses, middleware redirection, and role permissions | M6 | ORIGINAL_REQUEST §R6 |
| 24 | Data Persistence & Export Tests | Tests covering dual-mode persistence and CSV roster generation | M6 | ORIGINAL_REQUEST §R6 |
| 25 | Successful Production Build | Next.js production build (`npm.cmd run build`) succeeds cleanly | M6 | ORIGINAL_REQUEST §R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Documentation & Environment Configuration | Features 1, 2 (`docs/*`, `.env.example`) | None | DONE |
| 2 | Authentication & Account Lifecycle Hardening | Features 3, 4, 5 (`authService.ts`, `authActions.ts`, crypto hashing, session tokens, brute-force) | M1 | DONE |
| 3 | Server-Enforced RBAC & Route/API Protection | Features 6, 7, 8, 9 (`middleware.ts`, route guards, `/api/*` protection, PII masking) | M2 | IN_PROGRESS |
| 4 | Database Schema Realignment & Dual-Mode Persistence | Features 10, 11 (`schema.sql`, `dataStore.ts`, entity generalization, Supabase + JSON fallback) | None | PLANNED |
| 5 | Gate Verification, Payment Review & Offline Roster | Features 12, 13, 14, 15, 16, 17 (`cryptoService.ts`, `qrActions.ts`, payment modal, CSV export) | M2, M3, M4 | PLANNED |
| 6 | Code Quality, 0-Error Linting & Automated Test Suite | Features 18, 19, 20, 21, 22, 23, 24, 25 (ESLint 101 fixes, Vitest setup, automated test suites, clean build) | M1-M5 | PLANNED |

## Interface Contracts

### Auth & Session Contract (`src/lib/services/authService.ts`)
- `hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }>`
- `verifyPassword(password: string, hash: string, salt: string): Promise<boolean>`
- `createSessionToken(user: UserAccount): Promise<string>` (HMAC-SHA256 signed, contains expiration)
- `verifySessionToken(token: string): Promise<UserAccount | null>`
- `checkRateLimit(ipOrEmail: string): { allowed: boolean; remainingAttempts: number; retryAfterSec?: number }`

### Edge Middleware Contract (`src/middleware.ts`)
- Matcher: `['/events/:path*', '/scan/:path*', '/api/export/:path*', '/api/checkin/:path*', '/api/teams/:path*']`
- Unauthenticated requests to `/events/*` or `/scan/*` redirect to `/` (login).
- Unauthenticated requests to `/api/*` return `401 Unauthorized` `{ error: "Unauthorized" }`.
- Volunteer requests to `/events/*` (except public scan/checkin) redirect or return `403 Forbidden`.

### QR & Gate Cryptography Contract (`src/lib/services/cryptoService.ts`)
- `createSecureQRPayload(teamId: string, eventId: string): string`: Returns `SECQR:<base64-payload>` with HMAC-SHA256 signature.
- `verifySecureQRPayload(rawPayload: string): { valid: boolean; isSignedPayload: boolean; token?: string; error?: string }`
  - Strict: Non-SECQR payloads must return `valid: false` (no bypass).
  - Uses `crypto.timingSafeEqual` to avoid timing attacks.

### Check-in Contract (`src/app/actions/qrActions.ts`)
- `processCheckIn(params: { eventId: string; qrPayload: string; volunteerId: string }): Promise<CheckInResult>`
  - Atomically verifies pass is not already checked in.
  - If checked in: rejects with `DUPLICATE_CHECK_IN`, logs violation to `audit_logs` with exact timestamp.
  - If invalid signature: rejects with `INVALID_SIGNATURE`.

### Payment Proof Review Contract
- Server action `approveRegistration(registrationId: string, reviewerId: string)`
- Server action `rejectRegistration(registrationId: string, reviewerId: string, reason: string)`
- Review modal in `src/app/(admin)/events/[eventId]/registrations/page.tsx` with screenshot thumbnail, zoom/preview dialog, and Approve/Reject action triggers.

## Code Layout
- `docs/`: Formal system architecture, audit, database schema, security, and implementation plan documents.
- `src/middleware.ts`: Next.js Edge Middleware for RBAC and route protection.
- `src/lib/services/authService.ts`: Password hashing, HMAC session signing, verification, rate limiting.
- `src/lib/services/cryptoService.ts`: HMAC-SHA256 SECQR generation and timing-safe verification.
- `src/lib/dataStore.ts`: Dual-mode datastore (Supabase + local JSON) for generalized event entities.
- `src/app/actions/`: Next.js Server Actions for auth, events, check-ins, and data imports.
- `src/app/api/`: REST endpoints (`checkin`, `export`, `teams`, `import`) with auth guards.
- `src/app/(admin)/`: Administrative portals (dashboard, registrations, audit, exports, settings).
- `src/app/(volunteer)/`: Gate verification, QR scanner, manual OTP fallback portals.
- `tests/`: Automated unit and integration test suites using Vitest.
