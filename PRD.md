# Universal Event Registration & QR Check-in System

Product Requirements Document · Version 1.2 · October 2026

Web application
200+ participants
Advance + on-spot registration

## 1. Product overview

Product vision: Develop a centralized, versatile registration and participant verification system that enables organizers of any event (e-sports, technical hackathons, conferences, etc.) to register, identify, verify and check in participants efficiently using unique QR codes at offline (in-person) events.

The system will support advance registrations collected through Google Forms, importing existing registration spreadsheets, optional synchronization with Google Sheets, and registrations created at the venue. 

The platform will be operated by event administrators and volunteers through a mobile-friendly web application. Participants will not need to install a dedicated application.

## 2. Problem statement

Managing 200+ registrations manually creates several operational problems:

* Long queues during participant check-in at the physical venue.
* Difficulty locating registrations in large spreadsheets.
* Duplicate registrations and repeated check-ins.
* Confusion between individual and team/group registrations.
* Difficulty managing walk-in participants.
* Inconsistent attendance records across volunteers.
* Delayed reporting of participant arrivals.
* Manual and tedious verification of payment screenshots uploaded by teams/individuals.

The proposed platform centralizes registration records, QR generation, verification, payment confirmation, check-in, and reporting in one highly adaptable system.

## 3. Objectives and success metrics

| Objective               | Target                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Participant check-in    | Normally under 10 seconds per valid scan, excluding identity checks and camera startup                |
| Duplicate prevention    | Zero duplicate successful check-ins                                                                   |
| Import accuracy         | All accepted rows accounted for, with invalid rows reported                                           |
| On-spot registration    | Complete a straightforward registration and generate its QR within 60 seconds under normal conditions |
| Attendance tracking     | Dashboard updates immediately after a successful check-in                                             |
| Multi-volunteer support | Multiple stations can operate against the same database                                               |
| Recovery                | A tested backup registration list is available before the event in case of venue internet failure     |

## 4. User roles

**Administrator / Event coordinator**
Manages event settings, event tracks/categories, registration imports, payment verifications, team/group rules, users, QR policies, attendance corrections and reports.

**Registration volunteer**
Creates on-spot registrations, checks for existing records and assists participants who cannot find their QR codes. Logs in via simplified access (e.g., Magic Links or temporary PINs).

**Verification volunteer**
Scans QR codes, confirms participant identity or group roster, checks eligibility and records attendance.

**Participant / Group leader**
Submits registration information (including payment screenshots), receives the QR code upon approval, and presents it at the venue. Group leaders present the group's QR when the event uses group-based registration (e.g., a hackathon team or an e-sports roster).

## 5. Scope

### In scope — MVP

* Google Forms registration data import.
* CSV and Excel spreadsheet upload.
* Google Sheets synchronization.
* Individual and Team/Group registrations.
* Support for multiple event tracks or categories.
* Unique registration IDs and QR codes.
* QR distribution by email or downloadable ticket.
* Volunteer scanning and manual participant lookup.
* Duplicate check-in prevention.
* On-spot registration.
* **Payment Verification**: Admins review payment screenshots uploaded via Google Forms and manually approve registrations to trigger QR generation.
* Live attendance dashboard.
* Registration and attendance exports.
* Role-based access and audit logs.
* **Offline Fallback Protocol**: Exportable rosters for manual verification if venue network drops.

### Out of scope — Initial release

* Dedicated Android or iOS applications.
* Online payment gateway integration.
* Event-specific modules (like tournament brackets for gaming or project submission for hackathons).
* Automated identity-document verification.
* Facial recognition.
* Complex offline synchronization across multiple devices.

## 6. End-to-end user journeys

### 6.1 Advance registration
1. Participant submits Google Form and uploads a payment screenshot.
2. Record is imported or synced to the system as "Pending Approval".
3. Administrator reviews the payment screenshot in the dashboard.
4. Administrator marks registration as "Approved".
5. System generates a unique, revocable QR token.
6. System emails the QR ticket to the participant/group leader.
7. Participant arrives at the offline event.
8. Volunteer scans the QR.
9. System verifies eligibility and records attendance.

*Functional requirements:*
* Each accepted registration must receive a stable registration ID.
* QR generation must be idempotent.
* Invalid records must be reported instead of silently discarded.

### 6.2 Spreadsheet upload
The administrator opens Registrations → Import Spreadsheet and uploads a CSV or XLSX file.

The application must:
1. Validate the file type and size.
2. Parse column headers and show a data preview.
3. Allow mapping of spreadsheet columns to registration fields.
4. Detect duplicate IDs and conflicting group records.
5. Display a summary of new, updated, unchanged, duplicate, and invalid records.
6. Save an import history and error report.
7. Generate QR codes for newly accepted/approved registrations.

