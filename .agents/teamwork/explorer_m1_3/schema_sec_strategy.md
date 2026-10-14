# Comprehensive Database Schema & Security Strategy Blueprint

**Author:** `explorer_m1_3`  
**Timestamp:** 2026-10-14T16:08:00Z  
**Target Documents:** `docs/DATABASE_SCHEMA.md` and `docs/SECURITY.md`  
**Related Requirements:** R1, R2, R3, R4, R5, R6 (from `ORIGINAL_REQUEST.md`)

---

## Executive Overview

This document provides the definitive blueprint and specification content for two core formal documentation deliverables required by Milestone 1:
1. **`docs/DATABASE_SCHEMA.md`**: The relational PostgreSQL data model for Supabase, complete DDL specifications, foreign keys, cascading constraints, unique indexes, JSONB column structures, Row-Level Security (RLS) policies, and the dual-mode schema mapping between PostgreSQL and the local JSON datastore (`data/events-data.json`).
2. **`docs/SECURITY.md`**: The formal threat model and STRIDE classification, salted cryptographic password hashing parameters, HMAC-SHA256 session token lifecycle, `SECQR:` HMAC token specification with constant-time verification, Next.js Edge Middleware RBAC architecture, PII shielding, and immutable audit telemetry invariants.

---

# SECTION 1: `docs/DATABASE_SCHEMA.md` Strategy & Specification

## 1.1 Architecture & Design Principles

The persistence layer is architected as a **Dual-Mode Resilient Data Engine**:
- **Primary Live Mode**: Supabase PostgreSQL 15+ utilizing PostgreSQL extensions (`uuid-ossp` or `pgcrypto`), strict foreign key constraints, partial unique indexes, Row-Level Security (RLS), and JSONB schema columns.
- **Offline Fallback Mode**: High-reliability local file store (`data/events-data.json`) providing zero-downtime operations during venue connectivity loss.

### Naming & Domain Generalization Principles
In accordance with `GEMINI.md` and `ORIGINAL_REQUEST.md` §R4, all entities use generalized event management nomenclature:
- Legacy `teams` is replaced by relational `groups` and `registrations`.
- Legacy `category` is replaced by `event_tracks`.
- Gaming-specific terms (e.g. IGN, matches) are generalized to `identifier`, `event_tracks`, and `participants`.

---

## 1.2 The 8 Generalized Relational Entities

Below is the complete, production-grade PostgreSQL DDL specification for all 8 entities.

