# Architecture Blueprint & Environment Configuration Strategy
**Universal Event Registration & QR Check-in System**

**Milestone:** M1 — Documentation & Environment Configuration  
**Author:** `explorer_m1_2` (Teamwork Explorer / System Architect)  
**Target Documents:** `docs/ARCHITECTURE.md`, `.env.example`  
**Referenced Specifications:** `ORIGINAL_REQUEST.md`, `PROJECT.md`, `PRD.md`, `TSD.md`, `GEMINI.md`  
**Date:** 2026-10-14  

---

## Executive Summary

This document establishes the authoritative architectural blueprint and environment configuration strategy for the **Universal Event Registration & QR Check-in System**. Designed for high-density offline events (conferences, technical hackathons, esports tournaments, collegiate summits) managing 200+ attendees across multiple simultaneous gates, the platform balances high-performance real-time verification with military-grade security and zero-downtime offline fault tolerance.

This blueprint directly equips downstream documentation authors (`author_m1_1` or implementers) to produce:
1. `docs/ARCHITECTURE.md`: A complete, production-grade architectural specification covering Next.js 16 App Router topology, dual-mode data persistence, cryptographic authentication, server-enforced RBAC, HMAC-SHA256 SECQR gate verification, and multi-tier venue disaster recovery.
2. `.env.example`: A fully documented, turnkey environment variable template eliminating hardcoded secrets, establishing cryptographic salt baselines, and securing production deployments.

---

## Part 1: Detailed Blueprint for `docs/ARCHITECTURE.md`

Below is the exhaustive, section-by-section specification and drafted content for `docs/ARCHITECTURE.md`.

```markdown
# System Architecture Specification
## Universal Event Registration & QR Check-in System

**Version:** 1.0  
**Status:** Approved Architecture  
**Target Runtime:** Next.js 16.4.0 (App Router), React 19.3.0, Node.js 20+ / 24 LTS  
**Primary Database:** Supabase (PostgreSQL 15+) with Row-Level Security (RLS)  
**Fallback Storage:** Local JSON Document Store (`data/events-data.json`)  
**Styling & UI:** Tailwind CSS v4, Shadcn/ui Primitives, Lucide Icons  
```

---

### Section 1: High-Level System Architecture & Component Topology

#### 1.1 Architecture Topology Diagram

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                     CLIENT LAYER                       │
                                    │  (Browser / Gate Mobile Scanners / Admin Workstations) │
                                    └───────────────────────────┬────────────────────────────┘
                                                                │
                                                     HTTPS / TLS 1.3 Requests
                                                     Cookie: event_auth_session
                                                                │
                                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NEXT.JS 16 APPSERVER & EDGE LAYER                                                                          │