*Conflict Policy:* Manual edits made in the admin dashboard take precedence over future spreadsheet syncs to prevent overwriting corrected data.

### 6.3 Google Sheets integration
Two integration methods supported:
* Google Sheets API
* Google Apps Script

The integration supports connection validation, manual/scheduled syncs, and duplicate detection. The internal database remains the authoritative source for QR verification.

### 6.4 On-spot registration
1. Walk-in participant arrives at the registration desk.
2. Volunteer completes the on-spot form.
3. System searches for existing records to prevent duplicates.
4. System generates a unique QR token immediately.
5. QR is displayed or printed for check-in.

*Business Rules:*
* Enforces group-size limits defined per **event track** (e.g., maximum 4 members for a hackathon track, 5 for a gaming track).
* Registration does not automatically equal check-in; the check-in step is separate.

### 6.5 QR verification
Each QR scan must return a clear status:
* **Valid and eligible:** Record check-in once and show success.
* **Already checked in:** Show existing check-in timestamp; reject new check-in.
* **QR not found:** Allow manual lookup.
* **Registration pending review:** Block admission (e.g., payment not yet verified).
* **Group/Team QR:** Show group details and roster for member-level verification.

Check-in must be an atomic database operation. If network fails, volunteers fall back to the exported printed roster.

### 6.6 Group/Team verification
* **Individual registration:** Each participant receives a QR code.
* **Group registration:** Group leader receives one QR code linked to the roster. Upon scan, attendance is recorded individually for each present member.

## 7. Information architecture

* **Login:** Authenticate administrators and volunteers (Magic Links/PINs for volunteers).
* **Dashboard:** Display registrations, attendance, and exceptions.
* **Registrations:** Search and filter individuals and groups; review payment screenshots.
* **Import registrations:** Upload files, preview and reconcile rows.
* **Google Sheets integration:** Configure synchronization.
* **On-spot registration:** Register walk-ins.
* **QR check-in:** Scan QR codes and verify.
* **Attendance:** Review attendance and correct errors.
* **Reports:** Export registration, team, and attendance data (including fallback rosters).
* **Event settings:** Configure event tracks, group limits, and eligibility.
* **User management:** Create accounts and assign roles.

## 8. Admin dashboard requirements

Displays metrics:
* Total individual / group registrations.
* Checked-in vs. Pending arrival counts.
* **Pending Payment Approvals**: Highlight registrations waiting for screenshot verification.
* Check-in counts by event track/category.
* Recent activity and sync status.

## 9. Data model

Core entities:
* `events`: `event_id`, name, dates, capacity.
* `event_tracks`: `track_id`, name, group size limits, event_id.
* `registrations`: `registration_id`, type, source, status, contact details, payment_screenshot_url, payment_status, QR token.
* `groups`: `group_id`, registration ID, group name, track_id.
* `participants`: `participant_id`, group ID, participant details.
* `check_ins`: `check_in_id`, participant ID, timestamp, volunteer ID.
* `users`: `user_id`, role.

## 10. Technical architecture

* **Frontend:** Next.js with a responsive, mobile-first interface.
* **Backend:** Next.js server actions.
* **Database:** PostgreSQL using Supabase.
* **Authentication:** Supabase Auth (Email for Admins, Magic Links for Volunteers).
* **QR Generation:** Server-side generation using a simple UUID/token.
* **QR Scanning:** Browser-based camera scanning.

## 11. Non-functional requirements

* **Performance:** Sub-two-second verification response time.
* **Security:** Server-side validation, secure tokens, no PII directly in QR payload.
* **Reliability:** Clear error states if venue internet drops.
* **Recovery:** Easy export of printable rosters to handle offline scenarios smoothly.

## 12. Acceptance criteria

* Advance registrations imported from CSV/XLSX.
* Payment screenshots are viewable by Admins and can be marked as "Approved".
* Invalid rows reported and not silently accepted.
* Every approved registration receives a unique QR token.
* On-spot registrations issue a QR immediately.
* A valid QR code results in exactly one successful check-in via atomic transaction.
* Dashboard correctly distinguishes registrations, groups, and attendance.
* A printed roster export is available for network-failure fallback.

## 13. Delivery plan

* **Phase 1:** Database, auth, event/track configuration.
* **Phase 2:** Spreadsheet upload, duplicate detection, payment review workflow.
* **Phase 3:** QR generation and email distribution.
* **Phase 4:** On-spot registration form.
* **Phase 5:** Dashboard, group verification, reporting (including backup roster export).
* **Phase 6:** Google Sheets integration.
* **Phase 7:** Testing, mobile device testing, failure recovery drills.
* **Phase 8:** Deployment.