```sql
-- PostgreSQL 15+ Schema for Universal Event Registration & QR Check-in System

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Enum Types
CREATE TYPE user_role AS ENUM ('ADMIN', 'VOLUNTEER');
CREATE TYPE registration_type AS ENUM ('INDIVIDUAL', 'GROUP');
CREATE TYPE registration_source AS ENUM ('ADVANCE', 'ON_SPOT');
CREATE TYPE registration_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE payment_status_type AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE check_in_status_type AS ENUM ('NOT_CHECKED_IN', 'CHECKED_IN');
CREATE TYPE check_in_method_type AS ENUM ('QR_CAMERA_SCAN', 'OTP_GATE_MATCH', 'MANUAL_OVERRIDE');
CREATE TYPE audit_severity_type AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE actor_role_type AS ENUM ('ADMIN', 'VOLUNTEER', 'SYSTEM');

--------------------------------------------------------------------------------
-- 1. USERS
--------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'VOLUNTEER',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique & Search Indexes for USERS
CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));
CREATE INDEX idx_users_role ON users (role);

COMMENT ON TABLE users IS 'System authentication principals and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex-encoded digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';

--------------------------------------------------------------------------------
-- 2. EVENTS
--------------------------------------------------------------------------------
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    overview TEXT,
    venue TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    thumbnail_url TEXT,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for EVENTS
CREATE INDEX idx_events_is_active_date ON events (is_active, date DESC);

COMMENT ON TABLE events IS 'High-level event gatherings, conventions, hackathons, or conferences.';

--------------------------------------------------------------------------------
-- 3. EVENT_TRACKS
--------------------------------------------------------------------------------
CREATE TABLE event_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_group_size INTEGER NOT NULL DEFAULT 1 CHECK (min_group_size >= 1),
    max_group_size INTEGER NOT NULL DEFAULT 1 CHECK (max_group_size >= min_group_size),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_event_track_name UNIQUE (event_id, name)
);

-- Indexes for EVENT_TRACKS
CREATE INDEX idx_event_tracks_event_id ON event_tracks (event_id);

COMMENT ON TABLE event_tracks IS 'Sub-divisions, competitive tracks, or categories within an event.';

--------------------------------------------------------------------------------
-- 4. REGISTRATIONS
--------------------------------------------------------------------------------
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    track_id UUID REFERENCES event_tracks(id) ON DELETE SET NULL,
    type registration_type NOT NULL DEFAULT 'INDIVIDUAL',
    source registration_source NOT NULL DEFAULT 'ADVANCE',
    status registration_status NOT NULL DEFAULT 'PENDING_REVIEW',
    email TEXT NOT NULL,
    phone TEXT,
    payment_screenshot_url TEXT,
    payment_status payment_status_type NOT NULL DEFAULT 'PENDING',
    payment_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    payment_reviewed_at TIMESTAMPTZ,
    payment_rejection_reason TEXT,
    qr_token TEXT,
    qr_expires_at TIMESTAMPTZ,
    qr_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    qr_email_sent_at TIMESTAMPTZ,
    check_in_status check_in_status_type NOT NULL DEFAULT 'NOT_CHECKED_IN',
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,
    first_scanned_at TIMESTAMPTZ,
    scan_count INTEGER NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
    otp_code TEXT,
    otp_generated_at TIMESTAMPTZ,
    otp_expires_at TIMESTAMPTZ,
    otp_attempts_left INTEGER NOT NULL DEFAULT 4 CHECK (otp_attempts_left >= 0),
    otp_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index & General Indexes for REGISTRATIONS
CREATE UNIQUE INDEX idx_registrations_qr_token ON registrations (qr_token) WHERE qr_token IS NOT NULL;
CREATE INDEX idx_registrations_event_status ON registrations (event_id, status);
CREATE INDEX idx_registrations_event_checkin ON registrations (event_id, check_in_status);
CREATE INDEX idx_registrations_email ON registrations (email);

COMMENT ON TABLE registrations IS 'Attendee application lifecycle, payment proof, QR token, and admission state.';

--------------------------------------------------------------------------------
-- 5. GROUPS
--------------------------------------------------------------------------------
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    track_id UUID REFERENCES event_tracks(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_groups_event_normalized_name UNIQUE (event_id, normalized_name)
);

-- Indexes for GROUPS
CREATE INDEX idx_groups_event_id ON groups (event_id);
CREATE INDEX idx_groups_registration_id ON groups (registration_id);

COMMENT ON TABLE groups IS 'Teams or cohorts associated with a group registration.';

--------------------------------------------------------------------------------
-- 6. PARTICIPANTS
--------------------------------------------------------------------------------
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile_number TEXT,
    course TEXT,
    year_of_study TEXT,
    semester TEXT,
    identifier TEXT, -- Student ID, Roll Number, or Badge Handle
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for PARTICIPANTS
CREATE INDEX idx_participants_registration_id ON participants (registration_id);
CREATE INDEX idx_participants_group_id ON participants (group_id);
CREATE INDEX idx_participants_event_id ON participants (event_id);
CREATE INDEX idx_participants_email ON participants (email);

COMMENT ON TABLE participants IS 'Individual human attendees associated with a registration/group.';

--------------------------------------------------------------------------------
-- 7. CHECK_INS
--------------------------------------------------------------------------------
CREATE TABLE check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    volunteer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    method check_in_method_type NOT NULL DEFAULT 'QR_CAMERA_SCAN',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_check_in_registration UNIQUE (registration_id)
);

-- Indexes for CHECK_INS
CREATE INDEX idx_checkins_event_timestamp ON check_ins (event_id, timestamp DESC);
CREATE INDEX idx_checkins_volunteer ON check_ins (volunteer_id);

COMMENT ON TABLE check_ins IS 'Atomic single-use admission audit record.';
COMMENT ON CONSTRAINT uq_check_in_registration ON check_ins IS 'Enforces database-level single-use pass invariant.';

--------------------------------------------------------------------------------
-- 8. AUDIT_LOGS
--------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action TEXT NOT NULL,
    severity audit_severity_type NOT NULL DEFAULT 'INFO',
    actor_id TEXT NOT NULL,
    actor_role actor_role_type NOT NULL DEFAULT 'SYSTEM',
    target_id TEXT,
    target_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for AUDIT_LOGS
CREATE INDEX idx_audit_logs_event_timestamp ON audit_logs (event_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action_severity ON audit_logs (action, severity);
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin (details);

COMMENT ON TABLE audit_logs IS 'Immutable security and administrative telemetry log.';
```

