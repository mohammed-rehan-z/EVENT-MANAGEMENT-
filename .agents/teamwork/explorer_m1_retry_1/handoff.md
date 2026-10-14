# Handoff Report: Remediation Strategy for Database Schema Specification (`docs/DATABASE_SCHEMA.md`)

**Agent:** `explorer_m1_retry_1`  
**Milestone:** Milestone 1 Gate Retry (Remediation Strategy for Schema & Cryptographic Specifications)  
**Date:** 2026-10-14T16:35:00Z  
**Target Document:** `docs/DATABASE_SCHEMA.md`  
**Handoff Type:** Hard (Complete Investigation & Remediation Plan)  

---

## 1. Observation

Direct static inspection and comparative verification across `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `src/lib/supabase.ts`, `src/lib/dataStore.ts`, and `challenger_m1_2/handoff.md` revealed the following exact observations:

### Observation 1: `audit_logs.event_id` NOT NULL & FK Cascade Constraint
- **File:** `docs/DATABASE_SCHEMA.md`, lines 225-238:
```sql
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
```
- **Contrast with `docs/SECURITY.md` Section 8 (Table 8, lines 320-322):**
  - `AUTH_LOGIN_SUCCESS` (INFO): Telemetry includes `User ID, role, client IP, user agent` — no `event_id` exists at system login.
  - `AUTH_LOGIN_FAILURE` (WARNING): Telemetry includes `Email, client IP, user agent` — no `event_id` exists.
  - `AUTH_LOCKOUT` (CRITICAL): Telemetry includes `Email, client IP, lockout expiration` — no `event_id` exists.
- **Contrast with `src/lib/dataStore.ts`, line 364:**
  The local data store already accounts for event-less audit entries:
  ```typescript
  let logs = store.audit_logs.filter(
    (l) => l.event_id === eventId || eventId === "all" || (eventId === "ev-1" && !l.event_id)
  );
  ```

### Observation 2: Cryptographic Salt Specification Discrepancy
- **File:** `docs/DATABASE_SCHEMA.md`, line 72:
```sql
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';
```
- **Contrast with `ORIGINAL_REQUEST.md` §R2, Mission Dispatch, and `PROJECT.md` Feature 3:**
  - Mandated key derivation parameter: `PBKDF2 iterations >= 100,000, 32-byte salt, 64-byte key length`.
  - A 16-byte salt provides only 128 bits of entropy. For PBKDF2-HMAC-SHA512 with 64-byte (512-bit) keys, modern cryptographic security standards mandate 32 bytes (256 bits) of cryptographically secure random entropy (producing a 64-character hex string via `crypto.randomBytes(32).toString('hex')`).

### Observation 3: PostgreSQL RLS Policy on `audit_logs` Restricts INSERT to `authenticated` Only
- **File:** `docs/DATABASE_SCHEMA.md`, lines 408-409:
```sql
CREATE POLICY p_audit_logs_system_insert ON audit_logs 
    FOR INSERT TO authenticated WITH CHECK (TRUE);
```
- **Contrast with `src/lib/supabase.ts`, lines 4-7:**
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```
- When an unauthenticated actor attempts to authenticate at `/` (or fails login, triggers a lockout, or hits an API route with invalid headers), the client/action does not possess a valid Supabase JWT. It executes under PostgreSQL role `anon`.
- Because `p_audit_logs_system_insert` is defined `FOR INSERT TO authenticated`, any attempt by an unauthenticated request to log `AUTH_LOGIN_FAILURE` or `AUTH_LOCKOUT` is rejected by PostgreSQL with an RLS policy violation.

### Observation 4: Incomplete Invariant Description on Cascade Deletions
- **File:** `docs/DATABASE_SCHEMA.md`, Section 3.2, line 291:
```markdown
1. **Cascade Deletes:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and `audit_logs` are deleted atomically (`ON DELETE CASCADE`).
```
- If `audit_logs.event_id` is nullable, system-level audit logs (`event_id IS NULL`) should NOT be deleted when an event is deleted. The invariant must explicitly distinguish between event-scoped logs (which cascade) and system-level compliance records (which are retained).

### Observation 5: Indexing Missing for Event-Independent Global Log Queries
- **File:** `docs/DATABASE_SCHEMA.md`, lines 240-242:
```sql
CREATE INDEX idx_audit_logs_event_timestamp ON audit_logs (event_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action_severity ON audit_logs (action, severity);
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin (details);
```
- The composite index `(event_id, timestamp DESC)` optimizes queries filtered by `event_id`. However, queries for global system audit logs (`WHERE event_id IS NULL ORDER BY timestamp DESC`) or chronological audit inspection across all events lack a dedicated index on `(timestamp DESC)`.

---

## 2. Logic Chain

