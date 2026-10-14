# Original User Request

## Initial Request — 2026-10-14T14:59:57Z

Audit, harden, and complete the full-stack Universal Event Registration & QR Check-in System, delivering production-ready authentication, role-based access control, cryptographic verification, data persistence, and comprehensive test coverage.

Working directory: d:\Project\Event Management
Integrity mode: development

## Requirements

### R1. Complete System Audit & Architectural Documentation
Deliver formal project documentation under `docs/` (`PROJECT_AUDIT.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SECURITY.md`, `IMPLEMENTATION_PLAN.md`) and a fully documented `.env.example`.

### R2. Authentication & Account Lifecycle Hardening
Replace hardcoded credentials and unsigned cookie sessions with cryptographic password hashing (PBKDF2/scrypt with salt) and signed, secure session tokens with expiration and brute-force throttling.

### R3. Server-Enforced RBAC & Route/API Protection
Implement Next.js middleware and API authorization guards ensuring unauthenticated requests are redirected, role privileges (`ADMIN` vs `VOLUNTEER`) are strictly enforced, and private participant PII cannot be accessed anonymously.

### R4. Database Schema Realignment & Resilience
Align database entities with generalized event specifications (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`), maintaining dual-mode persistence (Supabase PostgreSQL + local JSON offline fallback).

### R5. Feature Completion: Payment Verification & Gate Verification
Support payment proof review modal for pending registrations, atomic single-use check-in enforcement, OTP fallback matching, and offline roster exports (CSV/printable).

### R6. Code Quality, Zero-Error Linting & Automated Test Suite
Eliminate all 101 ESLint errors, ensure clean typechecking, and provide automated unit and integration tests covering security, authentication, and check-in workflows. Note: On Windows PowerShell, execute commands using `npm.cmd` and `npx.cmd`.

## Acceptance Criteria

### Security & Access Control
- [ ] Direct unauthenticated navigation to `/events` or `/scan` is blocked and redirected to login.
- [ ] Volunteers cannot access `/events/*` admin routes or administrative server actions.
- [ ] Unauthenticated requests to `/api/export`, `/api/checkin`, `/api/teams` return 401 Unauthorized.
- [ ] Password hashes and session secrets are never stored in plaintext or exposed in API responses.

### Functionality & Verification
- [ ] Approved registrations generate single-use HMAC-signed QR passes (`SECQR:`).
- [ ] A second scan of an already checked-in QR pass is rejected atomically and logged as a duplicate violation with exact timestamp.
- [ ] Tampered QR payloads are rejected with cryptographic signature failure.
- [ ] Offline CSV export produces complete roster data for venue network failure protocol.
- [ ] Payment verification modal enables admins to review uploaded screenshots and approve/reject registrations.

### Code Quality & Build Verification
- [ ] `npx.cmd tsc --noEmit` completes with 0 errors.
- [ ] `npm.cmd run lint` completes with 0 errors (all 101 existing errors resolved).
- [ ] `npm.cmd test` passes all unit and integration tests.
- [ ] `npm.cmd run build` completes successfully.
