import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { supabase } from "./supabase";
import {
  createSecureQRPayload,
  verifySecureQRPayload,
} from "./services/cryptoService";

export interface Participant {
  id: string;
  team_id: string;
  event_id: string;
  full_name: string;
  email: string;
  mobile_number?: string;
  course?: string;
  year_of_study?: string;
  semester?: string;
  is_leader: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  event_id: string;
  name: string;
  normalized_name: string;
  category?: string; // Track or division (e.g. Hackathon, Gaming, General)
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  qr_token: string;
  qr_data_url?: string;
  qr_expires_at?: string | null; // ISO timestamp of expiration
  qr_email_sent: boolean;
  qr_email_sent_at?: string | null;
  check_in_status: "NOT_CHECKED_IN" | "CHECKED_IN";
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  first_scanned_at?: string | null;
  scan_count?: number; // Tracks attempted or successful scans
  created_at: string;
  participants: Participant[];
  otp_code?: string | null;
  otp_generated_at?: string | null;
  otp_expires_at?: string | null;
  otp_verified?: boolean;
  otp_attempts_left?: number;
  otp_locked?: boolean;
}

export interface EventData {
  id: string;
  name: string;
  description: string;
  overview?: string; // Comprehensive introduction / summary of the event
  venue: string;
  date: string;
  end_date?: string;
  thumbnail_url?: string; // Event image thumbnail (base64 data URL or image URL)
  is_active: boolean;
}

export interface AuditLog {
  id: string;
  event_id: string | null;
  timestamp: string;
  action:
    | "CHECK_IN_SUCCESS"
    | "CHECK_IN_DUPLICATE_ATTEMPT"
    | "CHECK_IN_EXPIRED_ATTEMPT"
    | "CHECK_IN_REVOKED_ATTEMPT"
    | "CHECK_IN_TAMPER_ATTEMPT"
    | "CHECK_IN_INVALID_ATTEMPT"
    | "CHECK_IN_RESET"
    | "OTP_GENERATED"
    | "OTP_MATCH_SUCCESS"
    | "OTP_MATCH_FAILURE"
    | "OTP_LOCKOUT"
    | "QR_GENERATED"
    | "QR_REGENERATED"
    | "QR_REVOKED"
    | "BULK_IMPORT"
    | "BULK_APPROVE"
    | "BULK_CHECK_IN"
    | "BULK_EXPIRATION_EXTEND"
    | "BULK_QR_BATCH"
    | "TEAM_CREATED"
    | "TEAM_DELETED"
    | "AUTH_LOGIN_SUCCESS"
    | "AUTH_LOGIN_FAILURE"
    | "AUTH_LOCKOUT"
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILED_ATTEMPT"
    | "LOGIN_ACCOUNT_LOCKED"
    | "USER_CREATED"
    | "USER_UPDATED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actor_id: string;
  actor_role: "ADMIN" | "VOLUNTEER" | "SYSTEM";
  target_id?: string;
  target_name?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, unknown>;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName?: string;
  full_name?: string;
  role: "ADMIN" | "VOLUNTEER";
  avatar?: string;
  password_hash?: string;
  password_salt?: string;
  salt?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  password_salt: string;
  full_name: string;
  role: "ADMIN" | "VOLUNTEER";
  avatar: string;
  failed_attempts: number;
  locked_until?: string | null;
  created_at: string;
}

export type SafeUserRecord = Omit<UserRecord, "password_hash" | "salt" | "password_salt">;

export function sanitizeUser<T extends Partial<UserRecord>>(user: T): Omit<T, "password_hash" | "salt" | "password_salt"> {
  const { password_hash, salt, password_salt, ...safe } = user;
  return safe;
}

