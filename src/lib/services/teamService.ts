import {
  createManualTeam,
  getEventStats,
  getTeamByTokenOrId,
  getTeamsForEvent,
  Team,
  updateTeamEmailStatus,
} from "@/lib/dataStore";

export class TeamService {
  /**
   * Lists teams for an event with optional search and attendance filter
   */
  static async listTeams(
    eventId = "ev-1",
    options?: {
      search?: string;
      checkInStatus?: "CHECKED_IN" | "NOT_CHECKED_IN" | "ALL";
      emailStatus?: "SENT" | "UNSENT" | "ALL";
    }
  ): Promise<Team[]> {
    const teams = await getTeamsForEvent(eventId);

    if (!options) return teams;

    return teams.filter((t) => {
      if (options.search) {
        const q = options.search.toLowerCase();
        const matchName = t.name.toLowerCase().includes(q);
        const matchMember = t.participants.some(
          (p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        );
        if (!matchName && !matchMember) return false;
      }

      if (options.checkInStatus && options.checkInStatus !== "ALL") {
        if (t.check_in_status !== options.checkInStatus) return false;
      }

      if (options.emailStatus && options.emailStatus !== "ALL") {
        if (options.emailStatus === "SENT" && !t.qr_email_sent) return false;
        if (options.emailStatus === "UNSENT" && t.qr_email_sent) return false;
      }

      return true;
    });
  }

  /**
   * Retrieves a single team by its unique ID or QR Token
   */
  static async getTeam(idOrToken: string): Promise<Team | null> {
    const res = await getTeamByTokenOrId(idOrToken);
    return res.team || null;
  }

  /**
   * Creates a new team with member roster and generates its unique QR pass
   */
  static async createTeam(
    eventId: string,
    name: string,
    participants: Array<{
      full_name: string;
      email: string;
      mobile_number?: string;
      course?: string;
      year_of_study?: string;
      semester?: string;
      is_leader?: boolean;
    }>
  ): Promise<{ success: boolean; team?: Team; message?: string }> {
    if (!name || !name.trim()) {
      return { success: false, message: "Team name is required." };
    }
    if (!participants || participants.length === 0) {
      return { success: false, message: "At least one participant (Leader) is required." };
    }

    const payload = participants.map((p, idx) => ({
      ...p,
      is_leader: p.is_leader ?? idx === 0,
    }));

    return await createManualTeam(eventId, name.trim(), payload);
  }

  /**
   * Toggles the QR email dispatch status for a team (Send or No)
   */
  static async setEmailStatus(teamId: string, isSent: boolean): Promise<boolean> {
    return await updateTeamEmailStatus(teamId, isSent);
  }

  /**
   * Fetches high-level event metrics
   */
  static async getStats(eventId = "ev-1") {
    return await getEventStats(eventId);
  }
}
