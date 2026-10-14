# System Architecture Specification
## Universal Event Registration & QR Check-in System

**Document Version:** 1.0.0  
**Status:** Approved Architectural Specification  
**Target Runtime:** Next.js 16.4.0 (Turbopack, App Router), React 19.3.0, Node.js 20+ / 24 LTS  
**Primary Persistence:** Supabase (PostgreSQL 15+) with Row-Level Security (RLS)  
**Offline Fallback Persistence:** Local JSON Document Store (`data/events-data.json`)  
**Styling & UI Primitives:** Tailwind CSS v4, Shadcn/ui Primitives, Lucide Icons  

---

## 1. High-Level Architecture & Component Topology

### 1.1 Architecture Topology Diagram

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
│ NEXT.JS 16 APPSERVER & EDGE RUNTIME LAYER                                                                  │
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

### 1.2 Core Architectural Principles & Decisions
- **Next.js 16 App Router & React Server Components (RSC):** RSC is used by default across data-heavy administrative views (`dashboard`, `audit`, `registrations`) to eliminate unnecessary client-side JavaScript execution and prevent credentials or database keys from leaking to client bundles. Client Components (`"use client"`) are restricted to interactive leaves (e.g. camera stream processing using `html5-qrcode`, dynamic modal dialogs, and real-time search filters).
- **Server Actions for State Mutations:** State mutations (`loginAction`, `approveRegistration`, `processCheckIn`) execute exclusively as Next.js Server Actions over standard HTTP POST. This guarantees that cryptographic hashing, signature generation, and database interactions occur entirely within the server execution context.
- **Tailwind CSS v4 & Shadcn/ui:** Design implementation uses accessible Shadcn primitives (`Dialog`, `Button`, `Card`, `Badge`, `Input`, `Select`, `Table`) with modern utility-first CSS styling, maintaining strict consistency across administrative dashboards and mobile gate interfaces.
- **Domain Generalization:** In strict alignment with `GEMINI.md`, the platform abandons gaming-specific conventions (e.g. `ign`, `teams`) in favor of generalized entities: `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and `audit_logs`.

---

## 2. Dual-Mode Data Persistence Architecture

The system implements a resilient **Dual-Mode Persistence Architecture** designed to ensure zero operational interruption during large-scale physical events, where venue Wi-Fi or cellular connections may degrade or disconnect completely.

### 2.1 Mode Topology & Decision Flow

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

- **Primary Mode (Supabase PostgreSQL 15+):**
  - Activated when `NEXT_PUBLIC_SUPABASE_URL` is configured to a valid host and `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is available.
  - Supports multi-station concurrent reads and writes across dozens of volunteer gate scanners.
  - Enforces database-level foreign key cascades, partial unique indexes (`idx_registrations_qr_token`), and strict constraints (`UNIQUE(registration_id)` in `check_ins`) to eliminate race conditions between concurrent scans.
- **Offline Fallback Mode (Local JSON Document Store):**
  - Located at `data/events-data.json`.
  - Automatically activated if:
    1. Supabase environment variables are missing or set to the default placeholder (`https://placeholder.supabase.co`).
    2. A database query encounters a network timeout, DNS resolution failure, or connection drop.
  - **Thread-Safe Atomic Persistence:** Local file writes are safeguarded using an in-memory execution queue combined with atomic file staging (`events-data.json.tmp` written and flushed, followed by atomic `fs.renameSync`) to eliminate corruption risks on Windows or POSIX filesystems during unexpected process termination.

### 2.2 Offline Synchronization & Conflict Resolution Protocol
1. **Pre-Event Roster Caching:** Prior to event gate opening, administrators trigger "Sync Offline Cache", creating a snapshot of all approved registrations, group mappings, and pre-signed SECQR tokens inside `data/events-data.json`.
2. **Offline Check-In Stamping:** Check-ins executed while in offline mode are tagged with `{ check_in_method: "QR_CAMERA_SCAN", sync_status: "PENDING_SYNC", offline_timestamp: ISO }`.
3. **Reconciliation on Recovery:** When connectivity is restored, the synchronization worker executes batch inserts to Supabase PostgreSQL using `INSERT INTO check_ins ... ON CONFLICT (registration_id) DO NOTHING`. If a conflicting scan exists across terminals, the earliest recorded timestamp is retained, and a `CHECK_IN_DUPLICATE_ATTEMPT` audit entry is flagged for administrative review.

---

## 3. Authentication & Session Lifecycle Architecture

### 3.1 Salted Cryptographic Password Hashing
To remediate the critical vulnerability of plaintext credentials (`admin123`, `volunteer123`), the platform implements cryptographic password hashing:
- **Primary Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2) using HMAC-SHA512:
  - Iteration count: `100,000` minimum.
  - Salt generation: 32 bytes (256 bits) of cryptographically secure random entropy via `crypto.randomBytes(32)` (64 hex characters).
  - Derived key length: 64 bytes (512 bits), hex-encoded.
  - Encoded storage format: `pbkdf2:sha512:100000:<salt_hex>:<hash_hex>`.
