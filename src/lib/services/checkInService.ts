import { checkInTeamByToken, getTeamByTokenOrId, Team } from "@/lib/dataStore";
import { supabase } from "@/lib/supabase";

export interface CheckInResult {
  success: boolean;
  message: string;
  team?: Team;
  alreadyCheckedIn?: boolean;
  timestamp?: string;
}

export class CheckInService {
  /**
   * Looks up team by QR token, ID, or normalized team name for gate inspection
   */
  static async lookupTeam(qrTokenOrCode: string): Promise<CheckInResult> {
    if (!qrTokenOrCode || !qrTokenOrCode.trim()) {
      return { success: false, message: "QR token or team code is required." };
    }

    const result = await getTeamByTokenOrId(qrTokenOrCode);
    if (!result.success || !result.team) {
      return {
        success: false,
        message: result.message || "QR Code not recognized. Please verify with the event administrator.",
      };
    }

    const team = result.team;

    if (team.status !== "APPROVED") {
      return {
        success: false,
        message: `Team admission is currently ${team.status}. Verification rejected.`,
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

    return {
      success: true,
      message: `Valid QR Pass for '${team.name}'. ${team.participants.length} participants to verify.`,
      team,
    };
  }

  /**
   * Commits the attendance check-in for a team after authority verifies physical IDs
   */
  static async processCheckIn(
    teamIdOrToken: string,
    eventId = "ev-1",
    volunteerId = "gate-authority"
  ): Promise<CheckInResult> {
    const result = await checkInTeamByToken(teamIdOrToken, volunteerId);

    // Sync to Supabase if configured
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && !url.includes("placeholder") && result.success && result.team) {
      try {
        await supabase
          .from("check_ins")
          .insert([
            {
              team_id: result.team.id,
              event_id: eventId,
              volunteer_id: volunteerId,
              timestamp: new Date().toISOString(),
            },
          ]);
      } catch (sbErr) {
        console.warn("Supabase check-in background sync notice:", sbErr);
      }
    }

    return {
      success: result.success,
      message: result.message,
      team: result.team,
      alreadyCheckedIn: result.alreadyCheckedIn,
      timestamp: result.team?.checked_in_at || new Date().toISOString(),
    };
  }
}
