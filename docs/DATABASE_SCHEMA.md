# Relational Database Schema & Persistence Specification
## Universal Event Registration & QR Check-in System

**Document Version:** 1.0.0  
**Status:** Approved Schema Specification  
**Target Engine:** Supabase PostgreSQL 15+ & Resilient Local JSON Datastore  
**Nomenclature Standard:** Generalized Event Terminology (per `GEMINI.md`)  

---

## 1. Persistence Architecture Overview

The Universal Event Registration & QR Check-in System utilizes a **Dual-Mode Resilient Data Persistence Engine**:
1. **Primary Operational Mode (Supabase PostgreSQL 15+):** A normalized relational schema enforcing ACID transactions, foreign key cascades, partial unique indexes, JSONB payload querying, and Row-Level Security (RLS) policies.
2. **Offline Fallback Mode (`data/events-data.json`):** A document-oriented JSON datastore ensuring physical gate scanning, volunteer roster lookups, and administrative actions continue without interruption during venue network blackouts or database unavailability.

### Generalization & Alignment Mandate
In strict accordance with `GEMINI.md` and `ORIGINAL_REQUEST.md` §R4, all legacy gaming-specific identifiers and structures are eliminated. The relational models standardize on generalized entities:
- Multi-track event configuration: `event_tracks`
- Attendee grouping & team cohorts: `groups`
- Admission tickets & application states: `registrations`
- Individual human attendees: `participants`
- Physical turnstile admissions: `check_ins`
- Security and administrative telemetry: `audit_logs`
- User identities and authentication principals: `users`

---

## 2. Complete PostgreSQL 15+ DDL Specification

Below is the complete, production-ready DDL specification covering all custom types, extensions, tables, foreign keys, constraints, and indexes.

```sql
-- PostgreSQL 15+ Production Schema
-- Universal Event Registration & QR Check-in System

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enumerated Types
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
-- 1. USERS TABLE
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

CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));
CREATE INDEX idx_users_role ON users (role);

COMMENT ON TABLE users IS 'System authentication principals, roles, and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 32-byte (256-bit) random salt, hex-encoded (64 characters) generated via crypto.randomBytes(32).';

--------------------------------------------------------------------------------
-- 2. EVENTS TABLE
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

CREATE INDEX idx_events_is_active_date ON events (is_active, date DESC);

COMMENT ON TABLE events IS 'High-level event gatherings, conventions, hackathons, or conferences.';

--------------------------------------------------------------------------------
-- 3. EVENT_TRACKS TABLE
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

CREATE INDEX idx_event_tracks_event_id ON event_tracks (event_id);

COMMENT ON TABLE event_tracks IS 'Sub-divisions, competitive tracks, or workshop categories within an event.';

--------------------------------------------------------------------------------
-- 4. REGISTRATIONS TABLE
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

CREATE UNIQUE INDEX idx_registrations_qr_token ON registrations (qr_token) WHERE qr_token IS NOT NULL;
CREATE INDEX idx_registrations_event_status ON registrations (event_id, status);
CREATE INDEX idx_registrations_event_checkin ON registrations (event_id, check_in_status);
CREATE INDEX idx_registrations_email ON registrations (email);

COMMENT ON TABLE registrations IS 'Attendee application lifecycle, payment proof, QR token, and admission state.';

--------------------------------------------------------------------------------
-- 5. GROUPS TABLE
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

CREATE INDEX idx_groups_event_id ON groups (event_id);
CREATE INDEX idx_groups_registration_id ON groups (registration_id);

COMMENT ON TABLE groups IS 'Teams, delegations, or cohorts associated with a group registration.';

--------------------------------------------------------------------------------
-- 6. PARTICIPANTS TABLE
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
    identifier TEXT, -- Student ID, Roll Number, or Badge Identifier
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_participants_registration_id ON participants (registration_id);
CREATE INDEX idx_participants_group_id ON participants (group_id);
CREATE INDEX idx_participants_event_id ON participants (event_id);
CREATE INDEX idx_participants_email ON participants (email);

COMMENT ON TABLE participants IS 'Individual human attendees associated with a registration or group.';

--------------------------------------------------------------------------------
-- 7. CHECK_INS TABLE
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

CREATE INDEX idx_checkins_event_timestamp ON check_ins (event_id, timestamp DESC);
CREATE INDEX idx_checkins_volunteer ON check_ins (volunteer_id);

COMMENT ON TABLE check_ins IS 'Atomic single-use admission audit record.';
COMMENT ON CONSTRAINT uq_check_in_registration ON check_ins IS 'Enforces database-level single-use pass invariant.';

--------------------------------------------------------------------------------
-- 8. AUDIT_LOGS TABLE
--------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
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

CREATE INDEX idx_audit_logs_event_timestamp ON audit_logs (event_id, timestamp DESC);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX idx_audit_logs_action_severity ON audit_logs (action, severity);
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin (details);

COMMENT ON TABLE audit_logs IS 'Immutable security and administrative telemetry log.';
COMMENT ON COLUMN audit_logs.event_id IS 'Event context UUID; NULL for system-level authentication and security events.';
```