- **Alternative Algorithm:** `scrypt` (`N=16384, r=8, p=1`, key length 64 bytes).
- **Constant-Time Verification:** Hash comparisons use `crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(storedHash, "hex"))` to eliminate timing side-channel attacks.
- **Zero Exposure Guarantee:** Plaintext passwords and salts are never returned in API responses, server action results, or client session payloads.

### 3.2 Secure Signed Session Token Architecture
Replaces raw JSON cookies (`JSON.stringify(user)`) with signed, tamper-evident session tokens.
- **Token Structure:** Signed compound token:
  ```
  <base64UrlPayload>.<hmacSignature>
  ```
  Where `base64UrlPayload` decodes to:
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
- **Signature Computation:** `HMAC-SHA256(base64UrlPayload, process.env.SESSION_SECRET)`.
- **Cookie Attributes:**
  - `Name`: `event_auth_session`
  - `HttpOnly`: `true` (prevents JavaScript access via XSS)
  - `Secure`: `true` in production (`process.env.NODE_ENV === "production"`)
  - `SameSite`: `"lax"` (prevents CSRF on state-altering requests)
  - `Path`: `"/"`
  - `Max-Age`: 604,800 seconds (7 days for Admins; 24 hours for Volunteers)

### 3.3 Brute-Force Rate Limiting & Lockout Architecture
Protects `/` and `loginAction` against automated credential stuffing and brute-force dictionary attacks:
- **Limiter Topology:** Sliding-window in-memory cache keyed by composite identifier `${clientIp}:${email}`.
- **Threshold & Window:** Maximum `5` failed authentication attempts within a `15-minute` rolling window.
- **Lockout Action:** Exceeding the threshold rejects subsequent attempts with HTTP 429 `{ success: false, error: "Too many failed attempts. Account locked for 15 minutes." }`.
- **Telemetry:** Exceeding the threshold triggers an immediate high-priority audit event: `action: "AUTH_LOCKOUT", severity: "CRITICAL"`.

---

## 4. Role-Based Access Control (RBAC) & API Protection Architecture

The platform enforces a **3-Tier Defense-in-Depth** access control model:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        3-TIER RBAC DEFENSE                             │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Edge Middleware (`src/middleware.ts`)                          │
│ ├─ Intercepts requests before page compilation or route handler run.   │
│ └─ Validates signed session cookie; handles unauth & role redirection. │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Server Action Authorization Guards (`requireAuth`)              │
│ ├─ Programmatic guard at the top of every Server Action function.      │
│ └─ Throws error or returns failure envelope if session role is invalid.│
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: REST API Route Guards (`requireApiAuth`)                       │
│ ├─ Route handler wrapper inspecting headers and cookies.               │
│ └─ Returns HTTP 401 Unauthorized or HTTP 403 Forbidden envelopes.     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 RBAC Permission Matrix