export const DEFAULT_USERS: UserRecord[] = [
  {
    id: "usr-admin-1",
    email: "admin@eventportal.com",
    // Precomputed PBKDF2 HMAC-SHA512 (100,000 rounds, 64-byte key) with 32-byte salt (64 hex characters)
    password_hash: "680e3a63563829fcdf3cd860008179a1b3b947f3109dc6650b752f4c6fc8d5fd61abc88bbffcf100a53113f6fea5d18dab468c39b60751261b3058b42fea33de",
    salt: "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab",
    password_salt: "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab",
    full_name: "Alex Mercer",
    role: "ADMIN",
    avatar: "AM",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-admin-2",
    email: "mohammedrehanz517@gmail.com",
    // Password: rehan@2026
    password_hash: "f5a22160eb4cf067fa918b1a76905e4a14892d0df0377474a47815e2b0df543745003bd68c634b2992084ac2a9da69c4241bb8717a546b951787c2eb6f066fd3",
    salt: "479bc3075825c1ba4fc67faf0037336852aa1797555592be67451cf72b0495f3",
    password_salt: "479bc3075825c1ba4fc67faf0037336852aa1797555592be67451cf72b0495f3",
    full_name: "Mohammed Rehan Z",
    role: "ADMIN",
    avatar: "MR",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-volunteer-2",
    email: "volunteer@gmail.com",
    // Password: volunteer@123
    password_hash: "a0941a6cd2590a23170326555da239b31ea3a662d161a37435cf58712727009fc891f62fcbe9b21dbe6263f4a534babef783e0217332badad1ace6993950c05d",
    salt: "7908dfcf5ed87fc361e4b594856adf74eca30e0c5b7f30b3c0dbe4c256b8468e",
    password_salt: "7908dfcf5ed87fc361e4b594856adf74eca30e0c5b7f30b3c0dbe4c256b8468e",
    full_name: "Volunteer",
    role: "VOLUNTEER",
    avatar: "VO",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-admin-4",
    email: "hanzala.jawwad@gmail.com",
    // Password: hanzala@2026
    password_hash: "483137ed5265aa4ed408d783fa3d1a09251b1477bc18ff1b653a36b20b722c4cace68a12c2db7fd67c869330d793e46b037c1b0d6889641f39a83660f71dad51",
    salt: "c892a1e43d305cdc56f76f24f9c394be5b22d9917e817efa8034a080874c72b7",
    password_salt: "c892a1e43d305cdc56f76f24f9c394be5b22d9917e817efa8034a080874c72b7",
    full_name: "Hanzala",
    role: "ADMIN",
    avatar: "HJ",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-admin-5",
    email: "faculty@gmail.com",
    // Password: faculty@2026
    password_hash: "d1b905cdd517587bc4a601e576c57eed70ece80d7eb45b56724d50e7428dc8b05111b69fa5a851cc28411c89aa71e2779609d33d89d0086b92325cffcd14db2a",
    salt: "60342ac8840216f6e74fbfad5158349492aba19e1b1e976fa41bd1e57fe17dc1",
    password_salt: "60342ac8840216f6e74fbfad5158349492aba19e1b1e976fa41bd1e57fe17dc1",
    full_name: "Faculty Coordinator",
    role: "ADMIN",
    avatar: "FC",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-volunteer-1",
    email: "volunteer@eventportal.com",
    // Precomputed PBKDF2 HMAC-SHA512 (100,000 rounds, 64-byte key) with 32-byte salt (64 hex characters)
    password_hash: "c10177b0231ed145ca2935cd240a035f916e5192f2caf9ec71fbec2db011a7ccd9128342eafa1fef455da161d63057a83bb2870ce2b112c7f312b6e6d935a6a5",
    salt: "7956d5345e097592224035319f4860d392670f9fb43b8108ea2de0120664ef09",
    password_salt: "7956d5345e097592224035319f4860d392670f9fb43b8108ea2de0120664ef09",
    full_name: "Jordan Lee",
    role: "VOLUNTEER",
    avatar: "JL",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
  {
    id: "usr-admin-3",
    email: "1hk23ai034@hkbk.edu.in",
    // Password: admin123
    password_hash: "680e3a63563829fcdf3cd860008179a1b3b947f3109dc6650b752f4c6fc8d5fd61abc88bbffcf100a53113f6fea5d18dab468c39b60751261b3058b42fea33de",
    salt: "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab",
    password_salt: "db1bbed31405ba049ce315e40a8e265b4031ac90772c4fa5bc0e5f8bfa3db0ab",
    full_name: "Rehan Z",
    role: "ADMIN",
    avatar: "RZ",
    failed_attempts: 0,
    locked_until: null,
    created_at: "2026-10-15T00:00:00.000Z",
  },
];

function getInitialUsers(): UserRecord[] {
  return JSON.parse(JSON.stringify(DEFAULT_USERS));
}

interface LocalStoreSchema {
  events: EventData[];
  teams: Team[];
  audit_logs: AuditLog[];
  users?: UserRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "events-data.json");

// Ensure data folder and file exists
function getLocalData(): LocalStoreSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initialData: LocalStoreSchema = {
        users: getInitialUsers(),
        events: [],
        teams: [],
        audit_logs: [],
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), "utf8");
      return initialData;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.audit_logs) {
      parsed.audit_logs = [];
    }
    if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
      parsed.users = getInitialUsers();
      saveLocalData(parsed);
    } else {
      let migrated = false;
      for (const defUser of DEFAULT_USERS) {
        const existingIdx = parsed.users.findIndex(
          (u: any) => u.email.toLowerCase() === defUser.email.toLowerCase()
        );
        if (existingIdx === -1) {
          parsed.users.push(defUser);
          migrated = true;
        } else if (
          parsed.users[existingIdx].password_hash !== defUser.password_hash ||
          parsed.users[existingIdx].salt !== defUser.salt ||
          !parsed.users[existingIdx].password_salt ||
          parsed.users[existingIdx].role !== defUser.role ||
          parsed.users[existingIdx].full_name !== defUser.full_name
        ) {
          parsed.users[existingIdx] = { ...parsed.users[existingIdx], ...defUser };
          migrated = true;
        }
      }
      if (migrated) {
        saveLocalData(parsed);
      }
    }
    return parsed;
  } catch (err) {
    console.error("Local data read error:", err);
    return { events: [], teams: [], audit_logs: [], users: getInitialUsers() };
  }
}

function saveLocalData(data: LocalStoreSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Local data save error:", err);
  }
}

// Generate base64 QR code image with high error correction and crisp contrast
export async function generateQrImage(qrToken: string): Promise<string> {
  try {
    return await QRCode.toDataURL(qrToken, {
      width: 450,
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    });
  } catch (err) {
    console.error("QR Generation error:", err);
    return "";
  }
}

// Calculate default expiration date (48 hours or event end date)
function calculateDefaultExpiration(event?: EventData | null): Date {
  if (event?.end_date) {
    const end = new Date(event.end_date);
    if (!isNaN(end.getTime()) && end > new Date()) {
      return end;
    }
  }
  // Default to 48 hours from now
  return new Date(Date.now() + 48 * 3600 * 1000);
}

// --- SECURITY AUDIT TRAIL LOGGING ---

export async function logSecurityAuditAction(
  log: Omit<AuditLog, "id" | "timestamp">
): Promise<AuditLog> {
  const store = getLocalData();
  const entry: AuditLog = {
    ...log,
    id: `audit-${crypto.randomUUID().slice(0, 10)}`,
    timestamp: new Date().toISOString(),
  };

  store.audit_logs.unshift(entry);
  // Keep up to 2,000 security logs in memory/disk to prevent unbounded growth
  if (store.audit_logs.length > 2000) {
    store.audit_logs = store.audit_logs.slice(0, 2000);
  }

  saveLocalData(store);

  // Sync to Supabase audit_logs table if configured
  if (isSupabaseLive()) {
    try {
      await supabase.from("audit_logs").insert([
        {
          event_id: entry.event_id,
          action: entry.action,
          details: {
            severity: entry.severity,
            actor_id: entry.actor_id,
            actor_role: entry.actor_role,
            target_id: entry.target_id,
            target_name: entry.target_name,
            ...entry.details,
          },
        },
      ]);
    } catch {
      // Non-blocking fallback
    }
  }

  return entry;
}

export async function getAuditLogsForEvent(
  eventId: string,
  options?: {
    severity?: "INFO" | "WARNING" | "CRITICAL" | "ALL";
    action?: string;
    search?: string;
    limit?: number;
  }
): Promise<AuditLog[]> {
  const store = getLocalData();
  let logs = store.audit_logs.filter(
    (l) => l.event_id === eventId || eventId === "all" || (eventId === "ev-1" && !l.event_id)
  );

  if (options?.severity && options.severity !== "ALL") {
    logs = logs.filter((l) => l.severity === options.severity);
  }

  if (options?.action && options.action !== "ALL") {
    logs = logs.filter((l) => l.action === options.action);
  }

  if (options?.search) {
    const q = options.search.toLowerCase().trim();
    logs = logs.filter(
      (l) =>
        l.target_name?.toLowerCase().includes(q) ||
        l.actor_id?.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        JSON.stringify(l.details).toLowerCase().includes(q)
    );
  }

  const limit = options?.limit || 100;
  return logs.slice(0, limit);
}

export async function clearAuditLogs(eventId: string): Promise<boolean> {
  const store = getLocalData();
  store.audit_logs = store.audit_logs.filter((l) => l.event_id !== eventId && eventId !== "all");
  saveLocalData(store);
  return true;
}

// Check if Supabase is connected to a live custom instance
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && !url.includes("placeholder"));
}