---

## 1.3 Entity Relationship Diagram (ERD)

```
       +-------------------+
       |       users       |
       +-------------------+
         ^       ^       ^
         |       |       | (reviewer / volunteer)
         |       |       |
+--------+-------+-------+---------------------------------------+
|                                                                |
|      +-------------------+                                     |
|      |      events       |<-----------------------------+      |
|      +-------------------+                              |      |
|        | 1           | 1                                |      |
|        |             |                                  |      |
|        | n           | n                                |      |
|      +-------------+ +-------------------+              |      |
|      |event_tracks | |   registrations   |<------+      |      |
|      +-------------+ +-------------------+       |      |      |
|             ^          | 1           | 1         |      |      |
|             |          |             |           |      |      |
|             |          | 1           | n         |      |      |
|             |        +-------+     +------------+|      |      |
|             +--------|groups |     |participants||      |      |
|             (track)  +-------+     +------------+|      |      |
|                        | 1               ^       |      |      |
|                        | n               |       |      |      |
|                        +-----------------+       |      |      |
|                                                  |      |      |
|                      +-------------------+       |      |      |
+--------------------->|     check_ins     |-------+      |      |
| (event_id)           +-------------------+ (unique)     |      |
|                                                         |      |
+--------------------->+-------------------+              |      |
                       |    audit_logs     |--------------+      |
                       +-------------------+                     |
```

---

## 1.4 Row-Level Security (RLS) Policies for Supabase

Row Level Security ensures multi-tenant data boundaries and prevents unauthorized access via Supabase Client SDKs.

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- Helper: Extract User Role from Supabase Auth JWT claims
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.current_user_role()
RETURNS user_role AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::user_role;
$$ LANGUAGE sql STABLE;

--------------------------------------------------------------------------------
-- RLS: USERS
--------------------------------------------------------------------------------
-- Admins have full access
CREATE POLICY p_users_admin ON users
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

-- Users can read their own profile
CREATE POLICY p_users_read_self ON users
    FOR SELECT TO authenticated
    USING (id = auth.uid());

--------------------------------------------------------------------------------
-- RLS: EVENTS & EVENT_TRACKS
--------------------------------------------------------------------------------
-- Anyone can view active events
CREATE POLICY p_events_public_read ON events
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

-- Admins can manage events
CREATE POLICY p_events_admin_all ON events
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

-- Event tracks public read
CREATE POLICY p_event_tracks_public_read ON event_tracks
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Event tracks admin manage
CREATE POLICY p_event_tracks_admin_all ON event_tracks
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