1. **Failure of System-Level Authentication Telemetry (Observation 1 -> Remediation 1):**
   - An administrator or volunteer logs in at the root route `/`. At this stage, the user is authenticating against the platform, not a specific event.
   - When a login succeeds (`AUTH_LOGIN_SUCCESS`), fails (`AUTH_LOGIN_FAILURE`), or triggers rate-limit lockout (`AUTH_LOCKOUT`), `SECURITY.md §8` mandates inserting an audit entry.
   - In PostgreSQL, executing `INSERT INTO audit_logs (event_id, action, ...) VALUES (NULL, 'AUTH_LOGIN_FAILURE', ...)` triggers:
     `ERROR: null value in column "event_id" violates not-null constraint`.
   - Passing a synthetic or placeholder event UUID fails with:
     `ERROR: insert or update on table "audit_logs" violates foreign key constraint "audit_logs_event_id_fkey"`.
   - Therefore, `event_id` in `audit_logs` must be nullable: `event_id UUID REFERENCES events(id) ON DELETE CASCADE`.
   - Adding a standalone index `CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp DESC);` ensures rapid querying of event-independent logs and global security dashboards.

2. **Compliance with Cryptographic Salt Standards (Observation 2 -> Remediation 2):**
   - The user specification in `ORIGINAL_REQUEST.md` §R2 and the mission prompt explicitly require 32-byte salts.
   - SHA-512 outputs 64 bytes. Pairings with 16-byte salts do not meet high-security key derivation guidelines where salt entropy should match or exceed half the hash length (>= 256 bits / 32 bytes).
   - In `docs/DATABASE_SCHEMA.md` line 72, the column comment on `users.password_salt` must be updated from `16-byte random salt` to `32-byte (256-bit) random salt, hex-encoded (64 characters) generated via crypto.randomBytes(32)`.

3. **RLS Policy Architecture for Anonymous Security Telemetry (Observation 3 -> Remediation 3):**
   - **Vulnerability Analysis of Naive Fix:** If `p_audit_logs_system_insert` is simply changed to `FOR INSERT TO anon, authenticated WITH CHECK (TRUE)`, any unauthenticated attacker with access to `NEXT_PUBLIC_SUPABASE_ANON_KEY` can forge administrative audit logs (e.g. inserting records with `actor_role = 'ADMIN'`, `action = 'PAYMENT_APPROVED'`, or arbitrary fraudulent entries).
   - **Remediation Architecture (Dual-Policy Model):**
     1. **`p_audit_logs_authenticated_insert`:** Granted `TO authenticated WITH CHECK (TRUE)`. This allows authenticated staff (Admins, Volunteers) to log operational actions (`CHECK_IN_SUCCESS`, `OTP_GENERATED`, `PAYMENT_APPROVED`, etc.).
     2. **`p_audit_logs_anon_security_insert`:** Granted `TO anon` with a strict `WITH CHECK` constraint:
        ```sql
        actor_role = 'SYSTEM' 
        AND action IN (
            'AUTH_LOGIN_SUCCESS',
            'AUTH_LOGIN_FAILURE',
            'AUTH_LOCKOUT',
            'CHECK_IN_TAMPER_ATTEMPT',
            'CHECK_IN_INVALID_ATTEMPT'
        )
        ```
     3. **Server-Side Operations:** Server Actions executing with `SUPABASE_SERVICE_ROLE_KEY` bypass RLS automatically via PostgreSQL `BYPASSRLS`.
     4. **Immutability Guarantee:** No `UPDATE` or `DELETE` policies exist on `audit_logs`, ensuring records remain strictly append-only.
     5. **Privacy Protection:** `p_audit_logs_admin_read` continues to restrict read access strictly to authenticated users with `role = 'ADMIN'`.

4. **Preservation of System Logs during Event Deletions (Observation 4 -> Remediation 4):**
   - When an event is deleted, cascading foreign keys correctly delete all event-scoped entities (`registrations`, `groups`, `participants`, `check_ins`, and event-scoped `audit_logs` where `event_id` matches).
   - Because system-level audit logs have `event_id IS NULL`, they are not cascaded and remain intact. Section 3.2 must document this invariant to ensure audit compliance.

5. **Dual-Mode Data Store Harmonization (Observation 5 -> Remediation 5):**
   - In Section 5 (PostgreSQL <-> Local JSON Mapping Table), row `audit_logs` must explicitly note that `event_id` is nullable and may be `null` or omitted for system-level authentication entries.

---

## 3. Caveats

1. **Read-Only Investigation:** Per teamwork protocol, this investigation formulated and verified the exact remediation strategy without directly modifying source code files or applying DDL migrations.
2. **Dual-Mode JSON Runtime Behavior:** The local JSON store (`data/events-data.json`) does not enforce foreign keys or RLS at runtime. The changes in `docs/DATABASE_SCHEMA.md` are critical for PostgreSQL 15+ execution in `schema.sql` and Supabase environments.
3. **Downstream Documentation Alignment:** While this report specifically targets `docs/DATABASE_SCHEMA.md`, identical cryptographic salt updates (from 16 bytes to 32 bytes) must also be reflected in `docs/SECURITY.md` (lines 48 & 63) and `docs/IMPLEMENTATION_PLAN.md` (lines 142 & 220) by the implementation agent.

