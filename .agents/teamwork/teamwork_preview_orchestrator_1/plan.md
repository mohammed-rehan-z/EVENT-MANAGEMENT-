# Implementation & Orchestration Plan

## Phase 0: Survey & Scope Mapping
- Spawn 3 Explorers in parallel:
  1. `teamwork_preview_spec_miner`: Extract precise requirements, entities, API contracts, security & acceptance criteria from `ORIGINAL_REQUEST.md`, `PRD.md`, `TSD.md`, `AGENTS.md`, `gemini.md`.
  2. `teamwork_preview_explorer_1`: Codebase architecture & component survey. Map existing routes, middleware, server actions, auth mechanisms, database/storage layer, components, and offline capabilities.
  3. `teamwork_preview_explorer_2`: Code quality, build, lint & test gap survey. Run `npm.cmd run lint`, `npx.cmd tsc --noEmit`, test commands, identify the 101 ESLint errors, type errors, build issues.
- Synthesize all findings into `PROJECT.md` at project root with complete Feature Inventory.

## Phase 1: Milestone Decomposition & Execution
- **Milestone 1**: Documentation & Environment Configuration
  - Generate `docs/PROJECT_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`, `.env.example`.
- **Milestone 2**: Authentication & Account Lifecycle Hardening
  - Cryptographic hashing (PBKDF2/scrypt + salt), secure session cookies, token signing, expiration, brute-force rate-limiting.
- **Milestone 3**: Server-Enforced RBAC & Route/API Protection
  - Next.js middleware, route protection (`/events`, `/scan`, `/admin`), API guards (`/api/export`, `/api/checkin`, `/api/teams`), role enforcement (`ADMIN` vs `VOLUNTEER`), PII masking.
- **Milestone 4**: Database Schema Realignment & Dual-Mode Persistence
  - Generalized terminology (`events`, `event_tracks`, `registrations`, `groups`, `participants`, `check_ins`, `audit_logs`).
  - Dual-mode persistence: Supabase PostgreSQL + local JSON offline fallback.
- **Milestone 5**: Payment Verification Modal, Atomic Gate Check-in & Offline Roster
  - Payment proof review modal for admins with approval/rejection.
  - Cryptographic HMAC-signed QR passes (`SECQR:`), atomic single-use check-in, duplicate detection and audit logging.
  - OTP fallback check-in mechanism.
  - Offline roster CSV / printable export for venue network outage.
- **Milestone 6**: Code Quality, Zero-Error Linting & Automated Test Suite
  - Fix all 101 ESLint errors.
  - Ensure clean `npx.cmd tsc --noEmit` (0 errors).
  - Comprehensive unit and integration test suite (`npm.cmd test`).
  - Clean production build (`npm.cmd run build`).

## Phase 2: Verification, Forensics & Victory Gate
- Reviewers, Challengers, and Forensic Auditor verification.
- Pass 100% of acceptance criteria.
- Soft/Hard handoff and victory report to Sentinel.