--------------------------------------------------------------------------------
-- RLS: REGISTRATIONS
--------------------------------------------------------------------------------
-- Public can submit registration (advance / on-spot)
CREATE POLICY p_registrations_insert_public ON registrations
    FOR INSERT TO anon, authenticated
    WITH CHECK (status = 'PENDING_REVIEW' AND payment_status = 'PENDING');

-- Admins have full access
CREATE POLICY p_registrations_admin_all ON registrations
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

-- Volunteers can read registrations for gate verification
CREATE POLICY p_registrations_volunteer_read ON registrations
    FOR SELECT TO authenticated
    USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

-- Volunteers can update check-in status during scan
CREATE POLICY p_registrations_volunteer_checkin ON registrations
    FOR UPDATE TO authenticated
    USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'))
    WITH CHECK (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

--------------------------------------------------------------------------------
-- RLS: GROUPS & PARTICIPANTS
--------------------------------------------------------------------------------
-- Public can insert groups/participants during registration
CREATE POLICY p_groups_insert_public ON groups FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
CREATE POLICY p_participants_insert_public ON participants FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

-- Admins have full access
CREATE POLICY p_groups_admin_all ON groups FOR ALL TO authenticated USING (auth.current_user_role() = 'ADMIN');
CREATE POLICY p_participants_admin_all ON participants FOR ALL TO authenticated USING (auth.current_user_role() = 'ADMIN');

-- Volunteers can view groups & participants at the gate
CREATE POLICY p_groups_volunteer_read ON groups FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));
CREATE POLICY p_participants_volunteer_read ON participants FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

--------------------------------------------------------------------------------
-- RLS: CHECK_INS
--------------------------------------------------------------------------------
-- Gate staff and admins can insert and read check-ins
CREATE POLICY p_checkins_read ON check_ins FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));
CREATE POLICY p_checkins_insert ON check_ins FOR INSERT TO authenticated WITH CHECK (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));
-- Disallow UPDATE and DELETE to ensure immutability
-- (Only admin via security definer function can reset check-in with audit log)