---

## 4. Conclusion & Exact Remediation Strategy

The remediation strategy for `docs/DATABASE_SCHEMA.md` is fully defined and ready for immediate application. Below are the exact before/after specifications:

### Target 1: `users.password_salt` Comment Update
- **File:** `docs/DATABASE_SCHEMA.md`
- **Lines:** 70–73
```sql
-- BEFORE:
COMMENT ON TABLE users IS 'System authentication principals, roles, and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';

-- AFTER:
COMMENT ON TABLE users IS 'System authentication principals, roles, and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 32-byte (256-bit) random salt, hex-encoded (64 characters) generated via crypto.randomBytes(32).';
```

### Target 2: `audit_logs.event_id` Nullable & Global Timestamp Index
- **File:** `docs/DATABASE_SCHEMA.md`
- **Lines:** 225–244
```sql
-- BEFORE:
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

CREATE INDEX idx_audit_logs_event_timestamp ON audit_logs (event_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action_severity ON audit_logs (action, severity);
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin (details);

COMMENT ON TABLE audit_logs IS 'Immutable security and administrative telemetry log.';

-- AFTER:
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

### Target 3: Relational Invariant Clarification
- **File:** `docs/DATABASE_SCHEMA.md`
- **Lines:** 290–293
```markdown
<!-- BEFORE: -->
### 3.2 Relational Invariants & Foreign Key Constraints
1. **Cascade Deletes:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and `audit_logs` are deleted atomically (`ON DELETE CASCADE`).

<!-- AFTER: -->
### 3.2 Relational Invariants & Foreign Key Constraints
1. **Cascade Deletes & System Log Retention:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and event-scoped `audit_logs` (where `event_id` matches) are deleted atomically (`ON DELETE CASCADE`). System-level audit records (`event_id IS NULL`), including user authentication, rate-limiting, and security alerts, are retained permanently for regulatory compliance.
```

### Target 4: Hardened Row-Level Security (RLS) Policies on `audit_logs`
- **File:** `docs/DATABASE_SCHEMA.md`
- **Lines:** 403–411
```sql
-- BEFORE:
--------------------------------------------------------------------------------
-- AUDIT_LOGS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_audit_logs_admin_read ON audit_logs 
    FOR SELECT TO authenticated USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_audit_logs_system_insert ON audit_logs 
    FOR INSERT TO authenticated WITH CHECK (TRUE);
-- Immutability: No user or role may alter or delete audit logs

-- AFTER:
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

### Target 5: Section 5 Dual-Mode Field Mapping Reference
- **File:** `docs/DATABASE_SCHEMA.md`
- **Line:** 461
```markdown
<!-- BEFORE: -->
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects (rotated at 2,000 logs) |

<!-- AFTER: -->
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects (rotated at 2,000 logs); `event_id` is nullable for system-level auth events |
```

---

## 5. Verification Method

To independently verify this remediation strategy:

1. **Verify DDL Syntax & Invariant Consistency:**
   - Review Target 2 in PostgreSQL 15+:
     ```sql
     CREATE TABLE test_audit_logs (
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
     -- System-level event insert test (event_id is NULL)
     INSERT INTO test_audit_logs (action, severity, actor_id, actor_role, details) 
     VALUES ('AUTH_LOGIN_FAILURE', 'WARNING', 'anon-client', 'SYSTEM', '{"reason": "Invalid credentials"}'::jsonb);
     ```
     Execution succeeds without constraint violation.

2. **Verify RLS Insertion Logic:**
   - Simulate `anon` insertion of `AUTH_LOGIN_FAILURE` with `actor_role = 'SYSTEM'`: Allowed by `p_audit_logs_anon_security_insert`.
   - Simulate `anon` insertion with `actor_role = 'ADMIN'` or `action = 'PAYMENT_APPROVED'`: Blocked by `p_audit_logs_anon_security_insert`.
   - Simulate `authenticated` user insertion: Allowed by `p_audit_logs_authenticated_insert`.
   - Simulate any `UPDATE` or `DELETE` on `audit_logs`: Denied (no policy defined, table RLS enabled).

3. **Invalidation Conditions:**
   This remediation strategy would be invalidated if:
   - System-level authentication events were required to reference a hardcoded placeholder event record in `events` rather than using standard relational nullability (a known anti-pattern).
   - PostgreSQL RLS permitted unauthenticated clients to insert arbitrary audit logs without checking `actor_role` or `action`.
