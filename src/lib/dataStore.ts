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
  event_id: string;
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
    | "TEAM_DELETED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actor_id: string;
  actor_role: "ADMIN" | "VOLUNTEER" | "SYSTEM";
  target_id?: string;
  target_name?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
}

interface LocalStoreSchema {
  events: EventData[];
  teams: Team[];
  audit_logs: AuditLog[];
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
      const initialExpires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const initialData: LocalStoreSchema = {
        events: [
          {
            id: "ev-1",
            name: "Apex Cyber League 2026",
            description: "National Collegiate Inter-College E-Sports & Hackathon Championship",
            overview: "Apex Cyber League 2026 is the premier collegiate inter-college e-sports & hackathon championship bringing together top developers, strategists, and cybersecurity innovators. Featuring 48-hour continuous hack tracks, high-stakes Valorant & Rocket League brackets, and keynote panels with tech industry pioneers.",
            venue: "Grand Convention Arena, Hall 4",
            date: "2026-10-15T09:00:00Z",
            end_date: "2026-10-18T18:00:00Z",
            thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
            is_active: true,
          },
        ],
        teams: [
          {
            id: "tm-101",
            event_id: "ev-1",
            name: "Cyber Knights",
            normalized_name: "cyber knights",
            category: "Cybersecurity & E-Sports",
            status: "APPROVED",
            qr_token: "token-cyber-knights-2026",
            qr_data_url: "",
            qr_expires_at: initialExpires,
            qr_email_sent: true,
            qr_email_sent_at: "2026-10-09T14:30:00Z",
            check_in_status: "NOT_CHECKED_IN",
            checked_in_at: null,
            checked_in_by: null,
            scan_count: 0,
            created_at: "2026-10-09T10:00:00Z",
            participants: [
              {
                id: "pt-1",
                team_id: "tm-101",
                event_id: "ev-1",
                full_name: "Alex Vance",
                email: "alex.vance@mit.edu",
                mobile_number: "+1 (555) 234-5678",
                course: "Computer Science",
                year_of_study: "3rd Year",
                semester: "5th",
                is_leader: true,
                created_at: "2026-10-09T10:00:00Z",
              },
              {
                id: "pt-2",
                team_id: "tm-101",
                event_id: "ev-1",
                full_name: "Marcus Brody",
                email: "marcus.b@mit.edu",
                mobile_number: "+1 (555) 345-6789",
                course: "Software Engineering",
                year_of_study: "3rd Year",
                semester: "5th",
                is_leader: false,
                created_at: "2026-10-09T10:00:00Z",
              },
              {
                id: "pt-3",
                team_id: "tm-101",
                event_id: "ev-1",
                full_name: "Elena Rostova",
                email: "elena.r@mit.edu",
                mobile_number: "+1 (555) 456-7890",
                course: "Cybersecurity",
                year_of_study: "2nd Year",
                semester: "4th",
                is_leader: false,
                created_at: "2026-10-09T10:00:00Z",
              },
            ],
          },
          {
            id: "tm-102",
            event_id: "ev-1",
            name: "Quantum Strikers",
            normalized_name: "quantum strikers",
            category: "Robotics & AI",
            status: "APPROVED",
            qr_token: "token-quantum-strikers-2026",
            qr_data_url: "",
            qr_expires_at: initialExpires,
            qr_email_sent: false,
            qr_email_sent_at: null,
            check_in_status: "NOT_CHECKED_IN",
            checked_in_at: null,
            checked_in_by: null,
            scan_count: 0,
            created_at: "2026-10-09T11:20:00Z",
            participants: [
              {
                id: "pt-4",
                team_id: "tm-102",
                event_id: "ev-1",
                full_name: "Sarah Connor",
                email: "s.connor@standford.edu",
                mobile_number: "+1 (555) 789-0123",
                course: "Artificial Intelligence",
                year_of_study: "4th Year",
                semester: "7th",
                is_leader: true,
                created_at: "2026-10-09T11:20:00Z",
              },
              {
                id: "pt-5",
                team_id: "tm-102",
                event_id: "ev-1",
                full_name: "Kyle Reese",
                email: "kreese@standford.edu",
                mobile_number: "+1 (555) 890-1234",
                course: "Robotics",
                year_of_study: "4th Year",
                semester: "7th",
                is_leader: false,
                created_at: "2026-10-09T11:20:00Z",
              },
            ],
          },
        ],
        audit_logs: [
          {
            id: "audit-init-1",
            event_id: "ev-1",
            timestamp: new Date().toISOString(),
            action: "QR_GENERATED",
            severity: "INFO",
            actor_id: "system",
            actor_role: "SYSTEM",
            target_id: "tm-101",
            target_name: "Cyber Knights",
            details: { reason: "Initial seeded approved team QR pass generated." },
          },
        ],
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), "utf8");
      return initialData;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.audit_logs) {
      parsed.audit_logs = [];
    }
    return parsed;
  } catch (err) {
    console.error("Local data read error:", err);
    return { events: [], teams: [], audit_logs: [] };
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
    } catch (e) {
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
): Promise<{ added: number; updated: number; conflicts: string[] }> {
  const store = getLocalData();
  const event = store.events.find((e) => e.id === eventId);
  const conflicts: string[] = [];
  let added = 0;
  let updated = 0;

  for (const gTeam of groupedTeams) {
    const existingIndex = store.teams.findIndex(
      (t) => (t.event_id === eventId || eventId === "ev-1") && t.normalized_name === gTeam.normalized_name
    );

    const teamId = existingIndex >= 0 ? store.teams[existingIndex].id : `tm-${crypto.randomUUID()}`;
    const rawToken = `tok-${crypto.randomUUID()}`;
    const expDate = calculateDefaultExpiration(event);
    const secureQrToken = createSecureQRPayload(teamId, eventId, rawToken, expDate);
    const qrDataUrl = await generateQrImage(secureQrToken);

    if (existingIndex >= 0) {
      const existingTeam = store.teams[existingIndex];
      const existingEmails = new Set(existingTeam.participants.map((p) => p.email.toLowerCase()));

      for (const p of gTeam.participants) {
        if (!existingEmails.has(p.email.toLowerCase())) {
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
          existingEmails.add(p.email.toLowerCase());
        }
      }
      conflicts.push(`Merged with existing team '${existingTeam.name}'`);
      updated++;
    } else {
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
      totalProcessed: groupedTeams.length,
      conflictsReported: conflicts.length,
    },
  });

  return { added, updated, conflicts };
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

  const event = store.events.find((e) => e.id === team.event_id);
  const expDate = expirationHours
    ? new Date(Date.now() + expirationHours * 3600 * 1000)
    : calculateDefaultExpiration(event);

  const rawToken = `tok-${crypto.randomUUID()}`;
  const secureQrToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
  const qrDataUrl = await generateQrImage(secureQrToken);

  team.status = "APPROVED";
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
      const rawToken = `tok-${crypto.randomUUID()}`;
      const secureQrToken = createSecureQRPayload(team.id, team.event_id, rawToken, expDate);
      const qrDataUrl = await generateQrImage(secureQrToken);

      team.status = "APPROVED";
      team.qr_token = secureQrToken;
      team.qr_data_url = qrDataUrl;
      team.qr_expires_at = expDate.toISOString();
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