---

## 3. Entity Relationship Diagram (ERD)

### 3.1 Visual Entity Map

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

### 3.2 Relational Invariants & Foreign Key Constraints
1. **Cascade Deletes & System Log Retention:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and event-scoped `audit_logs` (where `event_id` matches) are deleted atomically (`ON DELETE CASCADE`). System-level audit records (`event_id IS NULL`), including user authentication, rate-limiting, and security alerts, are retained permanently for regulatory compliance.
2. **Nullable User References:** When a staff member in `users` is deleted, references in `payment_reviewed_by`, `checked_in_by`, and `volunteer_id` are preserved and set to `NULL` (`ON DELETE SET NULL`) to retain historical audit trails.
3. **Normalized Group Names:** The `uq_groups_event_normalized_name` constraint prevents duplicate team name submissions within the same event (e.g. `"Alpha"` vs `"alpha "` normalize to the same string).
4. **Strict Single-Use Turnstile:** The `uq_check_in_registration` constraint on table `check_ins` enforces single admission at the relational storage layer. Any concurrent scan attempt produces a duplicate key violation.

---

## 4. Supabase Row-Level Security (RLS) Policies

To protect attendee PII and enforce role boundaries when queries execute via Supabase client libraries, Row-Level Security (RLS) is enabled across all tables.

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
-- USERS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_users_admin ON users
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_users_read_self ON users
    FOR SELECT TO authenticated
    USING (id = auth.uid());

--------------------------------------------------------------------------------
-- EVENTS & EVENT_TRACKS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_events_public_read ON events
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

CREATE POLICY p_events_admin_all ON events
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_event_tracks_public_read ON event_tracks
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY p_event_tracks_admin_all ON event_tracks
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

--------------------------------------------------------------------------------
-- REGISTRATIONS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_registrations_insert_public ON registrations
    FOR INSERT TO anon, authenticated
    WITH CHECK (status = 'PENDING_REVIEW' AND payment_status = 'PENDING');

CREATE POLICY p_registrations_admin_all ON registrations
    FOR ALL TO authenticated
    USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_registrations_volunteer_read ON registrations
    FOR SELECT TO authenticated
    USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

CREATE POLICY p_registrations_volunteer_checkin ON registrations
    FOR UPDATE TO authenticated
    USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'))
    WITH CHECK (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

--------------------------------------------------------------------------------
-- GROUPS & PARTICIPANTS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_groups_insert_public ON groups 
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

CREATE POLICY p_participants_insert_public ON participants 
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

CREATE POLICY p_groups_admin_all ON groups 
    FOR ALL TO authenticated USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_participants_admin_all ON participants 
    FOR ALL TO authenticated USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_groups_volunteer_read ON groups 
    FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

CREATE POLICY p_participants_volunteer_read ON participants 
    FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

--------------------------------------------------------------------------------
-- CHECK_INS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_checkins_read ON check_ins 
    FOR SELECT TO authenticated USING (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));

CREATE POLICY p_checkins_insert ON check_ins 
    FOR INSERT TO authenticated WITH CHECK (auth.current_user_role() IN ('ADMIN', 'VOLUNTEER'));
-- Disallow UPDATE and DELETE to ensure immutability of admissions

--------------------------------------------------------------------------------
-- AUDIT_LOGS POLICIES
--------------------------------------------------------------------------------
-- Admin query access: Only administrators may view audit telemetry
CREATE POLICY p_audit_logs_admin_read ON audit_logs 
    FOR SELECT TO authenticated USING (auth.current_user_role() = 'ADMIN');

-- Authenticated staff inserts: Volunteers and Admins can record operational actions
CREATE POLICY p_audit_logs_authenticated_insert ON audit_logs 
    FOR INSERT TO authenticated 
    WITH CHECK (TRUE);

-- Anonymous security telemetry: Permits anonymous recording of system security/auth events
-- while strictly preventing role spoofing and unauthorized action types
CREATE POLICY p_audit_logs_anon_security_insert ON audit_logs 
    FOR INSERT TO anon 
    WITH CHECK (
        actor_role = 'SYSTEM' 
        AND action IN (
            'AUTH_LOGIN_SUCCESS',
            'AUTH_LOGIN_FAILURE',
            'AUTH_LOCKOUT',
            'CHECK_IN_TAMPER_ATTEMPT',
            'CHECK_IN_INVALID_ATTEMPT'
        )
    );

