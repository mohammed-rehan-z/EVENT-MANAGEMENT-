# Event Management Portal — Account Access & Security Documentation

> **Official Access Control & System Authentication Manual**  
> *Last Updated: October 2026 | Environment: Production / Staging*

---

## 1. Quick Access Matrix

The system enforces role-based access control (RBAC) separating **System Administrators / Faculty Coordinators** from **Gate Volunteers**.

| Role | Display Name | Email Address | Password | Permissions & Primary Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Mohammed Rehan Z | `mohammedrehanz517@gmail.com` | `rehan@2026` | **Full Admin Access**: Event creation, team rosters, bulk CSV import, QR batch distribution, audit logs, security overrides. |
| **Volunteer** | Volunteer | `volunteer@gmail.com` | `volunteer@123` | **Gate Scanner Access**: On-site camera ticket verification, check-in roster, instant badge scan, offline attendance logging. |
| **Admin** | Hanzala | `hanzala.jawwad@gmail.com` | `hanzala@2026` | **Full Admin Access**: Event dashboard, team approvals, imports, manual check-in, system settings. |
| **Faculty Coordinator** | Faculty Coordinator | `faculty@gmail.com` | `faculty@2026` | **Administrative Event Supervisor**: Event rosters, attendance oversight, audit trails, exception verification. |
| **Admin (Legacy/Dev)** | Alex Mercer | `admin@eventportal.com` | `admin123` | Development & fallback admin account. |
| **Volunteer (Dev)** | Jordan Lee | `volunteer@eventportal.com` | `volunteer123` | Fallback volunteer testing account. |

---

## 2. Role-Based Access Control (RBAC) Matrix

Portal routing and authorization is enforced at the edge/proxy level in `src/proxy.ts` and backed by cryptographic session verification in `src/lib/services/sessionService.ts`.

### Feature Permissions by Role

| System Feature / Route | Route Pattern | `ADMIN` | `VOLUNTEER` | Unauthorized |
| :--- | :--- | :---: | :---: | :---: |
| **Portal Sign-In** | `/` | Accessible | Accessible | Accessible |
| **All Events Hub** | `/events` | Granted | Redirected to `/scan` | Redirected to `/` |
| **Event Dashboard** | `/events/[eventId]/dashboard` | Granted | Redirected to `/scan` | Redirected to `/` |
| **Teams & Registrations** | `/events/[eventId]/teams` | Granted | Redirected to `/scan` | Redirected to `/` |
| **Bulk CSV/Excel Import** | `/events/[eventId]/imports` | Granted | Redirected to `/scan` | Redirected to `/` |
| **QR Generation & Dispatch** | `/events/[eventId]/qr-codes` | Granted | Redirected to `/scan` | Redirected to `/` |
| **Security Audit Logs** | `/events/[eventId]/audit-logs` | Granted | Redirected to `/scan` | Redirected to `/` |
| **Gate Scanner UI** | `/scan` | Granted | Granted | Redirected to `/` |
| **Check-In Verification API** | `/api/check-in` | Granted | Granted | 401 Unauthorized |
| **OTP Fallback API** | `/api/otp` | Granted | Granted | 401 Unauthorized |

---

## 3. How to Sign In

1. Navigate to the portal sign-in page at `/` (e.g. `http://localhost:3000`).
2. Enter your authorized **Email Address** (e.g. `mohammedrehanz517@gmail.com`).
3. Enter your corresponding **Password** (e.g. `rehan@2026`).
4. Click the eye toggle icon if you wish to verify character visibility.
5. Click **"Sign In to Portal"**.
6. The system will securely verify the cryptographic hash and redirect you:
   - **Administrators & Faculty Coordinators**: Automatically routed to `/events` (Events Management Hub).
   - **Volunteers**: Automatically routed to `/scan` (Gate Camera Scanner).

### Active Session Notice
If a valid session is already active in your browser, a green banner appears at the top:
- Displays user's full name, role, and avatar.
- Provides a **"Sign Out"** button to end the current session.
- Provides a direct link to **"Go to Events Hub"** or **"Go to Gate Scanner"**.

---

## 4. Cryptographic Security & Password Architecture

The authentication engine implements industry-standard zero-trust cryptographic protections:

1. **Password Hashing (PBKDF2 HMAC-SHA512)**:
   - **Algorithm**: `PBKDF2` (Password-Based Key Derivation Function 2)
   - **Digest**: `HMAC-SHA512`
   - **Work Factor**: `100,000` iterations
   - **Key Length**: `64` bytes (128 hexadecimal characters)
   - **Salt**: `32` bytes (256 bits) of cryptographically secure random entropy per account (64 hexadecimal characters)
   - **Timing Attack Mitigation**: Evaluated using constant-time buffer comparison (`crypto.timingSafeEqual`).

2. **Session Security (`event_auth_session`)**:
   - Tokens are signed with HMAC-SHA256 using the server-side environment secret (`AUTH_SESSION_SECRET` or `NEXTAUTH_SECRET`).
   - Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=86400` (24-hour validity).

3. **Brute-Force & Injection Defenses**:
   - **Dual-Tier Sliding Window Rate Limiting**:
     - **Account Tier**: Max 5 failed attempts per 15-minute sliding window per email.
     - **IP Tier**: Max 15 failed attempts per 15-minute sliding window per client IP.
   - **SQL Injection Detection**: Input sanitization blocks quotation payloads, comments, and SQL keyword injection before execution.
   - **Constant-Time Verification Jitter**: Artificial randomized timing delay (350–550ms) applied to non-existent accounts to prevent account enumeration side-channels.

---

## 5. Account Storage & Configuration Files

The credentials and security records are synchronized across the following files in the repository:

1. **`src/lib/dataStore.ts`**:
   - `DEFAULT_USERS`: Defines the baseline user array, roles, salts, and precomputed SHA-512 hashes.
   - `getLocalData()`: Synchronizes user records into local JSON persistence with automatic migration checks.
   - `getDbUserByEmail()`: Fast indexed lookups.

2. **`data/events-data.json`**:
   - The primary file-system database store containing `users`, `events`, `teams`, and `audit_logs`.

3. **`src/app/page.tsx`**:
   - Client-side login interface containing the interactive auto-fill credential chips.

4. **`src/proxy.ts`**:
   - Server-side Next.js Node.js runtime proxy enforcing route authentication and role validation.

---

## 6. How to Add or Change Passwords in the Future

To generate a new PBKDF2 HMAC-SHA512 hash and salt for a new user, run this one-line command in PowerShell or terminal:

```bash
node -e "
const crypto = require('crypto');
const password = 'YOUR_NEW_PASSWORD';
const salt = crypto.randomBytes(32).toString('hex');
const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
console.log('Salt:', salt);
console.log('Hash:', hash);
"
```

Then add the resulting user record to `DEFAULT_USERS` in `src/lib/dataStore.ts` and `data/events-data.json`.