| Resource / Endpoint | ADMIN | VOLUNTEER | PUBLIC / ANONYMOUS | Enforcement Layer |
|---|:---:|:---:|:---:|---|
| Login Portal (`/`) | Allowed | Allowed | Allowed | Public Route |
| Admin Hub (`/events`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Edge Middleware |
| Event Dashboard (`/events/[id]/dashboard`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Edge Middleware |
| Registrations & Payment Review | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Edge Middleware |
| Audit Logs (`/events/[id]/audit`) | **Allowed** | **Redirect (`/scan`)** | **Redirect (`/`)** | Edge Middleware |
| Scanner View (`/scan`) | **Allowed** | **Allowed** | **Redirect (`/`)** | Edge Middleware |
| Gate Roster Lookup (`/scan/teams`) | **Allowed** | **Allowed** | **Redirect (`/`)** | Edge Middleware |
| Event CRUD Mutations (`eventActions.ts`) | **Allowed** | **Blocked (Error)** | **Blocked (Error)** | Server Action Guard |
| Payment Approval (`approveRegistration`) | **Allowed** | **Blocked (Error)** | **Blocked (Error)** | Server Action Guard |
| Gate Check-in (`processCheckIn`) | **Allowed** | **Allowed** | **Blocked (Error)** | Server Action Guard |
| `GET /api/export` (Full Roster CSV) | **Allowed** | **403 Forbidden** | **401 Unauthorized** | REST Route Guard |
| `POST /api/checkin` | **Allowed** | **Allowed** | **401 Unauthorized** | REST Route Guard |
| `GET /api/teams` | **Allowed** | **Allowed (Sanitized)**| **401 Unauthorized** | REST Route Guard |
| `POST /api/import` | **Allowed** | **403 Forbidden** | **401 Unauthorized** | REST Route Guard |

### 4.2 Attendee PII Shielding Specification
Attendee Personally Identifiable Information (PII) encompasses:
- Full legal names and academic roll numbers / identifiers
- Mobile / WhatsApp contact numbers
- Personal and institutional email addresses
- Payment transaction receipts and screenshots

**Shielding Enforcement:**
1. **Public/Anonymous Access:** Zero access. All endpoints exposing attendee data require authenticated sessions.
2. **Volunteer Gate Roster View (`/scan/teams`, `/api/teams`):** Contact numbers and emails are masked (e.g. `j***@example.com`, `+1 ***-***-8901`). Only operational verification data (`group_name`, `participant_names`, `track`, `check_in_status`) is visible.
3. **Admin Roster View & CSV Export:** Unmasked PII is restricted strictly to users with verified `ADMIN` role.

---

## 5. Cryptographic Gate Verification Architecture (SECQR)

### 5.1 SECQR Token Specification
To prevent counterfeit ticket generation, pass alteration, and barcode replay attacks, admission tickets utilize HMAC-SHA256 authenticated digital signatures.

**Format:**
```
SECQR:<Base64UrlEncodedJSONPayload>
```

**Decoded JSON Structure:**
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
- `eid` (String): Event ID (binds the pass strictly to a specific event).
- `tok` (String): Cryptographically secure random UUIDv4 nonce.
- `exp` (Integer): UNIX timestamp (seconds) marking pass expiration.
- `sig` (String): 64-character hex HMAC-SHA256 signature generated over `${tid}:${eid}:${tok}:${exp}` using secret `QR_HMAC_SECRET`.

### 5.2 Verification Pipeline & Constant-Time Comparison
When a barcode is captured by a gate camera or handheld scanner:
1. **Header Validation:** The string must begin with `SECQR:`. Any string without this prefix is immediately rejected (`valid: false`, `tamperDetected: true`). The legacy non-SECQR bypass is completely eliminated.
2. **Base64 Decoding & Schema Parsing:** Decoded into JSON. If parsing fails, pass is rejected as malformed.
3. **Cryptographic Signature Verification:** The expected signature is computed using `crypto.createHmac("sha256", process.env.QR_HMAC_SECRET)`. Signatures are compared using constant-time evaluation:
   ```typescript
   const sigBuf = Buffer.from(payload.sig, "hex");
   const expSigBuf = Buffer.from(expectedSig, "hex");
   if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
     // Tampering detected: reject immediately and log critical security alert
   }
   ```
4. **Expiration Check:** Verify `Math.floor(Date.now() / 1000) <= payload.exp`. Expired passes are denied entry.
5. **Registration & Financial State Validation:** Ensure the registration status is `APPROVED` and payment is `VERIFIED`.

### 5.3 Atomic Single-Use Check-In Invariant
Admission is strictly single-use.
- **Database Level:** In Supabase PostgreSQL, the `check_ins` table enforces `UNIQUE(registration_id)`. The check-in execution executes inside a serializable transaction:
  ```sql
  INSERT INTO check_ins (registration_id, event_id, volunteer_id, timestamp, method)
  VALUES ($1, $2, $3, NOW(), 'QR_CAMERA_SCAN');
  ```
- **Duplicate Interception:** If an entry already exists for `registration_id`, the transaction fails with constraint violation:
  - System increments `scan_count`.
  - Emits red audible warning tone and physical haptic vibration on volunteer device.
  - Displays prior check-in metadata: `"Already checked in at 10:14 AM by Volunteer Jordan Lee"`.
  - Records an immutable security audit entry: `action: "CHECK_IN_DUPLICATE_ATTEMPT", severity: "CRITICAL"`.

### 5.4 On-Spot Gate OTP Fallback Protocol
For attendees with broken smartphone screens, depleted batteries, or camera hardware failures:
1. Attendee provides registered email or phone to volunteer.
2. Volunteer initiates "Generate Gate OTP" action.
3. System creates a 6-digit numeric OTP (`crypto.randomInt(100000, 1000000).toString()`) with a strict `10-minute` expiration.
4. OTP is dispatched via Resend email to attendee's inbox (or displayed to supervisor).
5. Volunteer enters the code at the gate.
6. Rate Limiting: Maximum `4` verification attempts allowed. On the 4th failure, the code is locked (`otp_locked = true`), and a `CHECK_IN_OTP_LOCKOUT` audit entry is created.

---

## 6. Offline & Venue Disaster Recovery Architecture

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

### 6.1 Printable Roster Media Styling
- Clean tabular layout optimized for standard A4 and US Letter printing.
- Suppresses dark mode backgrounds, sidebars, headers, and navigation controls (`@media print { .no-print { display: none !important; } }`).
- Includes physical verification checkboxes: `[ ] ID Verified`, `[ ] Badge Issued`, `[ ] Present Signature`.
