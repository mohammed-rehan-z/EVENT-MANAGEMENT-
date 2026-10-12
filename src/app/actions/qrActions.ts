"use server";

import {
  approveTeamInStore,
  checkInTeamByToken,
  createManualTeam,
  getEventStats,
  getTeamByTokenOrId,
  getTeamsForEvent,
  updateTeamEmailStatus,
  deleteTeamQRInStore,
  regenerateTeamQRInStore,
  batchRegenerateEventQRsInStore,
  generateAndSaveTeamOtp,
  verifyTeamOtpInStore,
  deleteTeamInStore,
  bulkDeleteTeamsInStore,
  bulkApproveTeamsInStore,
  bulkCheckInTeamsInStore,
  bulkExtendQRExpirationInStore,
  resetTeamCheckInInStore,
  getAuditLogsForEvent,
  clearAuditLogs,
  getEventById,
  Team,
  AuditLog,
} from "@/lib/dataStore";
import { supabase } from "@/lib/supabase";
import { EmailService } from "@/lib/services/emailService";

export async function fetchEventTeams(eventId: string) {
  try {
    const teams = await getTeamsForEvent(eventId);
    return { success: true, teams };
  } catch (err: any) {
    return { success: false, message: err.message, teams: [] };
  }
}

export async function approveTeamAndGenerateQR(teamId: string, expirationHours: number = 48) {
  try {
    const result = await approveTeamInStore(teamId, expirationHours);

    // Sync to Supabase if live
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && !url.includes("placeholder")) {
      try {
        const qrToken = `qr-${crypto.randomUUID()}`;
        await supabase
          .from("teams")
          .update({ status: "APPROVED", qr_token: qrToken })
          .eq("id", teamId);
      } catch (err) {
        console.warn("Supabase update error:", err);
      }
    }

    return result;
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function sendTeamQREmail(teamId: string, sendEmail: boolean) {
  try {
    const success = await updateTeamEmailStatus(teamId, sendEmail);
    if (!success) {
      return { success: false, message: "Team not found." };
    }

    if (sendEmail) {
      const teamRes = await getTeamByTokenOrId(teamId);
      if (teamRes.success && teamRes.team) {
        const team = teamRes.team;
        const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
        const event = await getEventById(team.event_id);
        if (leader?.email) {
          await EmailService.sendTeamPassEmail({
            to: leader.email,
            captainName: leader.full_name,
            teamName: team.name,
            eventName: event?.name || "Tournament Championship",
            venue: event?.venue || "Grand Arena",
            qrDataUrl: team.qr_data_url || "",
            qrToken: team.qr_token || "",
            includeAttachment: true,
          });
        }
      }

      return {
        success: true,
        message: "QR pass dispatched successfully via email! Team leader will receive entry instructions.",
        status: "SENT",
      };
    } else {
      return {
        success: true,
        message: "Email dispatch marked as 'Do Not Send' (No).",
        status: "NOT_SENT",
      };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function fetchTeamByQR(qrTokenOrInput: string) {
  try {
    const result = await getTeamByTokenOrId(qrTokenOrInput);
    if (!result.success || !result.team) {
      return { success: false, message: result.message || "Invalid or unknown QR code." };
    }

    const team = result.team;

    if (team.status !== "APPROVED") {
      return {
        success: false,
        message: `Team admission is currently ${team.status}. Verification rejected.`,
        team,
      };
    }

    // Check QR expiration
    if (team.qr_expires_at && new Date() > new Date(team.qr_expires_at)) {
      return {
        success: false,
        isExpired: true,
        message: `QR Pass Expired on ${new Date(team.qr_expires_at).toLocaleString()}. Gate admission rejected.`,
        team,
      };
    }

    if (team.check_in_status === "CHECKED_IN") {
      const timeStr = team.checked_in_at
        ? new Date(team.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "earlier";
      return {
        success: false,
        alreadyCheckedIn: true,
        message: `Already checked in at ${timeStr}. Duplicate entry denied.`,
        team,
      };
    }

    return { success: true, team };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function commitTeamCheckIn(
  teamId: string,
  eventId: string,
  volunteerId: string = "volunteer-authority-1"
) {
  try {
    const result = await checkInTeamByToken(teamId, volunteerId);

    // Sync to Supabase if live
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && !url.includes("placeholder")) {
      try {
        await supabase
          .from("check_ins")
          .insert([{ team_id: teamId, event_id: eventId, volunteer_id: volunteerId }]);
      } catch (err) {
        console.warn("Supabase check-in sync error:", err);
      }
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      message: err.message,
      alreadyCheckedIn: false,
      isExpired: false,
      tamperDetected: false,
    };
  }
}

export async function addManualTeamAction(
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
  try {
    const result = await createManualTeam(eventId, teamName, participants, category);
    return result;
  } catch (err: any) {
    return { success: false, message: err.message, team: undefined };
  }
}

export async function fetchDashboardStats(eventId: string) {
  try {
    const stats = await getEventStats(eventId);
    return { success: true, stats };
  } catch (err: any) {
    return { success: false, stats: null, message: err.message };
  }
}

export async function deleteTeamQRAction(
  teamId: string
): Promise<{ success: boolean; team?: Team; message?: string }> {
  try {
    const result = await deleteTeamQRInStore(teamId);
    return result;
  } catch (err: any) {
    return { success: false, message: err.message, team: undefined };
  }
}

export async function regenerateTeamQRAction(
  teamId: string,
  expirationHours: number = 48
): Promise<{ success: boolean; team?: Team; message?: string }> {
  try {
    const result = await regenerateTeamQRInStore(teamId, expirationHours);
    return result;
  } catch (err: any) {
    return { success: false, message: err.message, team: undefined };
  }
}

export async function batchRegenerateEventQRsAction(
  eventId: string,
  expirationHours: number = 48
): Promise<{ success: boolean; count: number; message?: string }> {
  try {
    const result = await batchRegenerateEventQRsInStore(eventId, expirationHours);
    return result;
  } catch (err: any) {
    return { success: false, message: err.message, count: 0 };
  }
}

export async function sendCustomTeamEmailAction(params: {
  teamId: string;
  customSubject?: string;
  customBody?: string;
  includeAttachment?: boolean;
}): Promise<{ success: boolean; message: string; isSimulated?: boolean; emailId?: string }> {
  try {
    const { teamId, customSubject, customBody, includeAttachment = true } = params;
    const teamRes = await getTeamByTokenOrId(teamId);
    if (!teamRes.success || !teamRes.team) {
      return { success: false, message: "Team not found." };
    }

    const team = teamRes.team;
    const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
    if (!leader?.email) {
      return { success: false, message: `Team '${team.name}' has no registered captain email.` };
    }

    const event = await getEventById(team.event_id);

    const emailResult = await EmailService.sendTeamPassEmail({
      to: leader.email,
      captainName: leader.full_name,
      teamName: team.name,
      eventName: event?.name || "Official Event",
      venue: event?.venue || "Main Convention Center",
      date: event?.date ? new Date(event.date).toLocaleDateString() : "Scheduled Day",
      qrDataUrl: team.qr_data_url || "",
      qrToken: team.qr_token || "",
      customSubject,
      customBody,
      includeAttachment,
    });

    if (emailResult.success) {
      await updateTeamEmailStatus(teamId, true);
    }

    return {
      success: emailResult.success,
      message: emailResult.message,
      isSimulated: emailResult.isSimulated,
      emailId: emailResult.emailId,
    };
  } catch (err: any) {
    return { success: false, message: "Email dispatch failed: " + err.message };
  }
}

/**
 * Generates an on-spot verification OTP and dispatches it to the Team Captain's email via Resend
 */
export async function generateAndSendVenueOtpAction(
  teamId: string,
  eventId: string
): Promise<{
  success: boolean;
  message: string;
  captainEmail?: string;
  captainName?: string;
  isSimulated?: boolean;
  simulatedOtp?: string;
  expiresAt?: string;
  attemptsLeft?: number;
}> {
  try {
    const otpRes = await generateAndSaveTeamOtp(teamId);
    if (!otpRes.success || !otpRes.team || !otpRes.otp) {
      return { success: false, message: otpRes.message || "Failed to generate venue OTP." };
    }

    const team = otpRes.team;
    const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
    if (!leader?.email) {
      return { success: false, message: "Team has no registered leader email to receive OTP." };
    }

    const event = await getEventById(eventId);

    const emailRes = await EmailService.sendVenueOtpEmail({
      to: leader.email,
      captainName: leader.full_name,
      teamName: team.name,
      eventName: event?.name || "Venue Gate Admission",
      otpCode: otpRes.otp,
    });

    return {
      success: true,
      message: emailRes.message,
      captainEmail: leader.email,
      captainName: leader.full_name,
      isSimulated: emailRes.isSimulated,
      simulatedOtp: emailRes.isSimulated ? otpRes.otp : undefined,
      expiresAt: team.otp_expires_at || undefined,
      attemptsLeft: team.otp_attempts_left,
    };
  } catch (err: any) {
    return { success: false, message: "Error generating/sending OTP: " + err.message };
  }
}

/**
 * Verifies on-spot venue OTP code entered in presence of volunteer with brute force protection
 */
export async function verifyVenueOtpAction(
  teamId: string,
  otp: string,
  volunteerId: string = "gate-authority"
): Promise<{ success: boolean; message: string; team?: Team; attemptsLeft?: number; isLocked?: boolean }> {
  try {
    const result = await verifyTeamOtpInStore(teamId, otp, volunteerId);

    // Sync to Supabase check_ins if live
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (result.success && url && !url.includes("placeholder")) {
      try {
        await supabase
          .from("check_ins")
          .insert([{ team_id: teamId, volunteer_id: volunteerId }]);
      } catch (err) {
        console.warn("Supabase check-in sync error:", err);
      }
    }

    return result;
  } catch (err: any) {
    return { success: false, message: "Verification error: " + err.message };
  }
}

/**
 * Reset a team check-in status (e.g. accidental scan correction) with mandatory audit justification
 */
export async function resetTeamCheckInAction(
  teamId: string,
  reason: string,
  adminId: string = "admin-security"
): Promise<{ success: boolean; message: string; team?: Team }> {
  try {
    return await resetTeamCheckInInStore(teamId, adminId, reason);
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Bulk approves multiple teams and generates expiring single-use QRs
 */
export async function bulkApproveTeamsAction(
  teamIds: string[],
  expirationHours: number = 48
): Promise<{ success: boolean; approvedCount: number; message: string }> {
  try {
    return await bulkApproveTeamsInStore(teamIds, expirationHours);
  } catch (err: any) {
    return { success: false, approvedCount: 0, message: err.message };
  }
}

/**
 * Bulk check-in for large delegations/classes/rosters
 */
export async function bulkCheckInTeamsAction(
  teamIds: string[],
  volunteerId: string = "bulk-authority"
): Promise<{ success: boolean; checkedInCount: number; alreadyCount: number; message: string }> {
  try {
    return await bulkCheckInTeamsInStore(teamIds, volunteerId);
  } catch (err: any) {
    return { success: false, checkedInCount: 0, alreadyCount: 0, message: err.message };
  }
}

/**
 * Extends QR expiration window for specified teams
 */
export async function bulkExtendQRExpirationAction(
  teamIds: string[],
  additionalHours: number = 24
): Promise<{ success: boolean; updatedCount: number; message: string }> {
  try {
    return await bulkExtendQRExpirationInStore(teamIds, additionalHours);
  } catch (err: any) {
    return { success: false, updatedCount: 0, message: err.message };
  }
}

/**
 * Fetches event security audit logs
 */
export async function fetchEventAuditLogsAction(
  eventId: string,
  options?: {
    severity?: "INFO" | "WARNING" | "CRITICAL" | "ALL";
    action?: string;
    search?: string;
    limit?: number;
  }
): Promise<{ success: boolean; logs: AuditLog[]; message?: string }> {
  try {
    const logs = await getAuditLogsForEvent(eventId, options);
    return { success: true, logs };
  } catch (err: any) {
    return { success: false, logs: [], message: err.message };
  }
}

/**
 * Clears security audit logs for an event
 */
export async function clearEventAuditLogsAction(eventId: string): Promise<{ success: boolean; message: string }> {
  try {
    const ok = await clearAuditLogs(eventId);
    return { success: ok, message: ok ? "Audit logs cleared." : "Failed to clear audit logs." };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Deletes a single team
 */
export async function deleteTeamAction(teamId: string): Promise<{ success: boolean; message: string }> {
  try {
    const ok = await deleteTeamInStore(teamId);
    return {
      success: ok,
      message: ok ? "Team deleted successfully." : "Team not found or already removed.",
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Bulk deletes multiple teams
 */
export async function bulkDeleteTeamsAction(
  teamIds: string[]
): Promise<{ success: boolean; deletedCount: number; message: string }> {
  try {
    const result = await bulkDeleteTeamsInStore(teamIds);
    return result;
  } catch (err: any) {
    return { success: false, deletedCount: 0, message: err.message };
  }
}
