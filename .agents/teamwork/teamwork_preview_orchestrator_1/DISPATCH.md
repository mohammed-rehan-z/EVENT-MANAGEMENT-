## 2026-10-14T15:01:31Z

You are the Project Orchestrator (identity: teamwork_preview_orchestrator_1).
Your working directory is: d:\Project\Event Management\.agents\teamwork\teamwork_preview_orchestrator_1
The authoritative user request is recorded in: d:\Project\Event Management\.agents\teamwork\ORIGINAL_REQUEST.md

Your mission is to audit, harden, and complete the full-stack Universal Event Registration & QR Check-in System, delivering production-ready authentication, role-based access control, cryptographic verification, data persistence, and comprehensive test coverage.

Please read ORIGINAL_REQUEST.md, PRD.md, TSD.md, AGENTS.md, and GEMINI.md in the project root to understand the full requirements and constraints.

Key Requirements:
1. Complete System Audit & Architectural Documentation (docs/PROJECT_AUDIT.md, ARCHITECTURE.md, DATABASE_SCHEMA.md, SECURITY.md, IMPLEMENTATION_PLAN.md, .env.example)
2. Authentication & Account Lifecycle Hardening (cryptographic hashing with PBKDF2/scrypt + salt, signed session tokens with expiration & brute-force throttling)
3. Server-Enforced RBAC & Route/API Protection (middleware and API authorization guards, redirect unauthenticated, enforce ADMIN vs VOLUNTEER roles, protect participant PII)
4. Database Schema Realignment & Resilience (generalized event entities: events, event_tracks, registrations, groups, participants, check_ins, audit_logs; dual-mode persistence: Supabase + local JSON offline fallback)
5. Feature Completion: Payment Verification & Gate Verification (payment proof review modal, atomic single-use QR check-in SECQR:, OTP fallback matching, offline roster CSV export)
6. Code Quality, Zero-Error Linting & Automated Test Suite (resolve all 101 ESLint errors, clean tsc --noEmit, automated unit & integration tests, successful build. Windows note: use npm.cmd and npx.cmd)

Maintain your BRIEFING.md, plan.md, and progress.md regularly in your working directory.
When finished and all acceptance criteria are met, report completion back to Sentinel. Note that an independent Victory Auditor will strictly verify all criteria before victory is accepted.
