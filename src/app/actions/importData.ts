"use server";

import { saveImportedTeams } from "@/lib/dataStore";
import { supabase } from "@/lib/supabase";

// Helper to find a value across various column naming conventions and casings
function extractFieldValue(row: Record<string, any>, candidateKeywords: string[]): string {
  if (!row || typeof row !== "object") return "";

  const rowEntries = Object.entries(row);

  // 1. Direct match with trimming
  for (const [key, value] of rowEntries) {
    const trimmedKey = key.trim();
    if (candidateKeywords.some((cand) => cand.toLowerCase() === trimmedKey.toLowerCase())) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }

  // 2. Normalized key match (alphanumeric only, lowercase)
  for (const [key, value] of rowEntries) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of candidateKeywords) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanKey === cleanCand) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return String(value).trim();
        }
      }
    }
  }

  // 3. Substring keyword match
  for (const [key, value] of rowEntries) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of candidateKeywords) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanKey.includes(cleanCand)) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return String(value).trim();
        }
      }
    }
  }

  return "";
}

export async function processRegistrationImport(
  eventId: string,
  parsedData: any[],
  customTeamColumn?: string
) {
  try {
    if (!parsedData || !Array.isArray(parsedData) || parsedData.length === 0) {
      return { success: false, message: "No data rows detected in the uploaded file." };
    }

    const teamsMap = new Map<string, {
      name: string;
      normalized_name: string;
      participants: Array<{
        full_name: string;
        email: string;
        mobile_number?: string;
        year_of_study?: string;
        course?: string;
        semester?: string;
        is_leader: boolean;
      }>;
    }>();

    // 1. Group rows by Team Name and segregate participants
    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      if (!row || typeof row !== "object") continue;

      // Extract Participant Name first
      const fullName = extractFieldValue(row, [
        "Full Name",
        "Name",
        "Participant Name",
        "Student Name",
        "Member Name",
        "Candidate Name",
        "Player Name",
        "full_name",
        "name",
      ]);

      if (!fullName) {
        continue; // Skip completely empty rows
      }

      // Extract Team Name
      let rawTeamName = "";
      if (customTeamColumn && row[customTeamColumn]) {
        rawTeamName = String(row[customTeamColumn]).trim();
      }

      if (!rawTeamName) {
        rawTeamName = extractFieldValue(row, [
          "Team Name",
          "Team",
          "Team ID",
          "team_name",
          "team_id",
          "Team No",
          "Team #",
          "Team Number",
          "Team Code",
          "TeamCode",
          "TeamName",
          "Squad",
          "Group",
          "Team/Group",
          "Group Name",
          "team",
        ]);
      }

      // CRITICAL FIX: If no team name is specified in the file, NEVER lump all rows together!
      // Instead, treat it as an individual participant registration with their own distinct team pass.
      if (!rawTeamName) {
        rawTeamName = `Team - ${fullName}`;
      }

      const normalizedName = rawTeamName.trim().replace(/\s+/g, " ").toLowerCase();

      const email =
        extractFieldValue(row, ["Email", "Email Address", "Mail", "email", "e-mail"]) ||
        `${fullName.toLowerCase().replace(/\s+/g, ".")}@example.com`;

      const mobileNumber = extractFieldValue(row, [
        "Mobile Number",
        "Phone",
        "Mobile",
        "Phone Number",
        "Contact",
        "phone",
        "mobile",
      ]);

      const course =
        extractFieldValue(row, ["Course", "Branch", "Department", "Major", "course", "branch"]) ||
        "Computer Science";

      const yearOfStudy =
        extractFieldValue(row, ["Year of Study", "Year", "Academic Year", "year"]) ||
        "3rd Year";

      const semester = extractFieldValue(row, ["Semester", "Sem", "semester"]) || "5th";

      const leaderField = extractFieldValue(row, ["Is Leader", "Leader", "Role", "Captain", "Role"]);
      const isExplicitLeader =
        leaderField.toLowerCase().includes("leader") ||
        leaderField.toLowerCase().includes("capt") ||
        leaderField.toLowerCase() === "yes" ||
        leaderField.toLowerCase() === "true" ||
        leaderField.toLowerCase() === "1";

      if (!teamsMap.has(normalizedName)) {
        teamsMap.set(normalizedName, {
          name: rawTeamName.trim(),
          normalized_name: normalizedName,
          participants: [],
        });
      }

      const currentTeam = teamsMap.get(normalizedName)!;
      currentTeam.participants.push({
        full_name: fullName,
        email,
        mobile_number: mobileNumber || undefined,
        course: course || undefined,
        year_of_study: yearOfStudy || undefined,
        semester: semester || undefined,
        // The first person added to the team is the leader unless another member was marked as leader
        is_leader: isExplicitLeader || currentTeam.participants.length === 0,
      });
    }

    const processedTeams = Array.from(teamsMap.values());

    if (processedTeams.length === 0) {
      return {
        success: false,
        message: "Could not find valid participant names in the provided file.",
      };
    }

    // 2. Save each team into our dataStore with its OWN unique QR token and QR image
    const result = await saveImportedTeams(eventId, processedTeams);

    // 3. If Supabase is connected, sync each separate team and its participants to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && !supabaseUrl.includes("placeholder")) {
      try {
        for (const team of processedTeams) {
          const { data: insertedTeam } = await supabase
            .from("teams")
            .insert([{ event_id: eventId, name: team.name, normalized_name: team.normalized_name, status: "APPROVED" }])
            .select()
            .single();

          if (insertedTeam) {
            const participantsToInsert = team.participants.map((p, idx) => ({
              ...p,
              team_id: insertedTeam.id,
              event_id: eventId,
              is_leader: idx === 0,
            }));
            await supabase.from("participants").insert(participantsToInsert);
          }
        }
      } catch (sbErr) {
        console.warn("Supabase background sync notice:", sbErr);
      }
    }

    const totalParticipants = processedTeams.reduce((sum, t) => sum + t.participants.length, 0);

    return {
      success: true,
      message: `Successfully segregated into ${processedTeams.length} separate teams (${totalParticipants} participants). Generated a separate QR code for each team!`,
      teamsCount: processedTeams.length,
      participantsCount: totalParticipants,
      teamsSummary: processedTeams.map((t) => ({
        name: t.name,
        membersCount: t.participants.length,
      })),
      conflicts: result.conflicts,
    };
  } catch (err: any) {
    console.error("Import processing error:", err);
    return { success: false, message: err.message || "An unexpected error occurred during import." };
  }
}