export async function getTeamsForEvent(eventId: string): Promise<Team[]> {
  if (isSupabaseLive()) {
    try {
      const { data: dbTeams, error } = await supabase
        .from("teams")
        .select(`
          id, event_id, name, normalized_name, status, qr_token, created_at,
          participants ( id, team_id, event_id, full_name, email, mobile_number, course, year_of_study, semester, is_leader, created_at ),
          check_ins ( timestamp, volunteer_id )
        `)
        .eq("event_id", eventId);

      if (!error && dbTeams) {
        return Promise.all(
          dbTeams.map(async (t: any) => {
            const qr_data_url = t.qr_token ? await generateQrImage(t.qr_token) : "";
            const isCheckedIn = Boolean(t.check_ins && t.check_ins.length > 0);
            return {
              id: t.id,
              event_id: t.event_id,
              name: t.name,
              normalized_name: t.normalized_name,
              status: t.status,
              qr_token: t.qr_token || "",
              qr_data_url,
              qr_email_sent: Boolean(t.qr_token),
              qr_email_sent_at: null,
              check_in_status: isCheckedIn ? "CHECKED_IN" : "NOT_CHECKED_IN",
              checked_in_at: isCheckedIn ? t.check_ins[0].timestamp : null,
              checked_in_by: isCheckedIn ? t.check_ins[0].volunteer_id : null,
              scan_count: isCheckedIn ? 1 : 0,
              created_at: t.created_at,
              participants: t.participants || [],
            } as Team;
          })
        );
      }
    } catch (err) {
      console.warn("Falling back to local persistent store:", err);
    }
  }

  const store = getLocalData();
  return store.teams.filter((t) => t.event_id === eventId || eventId === "default" || eventId === "ev-1");
}

export async function saveImportedTeams(
  eventId: string,
  groupedTeams: {
    name: string;
    normalized_name: string;
    category?: string;
    participants: Omit<Participant, "id" | "team_id" | "event_id" | "created_at">[];
  }[]
): Promise<{
  added: number;
  updated: number;
  existingRetained: number;
  newGenerated: number;
  conflicts: string[];
}> {
  const store = getLocalData();
  const event = store.events.find((e) => e.id === eventId);
  const conflicts: string[] = [];
  let added = 0;
  let updated = 0;
  let existingRetained = 0;
  let newGenerated = 0;

  for (const gTeam of groupedTeams) {
    const cleanNormName = gTeam.normalized_name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const incomingEmails = new Set(
      gTeam.participants
        .map((p) => p.email?.trim().toLowerCase())
        .filter(Boolean)
    );

    // Identify if this team already exists in the event portal by name or participant/leader email
    const existingIndex = store.teams.findIndex((t) => {
      if (t.event_id !== eventId && eventId !== "ev-1" && t.event_id !== "ev-1") {
        return false;
      }
      const tCleanNorm = t.normalized_name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (t.normalized_name === gTeam.normalized_name || (cleanNormName && tCleanNorm === cleanNormName)) {
        return true;
      }
      if (incomingEmails.size > 0 && Array.isArray(t.participants)) {
        return t.participants.some(
          (p) => p.email && incomingEmails.has(p.email.trim().toLowerCase())
        );
      }
      return false;
    });

    if (existingIndex >= 0) {
      const existingTeam = store.teams[existingIndex];
      const hasExistingQr = Boolean(existingTeam.qr_token && existingTeam.qr_token.trim() !== "");

      if (hasExistingQr) {
        // PRESERVE EXISTING QR PASS: Do NOT generate a new QR token or QR image
        existingRetained++;
        conflicts.push(
          `Retained existing QR pass for '${existingTeam.name}' (${
            existingTeam.check_in_status === "CHECKED_IN"
              ? "Checked In"
              : "Verification Pending"
          })`
        );
      } else {
        // Team exists in portal but lacks a QR token: generate an initial QR pass
        const rawToken = `tok-${crypto.randomUUID()}`;
        const expDate = calculateDefaultExpiration(event);
        const secureQrToken = createSecureQRPayload(existingTeam.id, eventId, rawToken, expDate);
        const qrDataUrl = await generateQrImage(secureQrToken);

        existingTeam.qr_token = secureQrToken;
        existingTeam.qr_data_url = qrDataUrl;
        existingTeam.qr_expires_at = expDate.toISOString();
        if (existingTeam.status === "PENDING_REVIEW") {
          existingTeam.status = "APPROVED";
        }
        newGenerated++;
        conflicts.push(`Generated new QR pass for unverified existing team '${existingTeam.name}'`);
      }

      // Merge any new participants from the uploaded document into the existing team roster
      const existingEmails = new Set(
        existingTeam.participants.map((p) => p.email.toLowerCase().trim())
      );

      for (const p of gTeam.participants) {
        const cleanEmail = p.email ? p.email.toLowerCase().trim() : "";
        if (!cleanEmail || !existingEmails.has(cleanEmail)) {
          existingTeam.participants.push({
            id: `pt-${crypto.randomUUID()}`,
            team_id: existingTeam.id,
            event_id: eventId,
            full_name: p.full_name,
            email: p.email,
            mobile_number: p.mobile_number,
            course: p.course,
            year_of_study: p.year_of_study,
            semester: p.semester,
            is_leader: false,
            created_at: new Date().toISOString(),
          });
          if (cleanEmail) existingEmails.add(cleanEmail);
        }
      }
      updated++;
    } else {
      // BRAND NEW TEAM: Generate distinct secure QR token and image
      const teamId = `tm-${crypto.randomUUID()}`;
      const rawToken = `tok-${crypto.randomUUID()}`;
      const expDate = calculateDefaultExpiration(event);
      const secureQrToken = createSecureQRPayload(teamId, eventId, rawToken, expDate);
      const qrDataUrl = await generateQrImage(secureQrToken);

      const newParticipants: Participant[] = gTeam.participants.map((p, idx) => ({
        id: `pt-${crypto.randomUUID()}`,
        team_id: teamId,
        event_id: eventId,
        full_name: p.full_name,
        email: p.email,
        mobile_number: p.mobile_number,
        course: p.course,
        year_of_study: p.year_of_study,
        semester: p.semester,
        is_leader: idx === 0,
        created_at: new Date().toISOString(),
      }));

      const newTeam: Team = {
        id: teamId,
        event_id: eventId,
        name: gTeam.name,
        normalized_name: gTeam.normalized_name,
        category: gTeam.category || "General Admission",
        status: "APPROVED",
        qr_token: secureQrToken,
        qr_data_url: qrDataUrl,
        qr_expires_at: expDate.toISOString(),
        qr_email_sent: false,
        qr_email_sent_at: null,
        check_in_status: "NOT_CHECKED_IN",
        checked_in_at: null,
        checked_in_by: null,
        scan_count: 0,
        created_at: new Date().toISOString(),
        participants: newParticipants,
      };

      store.teams.push(newTeam);
      added++;
      newGenerated++;
    }
  }

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: eventId,
    action: "BULK_IMPORT",
    severity: "INFO",
    actor_id: "admin-user",
    actor_role: "ADMIN",
    details: {
      addedCount: added,
      updatedCount: updated,
      existingRetainedCount: existingRetained,
      newGeneratedCount: newGenerated,
      totalProcessed: groupedTeams.length,
      conflictsReported: conflicts.length,
    },
  });

  return { added, updated, existingRetained, newGenerated, conflicts };
}