-- Immutability: No user or role may alter or delete audit logs (no UPDATE or DELETE policies)
```

---

## 5. Dual-Mode Schema Mapping: PostgreSQL <-> Local JSON

The application seamlessly maps between normalized PostgreSQL relational tables and the local JSON document schema located at `data/events-data.json`.

### Bidirectional Field Mapping Reference

| PostgreSQL Relational Field | Local JSON Document Path (`data/events-data.json`) | Type & Transformation Notes |
|---|---|---|
| `events.id` | `events[i].id` | String (`"ev-1"` or UUID) |
| `events.name` | `events[i].name` | String |
| `events.description` | `events[i].description` | String |
| `events.overview` | `events[i].overview` | String |
| `events.venue` | `events[i].venue` | String |
| `events.date` | `events[i].date` | ISO 8601 string |
| `events.end_date` | `events[i].end_date` | ISO 8601 string |
| `events.thumbnail_url` | `events[i].thumbnail_url` | String |
| `events.is_active` | `events[i].is_active` | Boolean |
| `event_tracks.name` | `teams[j].category` | Mapped to track name string |
| `groups.id` / `registrations.id` | `teams[j].id` | Unified identifier (`"tm-..."` or UUID) |
| `groups.name` | `teams[j].name` | String |
| `groups.normalized_name` | `teams[j].normalized_name` | Trimmed lowercase string |
| `registrations.status` | `teams[j].status` | `"PENDING_REVIEW"` \| `"APPROVED"` \| `"REJECTED"` |
| `registrations.payment_screenshot_url` | `teams[j].payment_screenshot_url` | URL or asset path string |
| `registrations.payment_status` | `teams[j].payment_status` | `"PENDING"` \| `"VERIFIED"` \| `"REJECTED"` |
| `registrations.qr_token` | `teams[j].qr_token` | `SECQR:` string or token UUID |
| `registrations.qr_expires_at` | `teams[j].qr_expires_at` | ISO 8601 string |
| `registrations.qr_email_sent` | `teams[j].qr_email_sent` | Boolean |
| `registrations.qr_email_sent_at` | `teams[j].qr_email_sent_at` | ISO 8601 string |
| `registrations.check_in_status` | `teams[j].check_in_status` | `"NOT_CHECKED_IN"` \| `"CHECKED_IN"` |
| `registrations.checked_in_at` | `teams[j].checked_in_at` | ISO 8601 string |
| `registrations.checked_in_by` | `teams[j].checked_in_by` | Volunteer user ID string |
| `registrations.scan_count` | `teams[j].scan_count` | Number (default: 0) |
| `registrations.otp_code` | `teams[j].otp_code` | 6-digit numeric string |
| `registrations.otp_expires_at` | `teams[j].otp_expires_at` | ISO 8601 string |
| `registrations.otp_attempts_left`| `teams[j].otp_attempts_left`| Number (default: 4) |
| `registrations.otp_locked` | `teams[j].otp_locked` | Boolean |
| `participants` (table rows) | `teams[j].participants[]` | Embedded array of participant objects |
| `participants.full_name` | `teams[j].participants[k].full_name` | String |
| `participants.email` | `teams[j].participants[k].email` | String |
| `participants.mobile_number` | `teams[j].participants[k].mobile_number` | String |
| `participants.course` | `teams[j].participants[k].course` | String |
| `participants.year_of_study` | `teams[j].participants[k].year_of_study` | String |
| `participants.semester` | `teams[j].participants[k].semester` | String |
| `participants.identifier` | `teams[j].participants[k].identifier` | Roll number or badge ID string |
| `participants.is_leader` | `teams[j].participants[k].is_leader` | Boolean |
| `check_ins` (table rows) | Embedded into team check-in status | Synchronized to `check_in_status` and audit logs |
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects (rotated at 2,000 logs); `event_id` is nullable for system-level auth events |

---

## 6. Disaster Recovery & Offline Synchronization Protocol

### 6.1 Circuit Breaker Topology
The persistence layer in `src/lib/dataStore.ts` wraps all Supabase invocations in a circuit breaker:
1. If `NEXT_PUBLIC_SUPABASE_URL` equals `https://placeholder.supabase.co` or environment variables are undefined, operations bypass network calls and execute directly against `data/events-data.json`.
2. If a database query times out (threshold: 3,500ms) or returns a network error, the call catches the exception, logs a warning, and falls back to the local file store.

### 6.2 Atomic File Write Protocol
To prevent filesystem corruption during sudden power loss or process kill:
```typescript
import fs from "fs";
import path from "path";

export function writeLocalStoreAtomic(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, payload, "utf8");
  fs.renameSync(tempPath, filePath);
}
```

### 6.3 Reconnection Reconciliation Pipeline
When network connectivity is restored:
1. **Batch Upsert:** Queued check-ins are pushed to Supabase PostgreSQL using `INSERT INTO check_ins ... ON CONFLICT (registration_id) DO NOTHING`.
2. **Conflict Resolution:** If a registration was checked in offline on Terminal A and also recorded on Terminal B, the database retains the earliest timestamp.
3. **Audit Reconciliation:** All offline check-in entries generate corresponding `CHECK_IN_OFFLINE_SYNC` audit records in PostgreSQL with full operator and timestamp telemetry.
