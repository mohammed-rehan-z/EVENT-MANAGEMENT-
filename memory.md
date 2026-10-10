# Project Memory

- **Project Vision**: Universal Multi-Event Registration & QR Check-in System.
- **Current State**: Fully functional, database-connected application with active multi-event App Router structure, server actions, and dedicated RESTful backend services.
- **Backend Architecture & Services**:
  1. **QR Service (`src/lib/services/qrService.ts`)**:
     - Cryptographic UUID token generation.
     - Base64 Data URL and binary buffer generation with high error-correction (`H`).
  2. **Email Service (`src/lib/services/emailService.ts`)**:
     - Branded, responsive HTML ticket generator with embedded scannable QR passes, leader info, and gate inspection rules.
     - Supports live Resend API dispatch and persistent audit logging (`data/email-dispatch-logs.json`).
  3. **Check-In Service (`src/lib/services/checkInService.ts`)**:
     - Pre-admission QR code inspection and roster fetching.
     - Duplicate admission blocking with exact timestamp alerts.
     - Atomic check-in execution recording `checked_in_at` and `volunteer_id`.
  4. **Team Service (`src/lib/services/teamService.ts`)**:
     - Full team querying, attendance filtering, manual team creation, and email toggle tracking.
  5. **REST API Endpoints (`src/app/api/...`)**:
     - `GET /api/health`: System health status, services diagnostics, and live metrics.
     - `GET, POST /api/teams`: Query segregated teams with search/filters or create new teams.
     - `GET, PATCH /api/teams/[teamId]`: Fetch team details or toggle email dispatch status (`emailSent: true/false`).
     - `POST /api/teams/[teamId]/email`: Dispatch QR entry pass email to team leader.
     - `POST /api/checkin`: Gate inspection lookup (`action: "lookup"`) and attendance marking (`action: "confirm"`).
     - `POST /api/import`: Programmatic participant import and team-wise segregation.
     - `GET /api/export`: Export roster as CSV or JSON for offline venue backup protocol.