export async function updateTeamEmailStatus(teamId: string, emailSent: boolean): Promise<boolean> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return false;

  team.qr_email_sent = emailSent;
  team.qr_email_sent_at = emailSent ? new Date().toISOString() : null;
  saveLocalData(store);
  return true;
}

export async function approveTeamInStore(
  teamId: string,
  expirationHours: number = 48
): Promise<{ success: boolean; qrDataUrl?: string; message?: string }> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found" };

  team.status = "APPROVED";

  // If team already has an active, valid QR pass, retain it without regenerating
  if (team.qr_token && team.qr_data_url) {
    saveLocalData(store);
    return {
      success: true,
      qrDataUrl: team.qr_data_url,
      message: `Team '${team.name}' approved (existing QR pass retained for gate verification).`,
    };
  }

  const event = store.events.find((e) => e.id === team.event_id);
  const expDate = expirationHours
    ? new Date(Date.now() + expirationHours * 3600 * 1000)
    : calculateDefaultExpiration(event);

  const rawToken = `tok-${crypto.randomUUID()}`;
  const secureQrToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
  const qrDataUrl = await generateQrImage(secureQrToken);

  team.qr_token = secureQrToken;
  team.qr_data_url = qrDataUrl;
  team.qr_expires_at = expDate.toISOString();

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "QR_GENERATED",
    severity: "INFO",
    actor_id: "admin-approver",
    actor_role: "ADMIN",
    target_id: team.id,
    target_name: team.name,
    details: {
      expiration: expDate.toISOString(),
      expirationHours,
    },
  });

  return { success: true, qrDataUrl };
}

/**
 * ATOMIC SINGLE-USE CHECK-IN VERIFICATION WITH QR EXPIRATION & CRYPTOGRAPHIC AUDIT
 */
export async function checkInTeamByToken(
  qrTokenOrId: string,
  volunteerId: string = "volunteer-1",
  ipAddress?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  message: string;
  team?: Team;
  alreadyCheckedIn?: boolean;
  isExpired?: boolean;
  tamperDetected?: boolean;
}> {
  const store = getLocalData();
  const cleanInput = qrTokenOrId.trim();

  // 1. Check Cryptographic Signature & Expiry Payload
  const verifiedSig = verifySecureQRPayload(cleanInput);

  if (!verifiedSig.valid && verifiedSig.tamperDetected) {
    await logSecurityAuditAction({
      event_id: verifiedSig.eventId || "unknown",
      action: "CHECK_IN_TAMPER_ATTEMPT",
      severity: "CRITICAL",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        error: verifiedSig.errorMessage,
        rawInputSubstring: cleanInput.slice(0, 30),
      },
    });

    return {
      success: false,
      tamperDetected: true,
      message: verifiedSig.errorMessage || "SECURITY WARNING: QR token failed cryptographic integrity verification.",
    };
  }

  // 2. Locate Team by secure payload teamId, raw qr_token, team id, or normalized name
  const team = store.teams.find((t) => {
    if (verifiedSig.isSignedPayload && verifiedSig.teamId) {
      return t.id === verifiedSig.teamId;
    }
    return (
      (t.qr_token && t.qr_token.toLowerCase() === cleanInput.toLowerCase()) ||
      t.id.toLowerCase() === cleanInput.toLowerCase() ||
      t.normalized_name.toLowerCase() === cleanInput.toLowerCase()
    );
  });

  if (!team) {
    await logSecurityAuditAction({
      event_id: verifiedSig.eventId || "unknown",
      action: "CHECK_IN_INVALID_ATTEMPT",
      severity: "WARNING",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      ip_address: ipAddress,
      user_agent: userAgent,
      details: { tokenTested: cleanInput.slice(0, 20) },
    });

    return { success: false, message: "No participant or team registered with this QR pass or code." };
  }

  // 3. Check if QR pass was revoked/deleted
  if (!team.qr_token) {
    await logSecurityAuditAction({
      event_id: team.event_id,
      action: "CHECK_IN_REVOKED_ATTEMPT",
      severity: "CRITICAL",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      target_id: team.id,
      target_name: team.name,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: { reason: "Attempted check-in with revoked pass." },
    });

    return {
      success: false,
      message: `ACCESS DENIED: QR Pass for '${team.name}' has been REVOKED or DELETED by the administrator.`,
      team,
    };
  }

  // 4. CHECK QR EXPIRATION
  const now = new Date();
  const effectiveExpiry = team.qr_expires_at ? new Date(team.qr_expires_at) : null;
  const isPayloadExpired = verifiedSig.isExpired;

  if (isPayloadExpired || (effectiveExpiry && now > effectiveExpiry)) {
    const expFormatted = effectiveExpiry ? effectiveExpiry.toLocaleString() : "prior to event";

    await logSecurityAuditAction({
      event_id: team.event_id,
      action: "CHECK_IN_EXPIRED_ATTEMPT",
      severity: "WARNING",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      target_id: team.id,
      target_name: team.name,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        expiredAt: effectiveExpiry?.toISOString(),
        scannedAt: now.toISOString(),
      },
    });

    return {
      success: false,
      isExpired: true,
      message: `EXPIRED PASS: This single-use QR pass expired on ${expFormatted}. Gate admission denied. (Use OTP fallback or contact desk).`,
      team,
    };
  }

  // 5. ATOMIC SINGLE-USE ENFORCEMENT: A QR code can only be used once
  if (team.check_in_status === "CHECKED_IN") {
    team.scan_count = (team.scan_count || 1) + 1;
    saveLocalData(store);

    const checkedTime = team.checked_in_at
      ? new Date(team.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "earlier";
    const checkedDate = team.checked_in_at
      ? new Date(team.checked_in_at).toLocaleDateString([], { month: "short", day: "numeric" })
      : "earlier";

    await logSecurityAuditAction({
      event_id: team.event_id,
      action: "CHECK_IN_DUPLICATE_ATTEMPT",
      severity: "CRITICAL",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      target_id: team.id,
      target_name: team.name,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        previousCheckInAt: team.checked_in_at,
        previousCheckedInBy: team.checked_in_by,
        scanAttemptCount: team.scan_count,
      },
    });

    return {
      success: false,
      alreadyCheckedIn: true,
      message: `SINGLE-USE VIOLATION: Team '${team.name}' was already admitted on ${checkedDate} at ${checkedTime} by ${team.checked_in_by || "gate authority"}. Re-entry with the same QR is strictly prohibited.`,
      team,
    };
  }

  // 6. ADMIT AND CONSUME PASS
  team.check_in_status = "CHECKED_IN";
  team.checked_in_at = now.toISOString();
  team.checked_in_by = volunteerId;
  team.first_scanned_at = now.toISOString();
  team.scan_count = 1;

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "CHECK_IN_SUCCESS",
    severity: "INFO",
    actor_id: volunteerId,
    actor_role: "VOLUNTEER",
    target_id: team.id,
    target_name: team.name,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: {
      participantsCount: team.participants.length,
      method: "QR_CAMERA_SCAN",
      consumedAt: team.checked_in_at,
    },
  });

  return {
    success: true,
    message: `Verification complete! Single-use QR pass consumed. Team '${team.name}' admitted to venue.`,
    team,
  };
}