--------------------------------------------------------------------------------
-- RLS: AUDIT_LOGS
--------------------------------------------------------------------------------
-- Only Admins can view audit logs
CREATE POLICY p_audit_logs_admin_read ON audit_logs FOR SELECT TO authenticated USING (auth.current_user_role() = 'ADMIN');
-- Authenticated agents/system can insert audit logs
CREATE POLICY p_audit_logs_system_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (TRUE);
-- Nobody can update or delete audit logs
```

---

## 1.5 Dual-Mode Schema Mapping: PostgreSQL <-> Local JSON

The application operates in **Dual-Mode Persistence**:
- **Live Supabase PostgreSQL**: Multi-table normalized schema.
- **Offline / Local JSON Fallback (`data/events-data.json`)**: Document-oriented schema.

### Bidirectional Field & Entity Mapping Matrix

| PostgreSQL Relational Field | Local JSON Path (`data/events-data.json`) | Type Mapping & Notes |
|---|---|---|
| `events.id` | `events[i].id` | `string` (e.g. `"ev-1"` or UUID) |
| `events.name` | `events[i].name` | `string` |
| `events.description` | `events[i].description` | `string` |
| `events.overview` | `events[i].overview` | `string` |
| `events.venue` | `events[i].venue` | `string` |
| `events.date` | `events[i].date` | ISO 8601 string |
| `events.end_date` | `events[i].end_date` | ISO 8601 string |
| `events.thumbnail_url` | `events[i].thumbnail_url` | `string` |
| `events.is_active` | `events[i].is_active` | `boolean` |
| `event_tracks.name` | `teams[j].category` | Mapped to track name string |
| `groups.id` / `registrations.id` | `teams[j].id` | Unified identifier (`"tm-..."`) |
| `groups.name` | `teams[j].name` | `string` |
| `groups.normalized_name` | `teams[j].normalized_name` | Stripped lowercase string |
| `registrations.status` | `teams[j].status` | `"PENDING_REVIEW"` \| `"APPROVED"` \| `"REJECTED"` |
| `registrations.payment_screenshot_url` | `teams[j].payment_screenshot_url` | URL or asset path string |
| `registrations.payment_status` | `teams[j].payment_status` | `"PENDING"` \| `"VERIFIED"` \| `"REJECTED"` |
| `registrations.qr_token` | `teams[j].qr_token` | `string` (UUID or `SECQR:...`) |
| `registrations.qr_expires_at` | `teams[j].qr_expires_at` | ISO 8601 string |
| `registrations.qr_email_sent` | `teams[j].qr_email_sent` | `boolean` |
| `registrations.qr_email_sent_at` | `teams[j].qr_email_sent_at` | ISO 8601 string |
| `registrations.check_in_status` | `teams[j].check_in_status` | `"NOT_CHECKED_IN"` \| `"CHECKED_IN"` |
| `registrations.checked_in_at` | `teams[j].checked_in_at` | ISO 8601 string |
| `registrations.checked_in_by` | `teams[j].checked_in_by` | `string` (User ID / Volunteer ID) |
| `registrations.scan_count` | `teams[j].scan_count` | `number` (Default: 0) |
| `registrations.otp_code` | `teams[j].otp_code` | 6-digit numeric string |
| `registrations.otp_expires_at` | `teams[j].otp_expires_at` | ISO 8601 string |
| `registrations.otp_attempts_left`| `teams[j].otp_attempts_left`| `number` (Default: 4) |
| `registrations.otp_locked` | `teams[j].otp_locked` | `boolean` |
| `participants` (table rows) | `teams[j].participants[]` | Embedded array of participant objects |
| `participants.full_name` | `teams[j].participants[k].full_name` | `string` |
| `participants.email` | `teams[j].participants[k].email` | `string` |
| `participants.mobile_number` | `teams[j].participants[k].mobile_number` | `string` |
| `participants.course` | `teams[j].participants[k].course` | `string` |
| `participants.year_of_study` | `teams[j].participants[k].year_of_study` | `string` |
| `participants.semester` | `teams[j].participants[k].semester` | `string` |
| `participants.identifier` | `teams[j].participants[k].identifier` | `string` |
| `participants.is_leader` | `teams[j].participants[k].is_leader` | `boolean` |
| `check_ins` (table rows) | Embedded into `teams[j]` status | Recorded in `audit_logs` and team check-in fields |
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects |

### Resilience & Offline Sync Strategy
1. **Circuit Breaker**: When Supabase is unreachable (network timeout or offline flag), `dataStore.ts` immediately falls back to reading/writing `data/events-data.json`.
2. **Reconciliation on Recovery**:
   - Check-ins conducted offline maintain an in-memory queue or local timestamp markers.
   - When connection is restored, records are synced to Supabase via idempotent upserts (`ON CONFLICT (registration_id) DO NOTHING`).
   - If an attendee was checked in both locally and on another synced gate terminal, the earliest `checked_in_at` timestamp is preserved, and a duplicate violation is recorded for telemetry.

---

# SECTION 2: `docs/SECURITY.md` Strategy & Specification

## 2.1 Threat Model & Attack Surface Analysis (STRIDE)

| Threat Category | Potential Attack Vector | Impact Level | Architectural Mitigation |
|---|---|---|---|
| **Spoofing** | Forging unsigned cookie `event_auth_session` to assume `ADMIN` role. | **CRITICAL** | HMAC-SHA256 signed session tokens containing timestamp, user ID, role, and cryptographically verified against `SESSION_SECRET`. |
| **Spoofing** | Generating counterfeit QR passes to gain illicit venue admission. | **CRITICAL** | `SECQR:` HMAC-SHA256 signed payloads with 32/64-byte signature verified via `crypto.timingSafeEqual`. |
| **Tampering** | Altering QR expiration date (`exp`) or registration ID (`tid`) in base64 string. | **CRITICAL** | Any payload modification invalidates HMAC signature; gate rejects scan and logs `CHECK_IN_TAMPER_ATTEMPT`. |
| **Tampering** | Parameter tampering in REST API calls (`/api/checkin`, `/api/export`). | **HIGH** | Strict Next.js Edge Middleware route interception and Server Action role verification (`requireAuth`). |
| **Repudiation** | Operator denies admitting an unauthorized team or resetting check-in. | **MEDIUM** | Append-only `audit_logs` recording exact timestamp, actor ID, IP address, user agent, and action metadata. |
| **Information Disclosure** | Anonymous actor dumping attendee roster (names, emails, phones, courses) via `/api/export`. | **CRITICAL** | API route authorization guard returning HTTP 401 Unauthorized for unauthenticated requests and 403 Forbidden for volunteers. |
| **Information Disclosure** | Leaking password hashes or salts in API responses. | **CRITICAL** | Strict TypeScript interfaces omitting credential fields (`Omit<User, 'passwordHash' | 'passwordSalt'>`). |
| **Denial of Service** | Credential stuffing against authentication endpoint. | **HIGH** | In-memory sliding-window brute-force rate limiter: 5 attempts per 15 minutes before lockout. |
| **Denial of Service** | Rapid re-scanning or duplicate pass presentation at gate turnstiles. | **HIGH** | Atomic database check-in constraint (`UNIQUE(registration_id)`) ensuring single-use admission. |
| **Elevation of Privilege** | Volunteer navigating to `/events/*` admin dashboard to approve teams or export PII. | **CRITICAL** | Edge Middleware intercepts volunteer session and redirects to `/scan`; API returns 403 Forbidden. |

---

## 2.2 Password Security Architecture

### Key Derivation Parameters
To ensure resistance against GPU/ASIC rainbow table attacks while maintaining high runtime performance without native binary build dependencies, the system mandates:
- **Algorithm**: Salted PBKDF2 with SHA-512 (or `scrypt`).
- **Iterations**: 100,000 rounds.
- **Derived Key Length**: 64 bytes (512 bits), hex-encoded.
- **Salt Generation**: 16 bytes of cryptographically secure random bytes generated via Node.js `crypto.randomBytes(16)`.
- **Implementation Blueprint**:
  ```typescript
  import crypto from "crypto";

  export function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
    return new Promise((resolve, reject) => {
      const salt = saltHex || crypto.randomBytes(16).toString("hex");
      crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
        if (err) return reject(err);
        resolve({
          hash: derivedKey.toString("hex"),
          salt,
        });
      });
    });
  }

  export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const { hash } = await hashPassword(password, storedSalt);
    const hashBuffer = Buffer.from(hash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (hashBuffer.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, storedBuffer);
  }
  ```

---

## 2.3 Session Security Architecture

### Signed Session Cookie Specification
Session cookies replace raw JSON strings with HMAC-SHA256 cryptographically signed tokens.
- **Cookie Name**: `event_auth_session`
- **Format**: `${base64UrlPayload}.${hmacSignature}`
- **Payload Schema**:
  ```json
  {
    "uid": "usr-admin-1",
    "email": "admin@eventportal.com",
    "role": "ADMIN",
    "fullName": "Alex Mercer",
    "iat": 1728921600,
    "exp": 1729526400,
    "jti": "d6a3b2e8-4b7f-4318-971c-4b6fa723f99e"
  }
  ```
- **Cookie Security Flags**:
  - `HttpOnly: true` (Inaccessible to `document.cookie` / XSS scripts)
  - `Secure: true` in production (`process.env.NODE_ENV === "production"`)
  - `SameSite: "lax"` (Mitigates CSRF on cross-site requests)
  - `Path: "/"`
  - `Max-Age`: 604800 (7 days for Admins, configurable to 24 hours for Volunteers)

### Brute-Force Rate Limiting & Lockout
- **Tracking Key**: `${clientIp}:${lowercaseEmail}`
- **Policy**:
  - Max failed attempts: 5.
  - Window: 15 minutes (900 seconds).
  - Lockout duration: 15 minutes.
  - Telemetry: Triggers `AUTH_LOCKOUT` audit entry upon 5th failure.

---

## 2.4 QR Token Cryptography (`SECQR:`)

### Protocol Format
```
SECQR:<Base64EncodedJSONPayload>
```

### Decoded Payload Structure
```json
{
  "v": 1,
  "tid": "tm-101",
  "eid": "ev-1",
  "tok": "e4f88c2b-6b21-4f19-a23b-5a02e6c86712",
  "exp": 1792166400,
  "sig": "b59a4f6d89e1... (full HMAC-SHA256 hex digest)"
}
```

### Signature Generation & Invariants
- **Message String**: `${tid}:${eid}:${tok}:${exp}`
- **Signing Algorithm**: `crypto.createHmac("sha256", process.env.QR_HMAC_SECRET).update(message).digest("hex")`
- **Constant-Time Verification**:
  ```typescript
  export function verifySecureQRPayload(rawInput: string): QRVerificationResult {
    const clean = rawInput.trim();
    if (!clean.startsWith("SECQR:")) {
      return {
        valid: false,
        isSignedPayload: false,
        tamperDetected: true,
        errorMessage: "REJECTED: Pass does not have valid cryptographic signature header (SECQR:).",
      };
    }

    try {
      const base64Str = clean.slice(6);
      const jsonStr = Buffer.from(base64Str, "base64").toString("utf8");
      const payload: SignedQRPayload = JSON.parse(jsonStr);

      const expectedSig = signQRPayload(payload.tid, payload.eid, payload.tok, payload.exp);
      const sigBuf = Buffer.from(payload.sig, "utf8");
      const expSigBuf = Buffer.from(expectedSig, "utf8");

      if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
        return {
          valid: false,
          isSignedPayload: true,
          tamperDetected: true,
          errorMessage: "CRITICAL: Cryptographic signature mismatch. Pass has been altered or forged.",
        };
      }

      const nowUnix = Math.floor(Date.now() / 1000);
      if (nowUnix > payload.exp) {
        return {
          valid: false,
          isSignedPayload: true,
          isExpired: true,
          errorMessage: "QR pass expired. Admission denied.",
        };
      }

      return { valid: true, isSignedPayload: true, teamId: payload.tid, eventId: payload.eid };
    } catch {
      return { valid: false, isSignedPayload: true, tamperDetected: true, errorMessage: "Malformed QR payload." };
    }
  }
  ```

---

## 2.5 Server-Enforced RBAC & Route/API Protection

### 1. Next.js Edge Middleware (`src/middleware.ts`)
- **Route Interception Matcher**:
  ```typescript
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
  ```
- **Rules Engine**:
  1. If no valid signed session cookie is present:
     - For web pages (`/events/*`, `/scan/*`): Redirect to `/?redirect=${pathname}`.
     - For API routes (`/api/*`): Return HTTP 401 `{ success: false, error: "Authentication required." }`.
  2. If session role is `VOLUNTEER`:
     - Navigation to `/events` or `/events/*`: Intercept and redirect to `/scan`.
     - Calls to `/api/export`, `/api/import`, `/api/teams/:id/email`: Return HTTP 403 `{ success: false, error: "Forbidden: Admin privileges required." }`.
     - Calls to `/scan` and `/api/checkin`: Permitted.

### 2. Attendee PII Shielding Rules
- Public or volunteer gate views mask or exclude sensitive contact data:
  - Phone numbers and personal emails are never returned to anonymous endpoints.
  - CSV exports (`/api/export`) containing complete unmasked rosters require verified `ADMIN` authentication.

---

## 2.6 Audit Logging Invariants

Audit logging provides tamper-evident telemetry for operational accountability.

1. **Duplicate Check-In Invariant**:
   - Any presentation of an already admitted pass triggers a `CHECK_IN_DUPLICATE_ATTEMPT` with `severity: "CRITICAL"`.
   - Log must record: `previousCheckInAt`, `previousCheckedInBy`, `scanAttemptCount`, client IP, and user agent.
2. **Cryptographic Tamper Invariant**:
   - Any malformed, non-SECQR, or invalid HMAC signature triggers `CHECK_IN_TAMPER_ATTEMPT` with `severity: "CRITICAL"`.
3. **OTP Security Invariants**:
   - Generation of 6-digit gate OTP -> `OTP_GENERATED` (`severity: "INFO"`).
   - Failed OTP entry -> `OTP_MATCH_FAILURE` (`severity: "WARNING"`).
   - 4 consecutive failed entries -> `OTP_LOCKOUT` (`severity: "CRITICAL"`).
4. **Administrative Overrides**:
   - Check-in reset -> `CHECK_IN_RESET` (`severity: "WARNING"`), requires mandatory justification reason string.
   - Payment approval / rejection -> `PAYMENT_APPROVED` / `PAYMENT_REJECTED` (`severity: "INFO"` / `"WARNING"`).
5. **Log Immutability**:
   - Audit records cannot be altered or removed through application APIs or standard database policies.

---

## 2.7 Environment Variable Security Configuration

The `.env.example` document must specify all operational secrets:

```env
# Application Environment
NODE_ENV=development
PORT=3000

# Cryptographic & Session Secrets (Must be 32+ character high-entropy strings in production)
SESSION_SECRET=replace-with-a-secure-random-32-byte-hex-string-for-session-signing
QR_HMAC_SECRET=replace-with-a-secure-random-32-byte-hex-string-for-qr-signing

# Supabase PostgreSQL Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Transactional Email Service (Resend)
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM="Event Ticketing Portal <tickets@yourdomain.com>"
```

---

# SECTION 3: Documentation Implementation Plan

When authoring `docs/DATABASE_SCHEMA.md` and `docs/SECURITY.md`, the author should follow this exact structure:

### Outline for `docs/DATABASE_SCHEMA.md`
1. **Title & Document Metadata**
2. **Persistence Architecture Overview** (Dual-mode Supabase PostgreSQL + Local JSON store)
3. **Core Generalized Entities & DDL Specifications** (Tables 1-8: `users`, `events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`)
4. **Entity Relationship Diagram (ERD)** (Mermaid & ASCII)
5. **Indexes, Constraints & Performance Tuning**
6. **Supabase Row-Level Security (RLS) Policies** (Full SQL policies)
7. **Dual-Mode Mapping Specification** (Relational <-> `events-data.json`)
8. **Disaster Recovery & Offline Synchronization Protocol**

### Outline for `docs/SECURITY.md`
1. **Title & Security Philosophy**
2. **Threat Model & Attack Surface Analysis (STRIDE)**
3. **Cryptographic Password Architecture** (Salted PBKDF2/scrypt, parameters, timingSafeEqual)
4. **Session Security & Token Management** (HMAC-SHA256 signed cookies, expiry, lockout)
5. **`SECQR:` Gate Cryptography Protocol** (Payload schema, HMAC verification, timingSafeEqual, elimination of bypass)
6. **Role-Based Access Control (RBAC) & Edge Middleware** (Route matrix, `middleware.ts`, PII shielding)
7. **Gate Verification & Atomic Check-In Invariants** (Duplicate prevention, OTP fallback)
8. **Security Audit Telemetry & Incident Invariants** (Immutable audit logs, critical alarms)
9. **Environment Configuration & Secret Management** (.env guidelines)

---

## Conclusion
This strategy blueprint establishes the complete technical foundation for `docs/DATABASE_SCHEMA.md` and `docs/SECURITY.md`. It directly guides Milestone 1 documentation writing and subsequent implementation across Milestones 2 through 6.
