# Detailed Remediation Strategy for docs/DATABASE_SCHEMA.md
**Milestone 1 Retry — explorer_m1_retry_1**

## Summary of Targeted Changes

| Item | Target in `docs/DATABASE_SCHEMA.md` | Issue | Remediation |
|---|---|---|---|
| **1** | Table `audit_logs`, Line 227 | `event_id UUID NOT NULL` prevents logging system-level auth events (`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`). | Remove `NOT NULL` (`event_id UUID REFERENCES events(id) ON DELETE CASCADE`), add column comment, and add `idx_audit_logs_timestamp` index. |
| **2** | Table `users`, Line 72 | `password_salt` commented as 16-byte random salt instead of 32-byte (256-bit) cryptographically secure salt. | Update comment and DDL documentation to 32 bytes (256 bits) / 64 hex characters generated via `crypto.randomBytes(32)`. |
| **3** | RLS Policies, Lines 408-409 | `p_audit_logs_system_insert` is restricted `TO authenticated`, blocking anonymous security events (`AUTH_LOGIN_FAILURE`, `AUTH_LOCKOUT`, `CHECK_IN_TAMPER_ATTEMPT`) and failing when Supabase client connects via `anon` key. | Split into two policies: `p_audit_logs_authenticated_insert` (`FOR INSERT TO authenticated WITH CHECK (TRUE)`) and `p_audit_logs_anon_security_insert` (`FOR INSERT TO anon WITH CHECK (actor_role = 'SYSTEM' AND action IN ('AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOCKOUT', 'CHECK_IN_TAMPER_ATTEMPT', 'CHECK_IN_INVALID_ATTEMPT'))`). |
| **4** | ERD Section 3.2, Line 291 | Foreign key invariant states all audit logs are cascaded on event deletion. | Clarify invariant: event-scoped audit logs cascade, while system-level audit logs (`event_id IS NULL`) are permanently retained for audit/compliance. |
| **5** | Section 5 Mapping Table, Line 461 | Dual-mode mapping note does not describe nullability of `event_id` in JSON store. | Clarify that `event_id` is optional/nullable in local JSON and maps to `null` or omitted for system events. |

---

## Exact DDL Changes

### 1. `users.password_salt` Specification Update
**Target Location:** Lines 70-73
```sql
<<<< BEFORE
COMMENT ON TABLE users IS 'System authentication principals, roles, and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 16-byte random salt.';
====
COMMENT ON TABLE users IS 'System authentication principals, roles, and credential store.';
COMMENT ON COLUMN users.password_hash IS 'Hex digest of salted PBKDF2/scrypt key derivation.';
COMMENT ON COLUMN users.password_salt IS 'Cryptographically secure 32-byte (256-bit) random salt, hex-encoded (64 characters) generated via crypto.randomBytes(32).';
>>>>
```

### 2. `audit_logs.event_id` Nullability and Indexes
**Target Location:** Lines 225-244
```sql
<<<< BEFORE
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
====
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
>>>>
```

### 3. Relational Invariant Clarification
**Target Location:** Lines 290-293
```markdown
<<<< BEFORE
### 3.2 Relational Invariants & Foreign Key Constraints
1. **Cascade Deletes:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and `audit_logs` are deleted atomically (`ON DELETE CASCADE`).
====
### 3.2 Relational Invariants & Foreign Key Constraints
1. **Cascade Deletes & System Log Retention:** When an `event` is removed, all associated `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, and event-scoped `audit_logs` (where `event_id` matches) are deleted atomically (`ON DELETE CASCADE`). System-level audit records (`event_id IS NULL`), including user authentication, rate-limiting, and security alerts, are retained permanently for regulatory compliance.
>>>>
```

### 4. Row-Level Security (RLS) Policy Hardening
**Target Location:** Lines 403-411
```sql
<<<< BEFORE
--------------------------------------------------------------------------------
-- AUDIT_LOGS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY p_audit_logs_admin_read ON audit_logs 
    FOR SELECT TO authenticated USING (auth.current_user_role() = 'ADMIN');

CREATE POLICY p_audit_logs_system_insert ON audit_logs 
    FOR INSERT TO authenticated WITH CHECK (TRUE);
-- Immutability: No user or role may alter or delete audit logs
====
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
>>>>
```

### 5. Dual-Mode Mapping Table Update
**Target Location:** Line 461
```markdown
<<<< BEFORE
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects (rotated at 2,000 logs) |
====
| `audit_logs` (table rows) | `audit_logs[]` | Array of audit objects (rotated at 2,000 logs); `event_id` is nullable for system-level auth events |
>>>>
```