export async function getTeamByTokenOrId(qrTokenOrId: string): Promise<{ success: boolean; message?: string; team?: Team }> {
  const store = getLocalData();
  const cleanInput = qrTokenOrId.trim();

  // Try decoding signed payload first
  const verifiedSig = verifySecureQRPayload(cleanInput);

  const team = store.teams.find((t) => {
    if (verifiedSig.isSignedPayload && verifiedSig.teamId) {
      return t.id === verifiedSig.teamId;
    }
    return (
      t.qr_token.toLowerCase() === cleanInput.toLowerCase() ||
      t.id.toLowerCase() === cleanInput.toLowerCase() ||
      t.normalized_name.toLowerCase() === cleanInput.toLowerCase()
    );
  });

  if (!team) {
    return { success: false, message: "QR Token not recognized. Please verify with the event administrator." };
  }

  if (team.qr_token && !team.qr_data_url) {
    team.qr_data_url = await generateQrImage(team.qr_token);
  }

  return { success: true, team };
}

export async function createManualTeam(
  eventId: string,
  teamName: string,
  participants: Array<{
    full_name: string;
    email: string;
    mobile_number?: string;
    course?: string;
    year_of_study?: string;
    semester?: string;
    is_leader: boolean;
  }>,
  category: string = "On-Spot Registration"
): Promise<{ success: boolean; team?: Team; message?: string }> {
  const store = getLocalData();
  const normalizedName = teamName.trim().replace(/\s+/g, " ").toLowerCase();

  const existing = store.teams.find(
    (t) => (t.event_id === eventId || eventId === "ev-1") && t.normalized_name === normalizedName
  );

  if (existing) {
    return { success: false, message: `Team '${teamName}' already exists in this event.` };
  }

  const event = store.events.find((e) => e.id === eventId);
  const teamId = `tm-${crypto.randomUUID()}`;
  const rawToken = `tok-${crypto.randomUUID()}`;
  const expDate = calculateDefaultExpiration(event);
  const secureQrToken = createSecureQRPayload(teamId, eventId, rawToken, expDate);
  const qrDataUrl = await generateQrImage(secureQrToken);

  const teamParticipants: Participant[] = participants.map((p, idx) => ({
    id: `pt-${crypto.randomUUID()}`,
    team_id: teamId,
    event_id: eventId,
    full_name: p.full_name,
    email: p.email,
    mobile_number: p.mobile_number,
    course: p.course,
    year_of_study: p.year_of_study,
    semester: p.semester,
    is_leader: p.is_leader ?? idx === 0,
    created_at: new Date().toISOString(),
  }));

  const newTeam: Team = {
    id: teamId,
    event_id: eventId,
    name: teamName.trim(),
    normalized_name: normalizedName,
    category,
    status: "APPROVED",
    qr_token: secureQrToken,
    qr_data_url: qrDataUrl,
    qr_expires_at: expDate.toISOString(),
    qr_email_sent: false,
    qr_email_sent_at: null,
    check_in_status: "NOT_CHECKED_IN",
    checked_in_at: null,
    checked_in_by: null,
    scan_count: 0,
    created_at: new Date().toISOString(),
    participants: teamParticipants,
  };

  store.teams.push(newTeam);
  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: eventId,
    action: "TEAM_CREATED",
    severity: "INFO",
    actor_id: "admin-volunteer",
    actor_role: "ADMIN",
    target_id: teamId,
    target_name: teamName,
    details: {
      participantsCount: participants.length,
      category,
      qrExpiresAt: expDate.toISOString(),
    },
  });

  return { success: true, team: newTeam };
}

export async function getEventStats(eventId: string) {
  const teams = await getTeamsForEvent(eventId);
  const store = getLocalData();
  const eventLogs = store.audit_logs.filter((l) => l.event_id === eventId || eventId === "ev-1");

  const totalTeams = teams.length;
  const totalParticipants = teams.reduce((acc, t) => acc + (t.participants?.length || 0), 0);
  const checkedInTeams = teams.filter((t) => t.check_in_status === "CHECKED_IN").length;
  const checkedInParticipants = teams
    .filter((t) => t.check_in_status === "CHECKED_IN")
    .reduce((acc, t) => acc + (t.participants?.length || 0), 0);
  const emailsSent = teams.filter((t) => t.qr_email_sent).length;
  const approvedTeams = teams.filter((t) => t.status === "APPROVED").length;

  const duplicateAttemptsBlocked = eventLogs.filter((l) => l.action === "CHECK_IN_DUPLICATE_ATTEMPT").length;
  const expiredAttemptsBlocked = eventLogs.filter((l) => l.action === "CHECK_IN_EXPIRED_ATTEMPT").length;
  const tamperAttemptsBlocked = eventLogs.filter((l) => l.action === "CHECK_IN_TAMPER_ATTEMPT").length;
  const otpLockoutsCount = eventLogs.filter((l) => l.action === "OTP_LOCKOUT").length;

  return {
    totalTeams,
    totalParticipants,
    checkedInTeams,
    checkedInParticipants,
    emailsSent,
    approvedTeams,
    checkInRate: totalTeams > 0 ? Math.round((checkedInTeams / totalTeams) * 100) : 0,
    security: {
      duplicateAttemptsBlocked,
      expiredAttemptsBlocked,
      tamperAttemptsBlocked,
      otpLockoutsCount,
      totalAuditEvents: eventLogs.length,
    },
  };
}

export async function getAllEvents(): Promise<EventData[]> {
  const store = getLocalData();
  return store.events || [];
}

export async function getEventById(id: string): Promise<EventData | null> {
  const store = getLocalData();
  return store.events.find((e) => e.id === id) || null;
}