│                                                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Edge Middleware (`src/middleware.ts`)                                                                 │  │
│  │ ├─ Route Matcher: `/events/*`, `/scan/*`, `/api/*`                                                   │  │
│  │ ├─ Session Signature Verification (`SESSION_SECRET` HMAC-SHA256)                                     │  │
│  │ ├─ RBAC Route Isolation:                                                                            │  │
│  │ │   ├─ Unauthenticated ──► Redirect to `/?redirect=<path>` OR 401 Unauthorized (`/api/*`)           │  │
│  │ │   └─ Volunteer Role ──► Block `/events/*` (Redirect `/scan`), Block Admin APIs (403 Forbidden)     │  │
│  │ └─ Public Whitelist: `/`, `/_next/*`, `/public/*`, `/favicon.ico`, `/api/health`                      │  │
│  └───────────────────────────────────────────────────┬──────────────────────────────────────────────────┘  │
│                                                      │ Authenticated & Authorized Requests                 │
│                                                      ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ App Router Route Hierarchy (`src/app/`)                                                               │  │
│  │                                                                                                      │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────┐  ┌──────────────────────────────┐  │  │
│  │  │ Public Group            │  │ Admin Portal `(admin)`          │  │ Volunteer Portal `(volunteer)`│  │
│  │  │ ├─ `/` (Login Page)     │  │ ├─ `/events` (Hub)              │  │ ├─ `/scan` (Camera & OTP)    │  │  │
│  │  │ └─ `/api/health`        │  │ ├─ `/events/[id]/dashboard`     │  │ └─ `/scan/teams` (Roster)    │  │  │
│  │  │                         │  │ ├─ `/events/[id]/registrations` │  │                              │  │  │
│  │  │                         │  │ │  └─ Payment Proof Review Modal│  │                              │  │  │
│  │  │                         │  │ ├─ `/events/[id]/imports`       │  │                              │  │  │
│  │  │                         │  │ └─ `/events/[id]/audit`         │  │                              │  │  │
│  │  └─────────────────────────┘  └─────────────────────────────────┘  └──────────────────────────────┘  │  │
│  │                                                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Server Actions Layer (`src/app/actions/`)                                                      │  │  │
│  │  │ ├─ `authActions.ts`: `loginAction`, `logoutAction`, `getSessionUserAction`                     │  │  │
│  │  │ ├─ `eventActions.ts`: `createEventAction`, `updateEventAction`, `deleteEventAction`            │  │  │
│  │  │ ├─ `qrActions.ts`: `approveRegistration`, `processCheckIn`, `verifyOtp`, `bulkApprove`        │  │  │
│  │  │ └─ `importData.ts`: `processRegistrationImport` (Excel/CSV parser with group normalizer)       │  │  │
│  │  └────────────────────────────────────────────────┬───────────────────────────────────────────────┘  │  │
│  │                                                   │                                                     │
│  │  ┌────────────────────────────────────────────────▼───────────────────────────────────────────────┐  │  │
│  │  │ Core Services Layer (`src/lib/services/`)                                                      │  │  │
│  │  │ ├─ `authService.ts`: PBKDF2/scrypt hashing, session signing, rate-limiting                     │  │  │
│  │  │ ├─ `cryptoService.ts`: SECQR HMAC-SHA256 generation & timing-safe verification                │  │  │
│  │  │ ├─ `checkInService.ts`: Atomic check-in pipeline, single-use validation, duplicate alerts      │  │  │
│  │  │ ├─ `emailService.ts`: Branded ticket generation and dispatch via Resend SDK                   │  │  │
│  │  │ └─ `qrService.ts`: Matrix QR code buffer & data URL generation                                │  │  │
│  │  └────────────────────────────────────────────────┬───────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┼──────────────────────────────────────────────────┘  │
│                                                      │                                                     │
│                                                      ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Dual-Mode Persistence Layer (`src/lib/dataStore.ts`)                                                 │  │
│  │ ├─ Mode Evaluator: `isSupabaseLive()` (Validates `NEXT_PUBLIC_SUPABASE_URL` !== placeholder)         │  │
│  │ ├─ Auto-Failover: Primary Live Supabase ──► Fallback to Local JSON store on network drop            │  │
│  │ ├─ In-Memory Mutex / Concurrency Lock for Atomic File Writes                                        │  │
│  │ └─ Local Cache Sync Pipeline                                                                        │  │
│  └───────────────────────────┬──────────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┘
                               │                                      │
                     Primary Network Mode                    Offline / Fallback Mode
                               │                                      │
                               ▼                                      ▼
                ┌───────────────────────────────┐      ┌───────────────────────────────┐
                │     SUPABASE POSTGRESQL       │      │       LOCAL JSON STORE        │
                │  - `events`                   │      │     `data/events-data.json`   │
                │  - `event_tracks`             │      │  - Events array               │
                │  - `registrations`            │      │  - Registrations/Teams array  │
                │  - `groups`                   │      │  - Audit logs buffer (2000 max│
                │  - `participants`             │      │  - File lock / Atomic rename  │
                │  - `check_ins`                │      └───────────────────────────────┘
                │  - `audit_logs`               │
                │  - `users`                    │
                │  - Row Level Security (RLS)   │
                └───────────────────────────────┘
```

#### 1.2 Component Topology & Architectural Decisions
- **Next.js 16 App Router (Turbopack)**: Utilizes Server Components (`RSC`) by default to eliminate client-side JavaScript overhead for data-heavy views (`dashboard`, `audit`). Client Components (`"use client"`) are restricted strictly to interactive leaf nodes (QR camera scanner using `html5-qrcode`, dynamic filter tables, modal dialogs).
- **React 19 Server Actions**: Mutations (`loginAction`, `approveRegistration`, `processCheckIn`) execute exclusively through Server Actions over standard HTTP POST. This guarantees database credentials, service role keys, and cryptographic secrets never cross into client JavaScript bundles.
- **Tailwind CSS v4 & Shadcn/ui**: Modern, accessible UI primitives (`Dialog`, `Button`, `Card`, `Badge`, `Input`, `Select`, `Table`) with zero runtime styling overhead. Clean dark/light theme support via `next-themes`.
- **Domain Entity Generalization**: In compliance with `GEMINI.md` and `PROJECT.md`, domain models avoid gaming-specific terms. The hierarchy follows:
  - `events` ──(1:N)──► `event_tracks` ──(1:N)──► `groups` ──(1:N)──► `participants`
  - `registrations` acts as the financial/application root tracking payment status, approval, and QR issuance.

---

### Section 2: Dual-Mode Data Persistence Architecture

The system implements a resilient **Dual-Mode Persistence Architecture** designed to survive complete venue internet blackout without interrupting attendee flow at physical verification gates.

#### 2.1 Mode Topology & Selection Strategy

```
                                      Incoming Read / Write
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ isSupabaseLive()?     │
                                    └───────────┬───────────┘
                                                │
                       ┌────────────────────────┴────────────────────────┐
                 YES (Live DB)                                     NO (Offline)
                       │                                                 │
                       ▼                                                 ▼
          ┌───────────────────────────┐                    ┌───────────────────────────┐
          │ Execute Supabase Query    │                    │ Read/Write Local Store    │
          │ (PostgreSQL Pool via RLS) │                    │ (`data/events-data.json`) │
          └────────────┬──────────────┘                    └─────────────┬─────────────┘
                       │                                                 │
              ┌────────┴────────┐                                        │
           SUCCESS           FAILURE (Network Drop)                      │
              │                 │                                        │
              ▼                 ▼                                        ▼
       Return Result    Fallback to Local Store                     Return Result
                        Log Warning to Console
```

- **Primary Mode (Supabase PostgreSQL)**:
  - Triggered when `NEXT_PUBLIC_SUPABASE_URL` is configured with a valid host and `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is present.
  - Guarantees multi-terminal concurrency across distributed verification stations.
  - Enforces database-level constraints: `UNIQUE(registration_id)` in `check_ins` prevents race conditions between simultaneous scans.
- **Offline Fallback Mode (Local JSON Store)**:
  - Located at `data/events-data.json`.
  - Automatically activates if:
    1. Supabase environment variables are missing or set to `https://placeholder.supabase.co`.
    2. Network timeout or connection drop occurs during query execution.
  - Thread-Safe Atomic Persistence: Uses synchronous staging writes (`events-data.json.tmp`) followed by atomic rename (`fs.renameSync`) or an in-memory execution queue to eliminate file corruption risks on Windows filesystem.

#### 2.2 Data Synchronization & Conflict Resolution
1. **Bootstrap Pre-Caching**: Prior to event opening, the administrator triggers "Sync Cache to Offline Store", populating `data/events-data.json` with the latest approved roster and pre-signed SECQR tokens.
2. **Offline Check-in Queue**: Check-ins performed during an outage are stamped with `{ method: "OFFLINE_FALLBACK", timestamp: ISO, sync_status: "PENDING_SYNC" }`.
3. **Reconnection Reconciliation**: Upon network restoration, an administrative reconciliation script scans local check-ins and pushes batch insertions to Supabase PostgreSQL using `ON CONFLICT (registration_id) DO NOTHING`. Any conflicting timestamps trigger an audit alert for manual supervisor review.

---

### Section 3: Authentication & Session Lifecycle Architecture

#### 3.1 Salted Cryptographic Password Hashing
To remediate the critical vulnerability of plaintext credentials (`admin123`, `volunteer123`), the platform implements cryptographic password hashing:
- **Primary Algorithm**: PBKDF2 with HMAC-SHA512:
  - Iterations: `100,000` minimum.
  - Salt: 16 bytes (128 bits) of cryptographically secure pseudo-random entropy generated via `crypto.randomBytes(16).toString("hex")`.
  - Key Length: 64 bytes (512 bits).
  - Storage Format: `pbkdf2:sha512:100000:<salt_hex>:<hash_hex>`.
- **Alternative / Scrypt Option**: Node.js native `crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })`.
- **Constant-Time Verification**: Password hashes are compared using `crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(storedHash, "hex"))` to defend against timing side-channel attacks.
- **Zero Credential Exposure**: Password hashes and salts are stripped before returning user objects to callers or serializing to sessions.

#### 3.2 Secure Session Token Architecture
Replaces raw JSON cookies (`JSON.stringify(user)`) with signed, tamper-evident session tokens.
- **Session Token Format**: HMAC-SHA256 signed compound token:
  ```
  <base64UrlPayload>.<hmacSignature>
  ```
  Where `payload` contains:
  ```json
  {
    "userId": "usr-admin-1",
    "email": "admin@eventportal.com",
    "fullName": "Alex Mercer",
    "role": "ADMIN",
    "issuedAt": 1728921600,
    "expiresAt": 1729526400
  }
  ```
- **Signing Secret**: `process.env.SESSION_SECRET` (minimum 32 characters / 256 bits of high entropy).
- **Cookie Security Attributes**:
  - `Name`: `event_auth_session`
  - `HttpOnly`: `true` (blocks client-side JavaScript XSS access)
  - `Secure`: `process.env.NODE_ENV === "production"` (enforces HTTPS)
  - `SameSite`: `"lax"` (protects against CSRF on state-mutating requests)
  - `Path`: `"/"`
  - `Max-Age`: 604,800 seconds (7 days)

#### 3.3 Brute-Force Rate Limiting Architecture
Protects `/` (login) and `loginAction` against credential stuffing and password-guessing attacks:
- **Limiter Topology**: Sliding window in-memory cache keyed by `${clientIp}:${email}`.
- **Policy Rules**:
  - Threshold: Maximum `5` failed authentication attempts within a `15-minute` rolling window.
  - Exceeded Behavior: Returns HTTP 429 / `{ success: false, error: "Too many failed attempts. Account locked for 15 minutes." }`.
  - Telemetry: Triggers an immediate audit log entry: `action: "LOGIN_BRUTE_FORCE_LOCKOUT", severity: "CRITICAL"`.

---

### Section 4: Role-Based Access Control (RBAC) & API Protection Architecture

The platform enforces a **Defense-in-Depth** model spanning three tiers:
1. **Edge Middleware (`src/middleware.ts`)**: Intercepts requests before Next.js page rendering or route handler execution.
2. **Server Action Authorization Guards (`requireAuth`)**: Server-side programmatic validation inside every mutation.
3. **REST API Route Protection**: Direct authorization checks in `/api/*` endpoints.

#### 4.1 RBAC Permission Matrix

| Resource / Action | ADMIN | VOLUNTEER | PUBLIC / ANONYMOUS | Enforcement Layer |
|---|:---:|:---:|:---:|---|
| Login Portal (`/`) | Allowed | Allowed | Allowed | Public |
| Admin Hub (`/events`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Middleware |
| Event Dashboard (`/events/[id]/dashboard`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Middleware |
| Registrations & Payment Review | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Middleware |
| Audit Logs (`/events/[id]/audit`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Middleware |
| Scanner View (`/scan`) | **Allowed** | **Allowed** | **Redirect (`/`)** | Middleware |
| Gate Roster Lookup (`/scan/teams`) | **Allowed** | **Allowed** | **Redirect (`/`)** | Middleware |
| Event CRUD Mutations (`eventActions.ts`) | **Allowed** | **Blocked (Error)** | **Blocked (Error)** | Server Action Guard |
| Payment Approval (`approveRegistration`) | **Allowed** | **Blocked (Error)** | **Blocked (Error)** | Server Action Guard |
| Gate Check-in (`processCheckIn`) | **Allowed** | **Allowed** | **Blocked (Error)** | Server Action Guard |
| `GET /api/export` (Full Roster CSV) | **Allowed** | **403 Forbidden** | **401 Unauthorized** | Route Guard |
| `POST /api/checkin` | **Allowed** | **Allowed** | **401 Unauthorized** | Route Guard |
| `GET /api/teams` | **Allowed** | **Allowed (Sanitized)**| **401 Unauthorized** | Route Guard |
| `POST /api/import` | **Allowed** | **403 Forbidden** | **401 Unauthorized** | Route Guard |

#### 4.2 Attendee PII Shielding Specification
Attendee Personally Identifiable Information (PII) includes:
- Legal Full Name
- Primary Email Address
- Mobile / WhatsApp Phone Number
- College / Student ID / Enrollment Identifier
- Payment Proof Screenshot Image

**Shielding Rules**:
- **Anonymous Requests**: Never receive attendee data under any circumstance.
- **Volunteer Accounts**: Gate lookup endpoints (`/scan/teams`, `/api/teams`) return only operational verification fields (`group_name`, `participant_names`, `track`, `check_in_status`). Mobile numbers and personal emails are redacted (e.g. `j****@example.com`, `+1 ***-***-8901`).
- **Admin Accounts**: Access full unmasked records for dispute resolution and emergency contact.

---

### Section 5: Cryptographic Gate Verification Architecture (SECQR)

#### 5.1 SECQR Payload Specification
To eliminate pass counterfeiting and QR forgery, digital entry passes use HMAC-SHA256 authenticated signatures.

```
SECQR:<Base64UrlEncodedJSON>
```

**JSON Structure**:
```json
{
  "v": 1,
  "tid": "reg-94820f4b-8e12-4d2a-bc91",
  "eid": "ev-1",
  "tok": "9f8a2b1c-3d4e-5f6a-7b8c-9d0e1f2a3b4c",
  "exp": 1792166400,
  "sig": "4a7b9c2d1e0f3a5b6c8d7e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"
}
```

- `v` (Integer): Payload schema version (current: `1`).
- `tid` (String): Target Registration ID or Group ID.
- `eid` (String): Event ID to prevent pass reuse across different events.
- `tok` (String): Cryptographically random UUIDv4 token nonce.
- `exp` (Integer): UNIX timestamp (seconds) after which pass becomes invalid.
- `sig` (String): 64-character hex HMAC-SHA256 signature generated over the string:
  `${tid}:${eid}:${tok}:${exp}` using secret `QR_HMAC_SECRET`.

#### 5.2 Verification Pipeline & Constant-Time Comparison
When scanned by a volunteer camera or mobile terminal:
1. **Prefix Validation**: Must start with `SECQR:`. If not, verification rejects immediately (the legacy raw-token bypass is completely eliminated).
2. **Payload Decoding**: Base64 decode and JSON parse with strict type validation.
3. **Cryptographic Integrity**: Recompute expected signature using `crypto.createHmac("sha256", process.env.QR_HMAC_SECRET)`. Compare with embedded `sig` using `crypto.timingSafeEqual`:
   ```typescript
   const expectedBuffer = Buffer.from(expectedSig, "hex");
   const receivedBuffer = Buffer.from(payload.sig, "hex");
   if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
     // Tampering detected: Reject immediately and log CRITICAL violation
   }
   ```
4. **Temporal Validity**: If `Math.floor(Date.now() / 1000) > payload.exp`, reject pass as expired (`isExpired: true`).
5. **Registration & Payment State**: Validate that registration status is `APPROVED` and payment is `VERIFIED`. Passes marked `PENDING_REVIEW` or `REJECTED` are denied entry.

#### 5.3 Atomic Single-Use Check-In Invariant
- Admission is strictly single-use.
- **Database Level**: In Supabase PostgreSQL, `check_ins` table enforces `UNIQUE(registration_id)`. The check-in execution executes inside a serializable transaction:
  ```sql
  INSERT INTO check_ins (registration_id, event_id, volunteer_id, timestamp, method)
  VALUES ($1, $2, $3, NOW(), 'QR_CAMERA_SCAN');
  ```
- **Duplicate Interception**: If an entry already exists for `registration_id`, the transaction fails with constraint violation:
  - System increments `scan_count`.
  - Emits red audible warning tone and physical haptic vibration on volunteer device.
  - Displays prior check-in metadata: `"Already checked in at 10:14 AM by Volunteer Jordan Lee"`.
  - Records an immutable security audit entry: `action: "CHECK_IN_DUPLICATE_ATTEMPT", severity: "CRITICAL"`.

#### 5.4 On-Spot Gate OTP Fallback Protocol
For attendees with broken smartphone screens, depleted batteries, or camera hardware failures:
1. Attendee provides registered email or phone to volunteer.
2. Volunteer initiates "Generate Gate OTP" action.
3. System creates a 6-digit numeric OTP (`crypto.randomInt(100000, 1000000).toString()`) with a strict `10-minute` expiration.
4. OTP is dispatched via Resend email to attendee's inbox (or displayed to supervisor).
5. Volunteer enters the code at the gate.
6. Rate Limiting: Maximum `4` verification attempts allowed. On the 4th failure, the code is locked (`otp_locked = true`), and a `CHECK_IN_OTP_LOCKOUT` audit entry is created.

---

### Section 6: Offline & Venue Disaster Recovery Architecture

Physical venues frequently suffer wireless congestion, captive portal timeouts, or total ISP fiber cuts. The platform deploys a three-tier disaster recovery architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DISASTER RECOVERY TIERS                         │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Local Document Store Fallback (`data/events-data.json`)        │
│ ├─ Zero network latency; runs locally on on-premise admin laptop.       │
│ └─ Synchronous atomic file writes survive sudden process crash.        │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Offline Encrypted CSV Roster Export                            │
│ ├─ Generated via `/api/export?format=csv` prior to gate opening.       │
│ ├─ Downloaded to volunteer tablets / mobile devices.                   │
│ └─ Searchable offline via local spreadsheet reader.                    │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Hardcopy Printable Emergency Attendance Roster                 │
│ ├─ Formatted with print media CSS (`@media print`).                    │
│ ├─ Alphabetical sort, group indexing, manual check-in signature boxes. │
│ └─ Zero electricity or battery requirement.                            │
└────────────────────────────────────────────────────────────────────────┘
```

#### 6.1 Printable Roster Media Styling
- Clean tabular layout optimized for standard A4 and US Letter printing.
- Suppresses dark mode backgrounds, sidebars, headers, and navigation controls (`@media print { .no-print { display: none !important; } }`).
- Includes physical verification checkboxes: `[ ] ID Verified`, `[ ] Badge Issued`, `[ ] Present Signature`.
```

---

## Part 2: Comprehensive Blueprint for `.env.example`

Below is the complete, fully annotated template for `.env.example`. It covers every environment variable required across all system layers, documents default development values, warns against insecure fallbacks, and details exact shell commands to generate cryptographically secure keys.

```bash
# ==============================================================================
# UNIVERSAL EVENT REGISTRATION & QR CHECK-IN SYSTEM
# ENVIRONMENT CONFIGURATION TEMPLATE (.env.example)
# ==============================================================================
# Instructions:
# 1. Copy this file to '.env.local' for local development:
#      cp .env.example .env.local
# 2. Populate real production secrets before deploying to Vercel/production.
# 3. NEVER commit '.env.local' or live credentials into source control!
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. RUNTIME & HOST CONFIGURATION
# ------------------------------------------------------------------------------
# Runtime environment: 'development', 'production', or 'test'
NODE_ENV=development

# Canonical application URL used for email links and CORS validation
# In local development: http://localhost:3000
# In production: https://events.yourdomain.com
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ------------------------------------------------------------------------------
# 2. SUPABASE POSTGRESQL & STORAGE CONFIGURATION
# ------------------------------------------------------------------------------
# The Supabase Project URL found in your Supabase Project Settings -> API.
# Note: Leaving as 'https://placeholder.supabase.co' will instruct the application
# to automatically run in Offline Fallback Mode using 'data/events-data.json'.
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co

# Supabase Anonymous Public API Key (safe for client-side queries protected by RLS)
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key-replace-with-real-supabase-key

# Supabase Service Role Key (CONFIDENTIAL - SERVER-SIDE ONLY)
# Used exclusively within Server Actions / background sync tasks to bypass RLS
# for administrative audits and system logging. NEVER expose to NEXT_PUBLIC_*!
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key-never-expose-to-browser

# Name of the Supabase Storage bucket for attendee payment receipt screenshots
SUPABASE_STORAGE_BUCKET_PAYMENTS=payment-proofs

# ------------------------------------------------------------------------------
# 3. AUTHENTICATION & SESSION SECURITY (R2 & R3)
# ------------------------------------------------------------------------------
# Master secret used to sign and verify HTTP-only session cookies (HMAC-SHA256).
# Must be at least 32 characters (256 bits) of cryptographically random entropy.
# Generate a secure key in PowerShell:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=e4c83b8a129ef3c09b2e5a7d6f1a8c4e2b0d9f8e7a6c5b4d3e2f1a0b9c8d7e6f

# Maximum session lifespan in days before re-authentication is required (Default: 7)
SESSION_MAX_AGE_DAYS=7

# Sliding-window brute force login rate limit: maximum failed attempts per IP/account
RATE_LIMIT_MAX_ATTEMPTS=5

# Brute force lockout evaluation window in minutes (Default: 15)
RATE_LIMIT_WINDOW_MINUTES=15

# ------------------------------------------------------------------------------
# 4. CRYPTOGRAPHIC GATE VERIFICATION (SECQR) (R5)
# ------------------------------------------------------------------------------
# Secret key used to generate and verify HMAC-SHA256 signatures on SECQR passes.
# CRITICAL: Changing this secret invalidates all previously issued entry passes!
# Generate a secure key in PowerShell:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
QR_HMAC_SECRET=c2b9a1d4e7f03a6b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b

# Default expiration lifespan for issued QR passes in hours (Default: 48)
QR_EXPIRATION_HOURS=48

# Gate emergency OTP validity window in minutes (Default: 10)
OTP_VALIDITY_MINUTES=10

# Maximum permitted incorrect OTP entry attempts before lockout (Default: 4)
OTP_MAX_ATTEMPTS=4

# ------------------------------------------------------------------------------
# 5. EMAIL COMMUNICATIONS & TICKET DISPATCH (RESEND)
# ------------------------------------------------------------------------------
# Resend API Key for dispatching digital QR tickets and gate OTP codes.
# Obtain from https://resend.com/api-keys
# If left empty, emailService operates in SIMULATION MODE and logs emails to console.
RESEND_API_KEY=re_123456789_abcdefghijklmnopqrstuvwxyz

# Verified sender email address registered with Resend
RESEND_FROM_EMAIL="Event Entry Portal <onboarding@resend.dev>"

# ------------------------------------------------------------------------------
# 6. VENUE LOCAL DATASTORE & LOGGING
# ------------------------------------------------------------------------------
# Path to local JSON store relative to project root (used for offline fallback)
LOCAL_DATA_STORE_PATH=data/events-data.json

# Maximum number of audit log records retained in local JSON storage (Default: 2000)
MAX_LOCAL_AUDIT_LOGS=2000
```

---

## Part 3: Environment Variable Reference Matrix

To ensure downstream developers understand the exact validation, type, and fallback behavior of each variable, the following matrix serves as the authoritative reference:

| Variable Name | Type | Scope | Required in Prod? | Default / Fallback | Sensitivity | Used By |
|---|---|---|:---:|---|---|---|
| `NODE_ENV` | String | Server/Client | Yes | `development` | Low | Next.js, Cookie flags (`secure`) |
| `NEXT_PUBLIC_APP_URL` | URL | Server/Client | Yes | `http://localhost:3000` | Low | Email links, metadata, CORS |
| `NEXT_PUBLIC_SUPABASE_URL` | URL | Server/Client | Yes | `https://placeholder.supabase.co` | Low | `supabase.ts`, `dataStore.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | String | Server/Client | Yes | `placeholder-key` | Medium | `supabase.ts` (Client queries) |
| `SUPABASE_SERVICE_ROLE_KEY` | String | Server Only | Optional | `undefined` | **CRITICAL** | Background sync, administrative tasks |
| `SUPABASE_STORAGE_BUCKET_PAYMENTS`| String | Server Only | Yes | `payment-proofs` | Low | Payment screenshot uploads |
| `SESSION_SECRET` | String (Hex/Base64)| Server Only | **YES** | Throws error in Prod | **CRITICAL** | `authService.ts`, `middleware.ts` |
| `SESSION_MAX_AGE_DAYS` | Integer | Server Only | No | `7` | Low | `authService.ts` cookie expiration |
| `RATE_LIMIT_MAX_ATTEMPTS` | Integer | Server Only | No | `5` | Low | `authService.ts` brute-force limiter |
| `RATE_LIMIT_WINDOW_MINUTES` | Integer | Server Only | No | `15` | Low | `authService.ts` brute-force window |
| `QR_HMAC_SECRET` | String (Hex/Base64)| Server Only | **YES** | Throws error in Prod | **CRITICAL** | `cryptoService.ts`, `qrActions.ts` |
| `QR_EXPIRATION_HOURS` | Integer | Server Only | No | `48` | Low | `cryptoService.ts` token lifespan |
| `OTP_VALIDITY_MINUTES` | Integer | Server Only | No | `10` | Low | `dataStore.ts`, `qrActions.ts` |
| `OTP_MAX_ATTEMPTS` | Integer | Server Only | No | `4` | Low | `dataStore.ts` OTP lockout |
| `RESEND_API_KEY` | String | Server Only | No | Simulation Mode | High | `emailService.ts` |
| `RESEND_FROM_EMAIL` | String | Server Only | No | `onboarding@resend.dev` | Low | `emailService.ts` |
| `LOCAL_DATA_STORE_PATH` | Path String | Server Only | No | `data/events-data.json` | Low | `dataStore.ts` offline store |
| `MAX_LOCAL_AUDIT_LOGS` | Integer | Server Only | No | `2000` | Low | `dataStore.ts` audit rotation |

---

## Part 4: Implementation Guidance for Downstream Milestone Agents

### 4.1 Deliverable Target Mapping
- **Milestone 1 Author Agent (`author_m1_1`)**:
  - Incorporate Part 1 verbatim or adapted into `docs/ARCHITECTURE.md`.
  - Reconcile `docs/ARCHITECTURE.md` with `docs/PROJECT_AUDIT.md`, `docs/SECURITY.md`, `docs/DATABASE_SCHEMA.md`, and `docs/IMPLEMENTATION_PLAN.md`.
  - Write Part 2 directly into root `.env.example`.
- **Milestone 2 Implementer (Authentication & Account Lifecycle)**:
  - Reference Section 3 for PBKDF2/scrypt implementation, constant-time verification, HMAC session signing, and sliding-window brute-force rate limiter in `src/lib/services/authService.ts` and `src/app/actions/authActions.ts`.
- **Milestone 3 Implementer (RBAC & Route Protection)**:
  - Reference Section 4 for Edge Middleware in `src/middleware.ts` and route protection in `src/app/api/*`.
- **Milestone 4 Implementer (Database Schema Realignment)**:
  - Reference Section 2 for dual-mode persistence in `src/lib/dataStore.ts` and `schema.sql`.
- **Milestone 5 Implementer (Gate Verification & Offline Roster)**:
  - Reference Section 5 for SECQR payload verification and atomic check-ins, and Section 6 for offline CSV and printable roster export.
- **Milestone 6 Implementer (Quality & Tests)**:
  - Author Vitest unit tests verifying that missing or invalid `SESSION_SECRET` or `QR_HMAC_SECRET` behave according to the documented failure modes.

---

## Conclusion
The architecture blueprint and environment configuration specified herein resolve all foundational architectural ambiguities, eliminate hardcoded security vulnerabilities, and provide a clear specification for production-ready implementation across all subsequent milestones.
