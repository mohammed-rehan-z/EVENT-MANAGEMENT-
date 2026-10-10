# Technical Specification Document (TSD)
**Universal Event Registration & QR Check-in System**

## 1. Architecture Overview
* **Framework**: Next.js (App Router)
* **Styling & Components**: Tailwind CSS, **shadcn/ui** (primary UI primitives), and optionally **Material-UI (MUI)** for complex data-heavy components (like DataGrids) if needed. 
* **Database & Auth**: Supabase (PostgreSQL + Supabase Auth)
* **Hosting**: Vercel
* **QR Scanning**: `html5-qrcode` or `@zxing/library` for browser-based scanning.
* **QR Generation**: `qrcode` npm package for server-side generation.

---

## 2. Database Schema (Supabase PostgreSQL)

### 2.1 `events`
* `id` (UUID, Primary Key)
* `name` (Text)
* `start_date` (Timestamp)
* `end_date` (Timestamp)
* `capacity` (Integer)
* `created_at` (Timestamp)

### 2.2 `event_tracks` (Replaces `game_categories`)
* `id` (UUID, Primary Key)
* `event_id` (UUID, Foreign Key -> `events.id`)
* `name` (Text, e.g., "Hackathon - Web3", "Valorant", "Conference Speaker")
* `max_group_size` (Integer, e.g., 5, 4, 1)

### 2.3 `registrations`
* `id` (UUID, Primary Key)
* `type` (Enum: `INDIVIDUAL`, `GROUP`)
* `source` (Enum: `ADVANCE`, `ON_SPOT`)
* `status` (Enum: `PENDING_REVIEW`, `APPROVED`, `REJECTED`)
* `email` (Text)
* `phone` (Text)
* `payment_screenshot_url` (Text, Nullable - Path to Supabase Storage)
* `qr_token` (UUID, Unique, generated upon `APPROVED` status)
* `created_at` (Timestamp)

### 2.4 `groups` (Replaces `teams`, Nullable for individuals)
* `id` (UUID, Primary Key)
* `registration_id` (UUID, Foreign Key -> `registrations.id`)
* `track_id` (UUID, Foreign Key -> `event_tracks.id`)
* `name` (Text)

### 2.5 `participants` (Replaces `team_members`)
* `id` (UUID, Primary Key)
* `group_id` (UUID, Nullable, Foreign Key -> `groups.id`)
* `registration_id` (UUID, Nullable, Foreign Key -> `registrations.id` - for individuals)
* `full_name` (Text)
* `identifier` (Text, Nullable - e.g., in-game name, student ID, company name)

### 2.6 `check_ins`
* `id` (UUID, Primary Key)
* `participant_id` (UUID, Foreign Key -> `participants.id`)
* `volunteer_id` (UUID, Foreign Key -> `users.id`)
* `timestamp` (Timestamp)

### 2.7 `users` (Supabase Auth mapping)
* `id` (UUID, Primary Key -> matches `auth.users.id`)
* `role` (Enum: `ADMIN`, `VOLUNTEER`)
* `full_name` (Text)

---

## 3. API & Server Actions

With Next.js App Router, most database interactions will happen via **Server Actions** to keep secrets safe and reduce client-side bundle size.

* **`approveRegistration(registrationId)`**: Changes status to `APPROVED`, generates a unique UUID for `qr_token`, and triggers email dispatch.
* **`uploadPaymentScreenshot(formData)`**: Uploads image to Supabase Storage bucket and attaches the URL to the registration record.
* **`verifyQRCode(qrToken)`**: Fetches the registration and group roster associated with the token.
* **`recordCheckIn(participantIds[], volunteerId)`**: Atomic transaction inserting rows into `check_ins` for the selected members. Fails if a member is already checked in.
* **`exportFallbackRoster(eventId)`**: Generates a CSV file of all approved attendees for offline fallback.

---

## 4. UI & Component Strategy

* **Shadcn/ui**: Will be used for the vast majority of the application to ensure a modern, accessible, and fast UI (Buttons, Dialogs, Cards, Forms, Toasts).
* **Material-UI (MUI)**: While `shadcn` is generally sufficient, MUI can be introduced specifically for the **Admin Dashboard Data Tables** if advanced filtering, sorting, and pagination (via MUI DataGrid) are heavily desired without building them from scratch.
* **Forms**: `react-hook-form` + `zod` for robust client/server validation.

---

## 5. Security & Row Level Security (RLS)

* **Volunteers**: Can read `registrations`, `groups`, `participants`. Can insert `check_ins`. Cannot modify `events` or delete records.
* **Admins**: Full CRUD access across all tables.
* **Public/Walk-ins**: Can insert into `registrations`, `groups`, `participants` during On-Spot registration. Cannot read other attendees' data.

---

## 6. Implementation Phases
1. **Initialize Project**: Next.js, Tailwind, Shadcn/ui CLI.
2. **Database Setup**: Apply SQL schema to Supabase and configure Storage for payment screenshots.
3. **Admin Dashboard**: Build the views to list pending registrations and verify payments.
4. **QR Generation**: Integrate `qrcode` and email dispatch upon approval.
5. **Scanner App**: Build the volunteer-facing mobile-responsive scanner view.
6. **Offline Roster**: Build the export functionality.