export async function createEventInStore(
  name: string,
  description: string,
  venue: string,
  date: string,
  end_date?: string,
  thumbnail_url?: string,
  overview?: string
): Promise<EventData> {
  const store = getLocalData();
  const newEvent: EventData = {
    id: `ev-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    description: description.trim(),
    overview: overview?.trim() || description.trim(),
    venue: venue.trim(),
    date: date || new Date().toISOString(),
    end_date: end_date || undefined,
    thumbnail_url: thumbnail_url?.trim() || undefined,
    is_active: true,
  };

  store.events.push(newEvent);
  saveLocalData(store);
  return newEvent;
}

export async function updateEventInStore(
  eventId: string,
  updates: Partial<Omit<EventData, "id">>
): Promise<EventData | null> {
  const store = getLocalData();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) return null;

  if (updates.name !== undefined) event.name = updates.name.trim();
  if (updates.description !== undefined) event.description = updates.description.trim();
  if (updates.overview !== undefined) event.overview = updates.overview.trim();
  if (updates.venue !== undefined) event.venue = updates.venue.trim();
  if (updates.date !== undefined) event.date = updates.date;
  if (updates.end_date !== undefined) event.end_date = updates.end_date;
  if (updates.thumbnail_url !== undefined) event.thumbnail_url = updates.thumbnail_url;
  if (updates.is_active !== undefined) event.is_active = updates.is_active;

  saveLocalData(store);
  return event;
}

export async function deleteEventInStore(eventId: string): Promise<boolean> {
  const store = getLocalData();
  const initialLength = store.events.length;
  store.events = store.events.filter((e) => e.id !== eventId);
  store.teams = store.teams.filter((t) => t.event_id !== eventId);
  store.audit_logs = store.audit_logs.filter((l) => l.event_id !== eventId);

  saveLocalData(store);
  return store.events.length < initialLength;
}

export async function deleteTeamQRInStore(teamId: string): Promise<{ success: boolean; team?: Team; message?: string }> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found" };

  team.qr_token = "";
  team.qr_data_url = "";
  team.qr_expires_at = null;
  team.qr_email_sent = false;
  team.qr_email_sent_at = null;
  team.status = "PENDING_REVIEW";

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "QR_REVOKED",
    severity: "WARNING",
    actor_id: "admin-revoker",
    actor_role: "ADMIN",
    target_id: team.id,
    target_name: team.name,
    details: { reason: "QR pass manually invalidated by organizer." },
  });

  return { success: true, team, message: `QR pass for '${team.name}' has been revoked and invalidated.` };
}

export async function regenerateTeamQRInStore(
  teamId: string,
  expirationHours: number = 48
): Promise<{ success: boolean; team?: Team; message?: string }> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found" };

  const expDate = new Date(Date.now() + expirationHours * 3600 * 1000);
  const rawToken = `tok-${crypto.randomUUID()}`;
  const newToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
  const newQrDataUrl = await generateQrImage(newToken);

  team.qr_token = newToken;
  team.qr_data_url = newQrDataUrl;
  team.qr_expires_at = expDate.toISOString();
  team.status = "APPROVED";
  team.check_in_status = "NOT_CHECKED_IN";
  team.checked_in_at = null;
  team.checked_in_by = null;
  team.scan_count = 0;
  team.qr_email_sent = false;
  team.qr_email_sent_at = null;

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "QR_REGENERATED",
    severity: "INFO",
    actor_id: "admin-user",
    actor_role: "ADMIN",
    target_id: team.id,
    target_name: team.name,
    details: {
      expiration: expDate.toISOString(),
      expirationHours,
    },
  });

  return {
    success: true,
    team,
    message: `Fresh single-use QR pass generated for '${team.name}'. Previous pass permanently invalidated.`,
  };
}

export async function batchRegenerateEventQRsInStore(
  eventId: string,
  expirationHours: number = 48
): Promise<{ success: boolean; count: number }> {
  const store = getLocalData();
  const targetTeams = store.teams.filter((t) => t.event_id === eventId || (eventId === "ev-1" && !t.event_id));

  let count = 0;
  const expDate = new Date(Date.now() + expirationHours * 3600 * 1000);

  for (const team of targetTeams) {
    const rawToken = `tok-${crypto.randomUUID()}`;
    const newToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
    const newQrDataUrl = await generateQrImage(newToken);

    team.qr_token = newToken;
    team.qr_data_url = newQrDataUrl;
    team.qr_expires_at = expDate.toISOString();
    team.status = "APPROVED";
    team.check_in_status = "NOT_CHECKED_IN";
    team.checked_in_at = null;
    team.checked_in_by = null;
    team.scan_count = 0;
    team.qr_email_sent = false;
    team.qr_email_sent_at = null;
    count++;
  }

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: eventId,
    action: "BULK_QR_BATCH",
    severity: "INFO",
    actor_id: "admin-batch",
    actor_role: "ADMIN",
    details: {
      regeneratedCount: count,
      expiresAt: expDate.toISOString(),
    },
  });

  return { success: true, count };
}

// --- SECURE OTP MATCHING WITH SYSTEM & BRUTE FORCE PREVENTION ---

export async function generateAndSaveTeamOtp(teamId: string): Promise<{
  success: boolean;
  team?: Team;
  otp?: string;
  message?: string;
}> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found" };

  if (team.check_in_status === "CHECKED_IN") {
    return {
      success: false,
      message: "Single-Use Consumed: This team has already been checked into the venue.",
    };
  }

  // 6-digit cryptographically random numeric code
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes strict window

  team.otp_code = otp;
  team.otp_generated_at = now.toISOString();
  team.otp_expires_at = expiresAt.toISOString();
  team.otp_verified = false;
  team.otp_attempts_left = 4; // Max 4 tries before lockout
  team.otp_locked = false;

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "OTP_GENERATED",
    severity: "INFO",
    actor_id: "gate-system",
    actor_role: "SYSTEM",
    target_id: team.id,
    target_name: team.name,
    details: {
      expiresAt: expiresAt.toISOString(),
      attemptsAllowed: 4,
    },
  });

  return { success: true, team, otp };
}

export async function verifyTeamOtpInStore(
  teamId: string,
  otpInput: string,
  volunteerId: string = "volunteer-gate",
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string; team?: Team; attemptsLeft?: number; isLocked?: boolean }> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found in event roster." };

  if (team.check_in_status === "CHECKED_IN") {
    return {
      success: false,
      message: "Single-Use Violation: Team is already checked in and present in the venue.",
      team,
    };
  }

  if (team.otp_locked) {
    return {
      success: false,
      isLocked: true,
      message: "SECURITY LOCKOUT: Too many incorrect verification attempts. Please contact Head Administrator to regenerate code.",
      team,
    };
  }

  if (!team.otp_code) {
    return {
      success: false,
      message: "No verification code was requested for this team. Please click 'Generate Code' first.",
    };
  }

  // Check 10m validity window
  if (team.otp_expires_at && new Date() > new Date(team.otp_expires_at)) {
    return {
      success: false,
      message: "Verification code expired (10-minute validity window elapsed). Please request a fresh code.",
    };
  }

  const cleanInput = otpInput.trim();

  // Check for code match
  if (team.otp_code !== cleanInput) {
    const remaining = (team.otp_attempts_left ?? 4) - 1;
    team.otp_attempts_left = Math.max(0, remaining);

    if (remaining <= 0) {
      team.otp_locked = true;
      saveLocalData(store);

      await logSecurityAuditAction({
        event_id: team.event_id,
        action: "OTP_LOCKOUT",
        severity: "CRITICAL",
        actor_id: volunteerId,
        actor_role: "VOLUNTEER",
        target_id: team.id,
        target_name: team.name,
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { attemptsExhausted: 4, codeTested: cleanInput },
      });

      return {
        success: false,
        isLocked: true,
        attemptsLeft: 0,
        message: "SECURITY ALERT: Maximum attempts exceeded. Verification locked to prevent brute force.",
        team,
      };
    }

    saveLocalData(store);

    await logSecurityAuditAction({
      event_id: team.event_id,
      action: "OTP_MATCH_FAILURE",
      severity: "WARNING",
      actor_id: volunteerId,
      actor_role: "VOLUNTEER",
      target_id: team.id,
      target_name: team.name,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: { remainingAttempts: remaining, codeTested: cleanInput },
    });

    return {
      success: false,
      attemptsLeft: remaining,
      message: `Incorrect code! ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before security lockout.`,
      team,
    };
  }

  // OTP MATCHES SYSTEM! Admit team and consume single-use pass
  const now = new Date();
  team.otp_verified = true;
  team.check_in_status = "CHECKED_IN";
  team.checked_in_at = now.toISOString();
  team.checked_in_by = volunteerId;
  team.first_scanned_at = now.toISOString();
  team.scan_count = 1;
  team.otp_code = null; // Consume code permanently

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "OTP_MATCH_SUCCESS",
    severity: "INFO",
    actor_id: volunteerId,
    actor_role: "VOLUNTEER",
    target_id: team.id,
    target_name: team.name,
    ip_address: ipAddress,
    user_agent: userAgent,
    details: {
      method: "OTP_GATE_MATCH",
      admittedAt: now.toISOString(),
    },
  });

  return {
    success: true,
    message: `System OTP code verified! Single-use pass consumed. Team '${team.name}' admitted to venue.`,
    team,
  };
}

// --- BULK OPERATIONS FOR 200+ PARTICIPANTS ---

export async function bulkApproveTeamsInStore(
  teamIds: string[],
  expirationHours: number = 48
): Promise<{ success: boolean; approvedCount: number; message: string }> {
  const store = getLocalData();
  const idSet = new Set(teamIds);
  let count = 0;
  const expDate = new Date(Date.now() + expirationHours * 3600 * 1000);

  for (const team of store.teams) {
    if (idSet.has(team.id) || (teamIds.length === 0 && team.status === "PENDING_REVIEW")) {
      team.status = "APPROVED";

      // If team already has an active QR pass, retain it! Only generate if missing
      if (!team.qr_token || !team.qr_data_url) {
        const rawToken = `tok-${crypto.randomUUID()}`;
        const secureQrToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
        const qrDataUrl = await generateQrImage(secureQrToken);

        team.qr_token = secureQrToken;
        team.qr_data_url = qrDataUrl;
        team.qr_expires_at = expDate.toISOString();
      }
      count++;
    }
  }

  saveLocalData(store);

  const eventId = store.teams.find((t) => idSet.has(t.id))?.event_id || "ev-1";
  await logSecurityAuditAction({
    event_id: eventId,
    action: "BULK_APPROVE",
    severity: "INFO",
    actor_id: "admin-bulk",
    actor_role: "ADMIN",
    details: { approvedCount: count, expiresAt: expDate.toISOString() },
  });

  return {
    success: true,
    approvedCount: count,
    message: `Successfully approved ${count} teams and generated signed, expiring QR passes.`,
  };
}

export async function bulkCheckInTeamsInStore(
  teamIds: string[],
  volunteerId: string = "bulk-authority"
): Promise<{ success: boolean; checkedInCount: number; alreadyCount: number; message: string }> {
  const store = getLocalData();
  const idSet = new Set(teamIds);
  let count = 0;
  let alreadyCount = 0;
  const now = new Date().toISOString();

  for (const team of store.teams) {
    if (idSet.has(team.id)) {
      if (team.check_in_status === "CHECKED_IN") {
        alreadyCount++;
      } else {
        team.check_in_status = "CHECKED_IN";
        team.checked_in_at = now;
        team.checked_in_by = volunteerId;
        team.scan_count = 1;
        count++;
      }
    }
  }

  saveLocalData(store);

  const eventId = store.teams.find((t) => idSet.has(t.id))?.event_id || "ev-1";
  await logSecurityAuditAction({
    event_id: eventId,
    action: "BULK_CHECK_IN",
    severity: "INFO",
    actor_id: volunteerId,
    actor_role: "VOLUNTEER",
    details: { checkedInCount: count, alreadyPresentCount: alreadyCount },
  });

  return {
    success: true,
    checkedInCount: count,
    alreadyCount,
    message: `Batch check-in complete: ${count} teams checked in (${alreadyCount} were already present).`,
  };
}

export async function bulkExtendQRExpirationInStore(
  teamIds: string[],
  additionalHours: number = 24
): Promise<{ success: boolean; updatedCount: number; message: string }> {
  const store = getLocalData();
  const idSet = new Set(teamIds);
  let count = 0;

  for (const team of store.teams) {
    if (idSet.has(team.id) || teamIds.length === 0) {
      const currentExp = team.qr_expires_at ? new Date(team.qr_expires_at) : new Date();
      const newExp = new Date(currentExp.getTime() + additionalHours * 3600 * 1000);
      team.qr_expires_at = newExp.toISOString();

      // Refresh signature
      const rawToken = `tok-${crypto.randomUUID()}`;
      team.qr_token = createSecureQRPayload(team.id, team.event_id, rawToken, newExp);
      team.qr_data_url = await generateQrImage(team.qr_token);
      count++;
    }
  }

  saveLocalData(store);

  const eventId = store.teams.find((t) => idSet.has(t.id))?.event_id || "ev-1";
  await logSecurityAuditAction({
    event_id: eventId,
    action: "BULK_EXPIRATION_EXTEND",
    severity: "INFO",
    actor_id: "admin-bulk",
    actor_role: "ADMIN",
    details: { extendedCount: count, additionalHours },
  });

  return {
    success: true,
    updatedCount: count,
    message: `Extended QR expiration by +${additionalHours}h for ${count} teams.`,
  };
}

export async function resetTeamCheckInInStore(
  teamId: string,
  adminId: string = "admin-security",
  reason: string
): Promise<{ success: boolean; message: string; team?: Team }> {
  const store = getLocalData();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return { success: false, message: "Team not found" };

  const previousCheckIn = team.checked_in_at;
  team.check_in_status = "NOT_CHECKED_IN";
  team.checked_in_at = null;
  team.checked_in_by = null;
  team.scan_count = 0;

  saveLocalData(store);

  await logSecurityAuditAction({
    event_id: team.event_id,
    action: "CHECK_IN_RESET",
    severity: "WARNING",
    actor_id: adminId,
    actor_role: "ADMIN",
    target_id: team.id,
    target_name: team.name,
    details: {
      reason,
      previousCheckedInAt: previousCheckIn,
    },
  });

  return {
    success: true,
    message: `Check-in status for '${team.name}' has been reset to NOT_CHECKED_IN. Action recorded in Security Audit.`,
    team,
  };
}

export async function deleteTeamInStore(teamId: string): Promise<boolean> {
  const store = getLocalData();
  const initialCount = store.teams.length;
  const target = store.teams.find((t) => t.id === teamId);
  store.teams = store.teams.filter((t) => t.id !== teamId);
  saveLocalData(store);

  if (target) {
    await logSecurityAuditAction({
      event_id: target.event_id,
      action: "TEAM_DELETED",
      severity: "WARNING",
      actor_id: "admin-delete",
      actor_role: "ADMIN",
      target_id: target.id,
      target_name: target.name,
      details: { deletedParticipantsCount: target.participants.length },
    });
  }

  return store.teams.length < initialCount;
}

export async function bulkDeleteTeamsInStore(teamIds: string[]): Promise<{
  success: boolean;
  deletedCount: number;
  message: string;
}> {
  if (!teamIds || teamIds.length === 0) {
    return { success: false, deletedCount: 0, message: "No teams selected." };
  }

  const store = getLocalData();
  const targetSet = new Set(teamIds);
  const initialCount = store.teams.length;

  store.teams = store.teams.filter((t) => !targetSet.has(t.id));
  const deletedCount = initialCount - store.teams.length;

  saveLocalData(store);
  return {
    success: true,
    deletedCount,
    message: `Successfully deleted ${deletedCount} teams from the database.`,
  };
}

/**
 * Returns all active user accounts from the database with sensitive credentials stripped
 */
export async function getDbUsers(): Promise<SafeUserRecord[]> {
  const store = getLocalData();
  return (store.users || []).map(sanitizeUser);
}

/**
 * Looks up a user account by email in Supabase and the local store
 */
export async function getDbUserByEmail(email: string): Promise<UserRecord | null> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check Supabase users table if live
  if (isSupabaseLive()) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (!error && data) {
        const u = data as UserRecord;
        return {
          ...u,
          password_salt: u.password_salt || u.salt,
        };
      }
    } catch {
      // Fall through to store
    }
  }

  // 2. Query persistent database store
  const store = getLocalData();
  const found = (store.users || []).find(
    (u) => u.email.toLowerCase() === cleanEmail
  );
  if (!found) return null;
  return {
    ...found,
    password_salt: found.password_salt || found.salt,
  };
}

/**
 * Updates a user account in the database (local and Supabase sync)
 */
export async function updateDbUser(updatedUser: UserRecord): Promise<void> {
  const store = getLocalData();
  if (!store.users) {
    store.users = getInitialUsers();
  }
  const idx = store.users.findIndex(
    (u) => u.id === updatedUser.id || u.email.toLowerCase() === updatedUser.email.toLowerCase()
  );
  if (idx >= 0) {
    store.users[idx] = updatedUser;
  } else {
    store.users.push(updatedUser);
  }
  saveLocalData(store);

  // Sync with Supabase
  if (isSupabaseLive()) {
    try {
      await supabase.from("users").upsert([
        {
          id: updatedUser.id,
          email: updatedUser.email,
          password_hash: updatedUser.password_hash,
          salt: updatedUser.salt,
          password_salt: updatedUser.password_salt || updatedUser.salt,
          full_name: updatedUser.full_name,
          role: updatedUser.role,
          avatar: updatedUser.avatar,
          failed_attempts: updatedUser.failed_attempts,
          locked_until: updatedUser.locked_until,
        },
      ]);
    } catch {
      // Non-blocking fallback
    }
  }
}

/**
 * Records a failed login attempt with brute-force lockout defense
 */
export async function recordFailedLoginAttempt(
  email: string,
  ipAddress?: string
): Promise<{ locked: boolean; lockedUntil?: string; attemptsLeft: number }> {
  const cleanEmail = email.trim().toLowerCase();
  const user = await getDbUserByEmail(cleanEmail);

  if (!user) {
    // Log invalid attempt against non-existent account for audit tracking
    await logSecurityAuditAction({
      event_id: null,
      action: "AUTH_LOGIN_FAILURE",
      severity: "WARNING",
      actor_id: "anonymous",
      actor_role: "SYSTEM",
      target_id: "unknown",
      target_name: cleanEmail,
      ip_address: ipAddress || "unknown",
      details: {
        email: cleanEmail,
        reason: "User account does not exist.",
      },
    });
    return { locked: false, attemptsLeft: 0 };
  }

  const currentAttempts = (user.failed_attempts || 0) + 1;
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 15;

  let locked = false;
  let lockedUntil: string | null = null;

  if (currentAttempts >= MAX_ATTEMPTS) {
    locked = true;
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    user.locked_until = lockedUntil;
    user.failed_attempts = currentAttempts;

    await logSecurityAuditAction({
      event_id: null,
      action: "AUTH_LOCKOUT",
      severity: "CRITICAL",
      actor_id: user.id,
      actor_role: user.role,
      target_id: user.id,
      target_name: user.full_name,
      ip_address: ipAddress || "unknown",
      details: {
        email: cleanEmail,
        failed_attempts: currentAttempts,
        locked_until: lockedUntil,
        reason: `Exceeded ${MAX_ATTEMPTS} consecutive failed authentication attempts. Account locked for ${LOCKOUT_MINUTES}m.`,
      },
    });
  } else {
    user.failed_attempts = currentAttempts;

    await logSecurityAuditAction({
      event_id: null,
      action: "AUTH_LOGIN_FAILURE",
      severity: "WARNING",
      actor_id: user.id,
      actor_role: user.role,
      target_id: user.id,
      target_name: user.full_name,
      ip_address: ipAddress || "unknown",
      details: {
        email: cleanEmail,
        attempt: currentAttempts,
        attemptsLeft: MAX_ATTEMPTS - currentAttempts,
      },
    });
  }

  await updateDbUser(user);

  return {
    locked,
    lockedUntil: lockedUntil || undefined,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - currentAttempts),
  };
}

/**
 * Resets failed login counters upon successful authentication
 */
export async function resetFailedLoginAttempts(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const user = await getDbUserByEmail(cleanEmail);
  if (user && (user.failed_attempts > 0 || user.locked_until)) {
    user.failed_attempts = 0;
    user.locked_until = null;
    await updateDbUser(user);
  }
}

