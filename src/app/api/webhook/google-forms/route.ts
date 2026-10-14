import { NextRequest, NextResponse } from "next/server";
import { processRegistrationImport } from "@/app/actions/importData";
import { getTeamsForEvent, Team } from "@/lib/dataStore";
import { sendTeamQREmail } from "@/app/actions/qrActions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Health check & setup instructions for Google Forms Webhook
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      endpoint: "/api/webhook/google-forms",
      description: "Real-time Google Forms onFormSubmit webhook receiver for instant QR generation & email dispatch to team leaders.",
      setupGuide: {
        step1: "Open your Google Form -> click three dots (⋮) -> Script editor",
        step2: "Paste the provided Apps Script snippet with your Vercel URL",
        step3: "Add trigger: 'onFormSubmit' -> event source 'From form' -> event type 'On form submit'",
      },
      supportedColumns: {
        teamName: ["Team Name", "Team", "Squad", "Group Name"],
        leaderName: ["Team Leader Name", "Leader Name", "Captain Name", "Full Name"],
        leaderEmail: ["Team Leader Email", "Leader Email", "Captain Email", "Email Address"],
        leaderMobile: ["Team Leader Mobile", "Leader Phone", "Mobile Number", "Phone"],
        additionalMembers: ["Member 2 Name", "Member 2 Email", "Member 3 Name", "Member 3 Email"],
      },
    },
    { headers: corsHeaders }
  );
}

/**
 * Handles live Google Form submissions from Google Apps Script
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // 1. Normalize payload structure
    let eventId = "ev-1";
    let rows: Record<string, any>[] = [];

    if (rawBody.eventId) {
      eventId = rawBody.eventId;
    }

    if (Array.isArray(rawBody.data)) {
      rows = rawBody.data;
    } else if (rawBody.data && typeof rawBody.data === "object") {
      rows = [rawBody.data];
    } else if (rawBody.responses && typeof rawBody.responses === "object") {
      rows = [rawBody.responses];
    } else if (typeof rawBody === "object") {
      // Direct flat object with question titles as keys
      const { eventId: _eid, ...rest } = rawBody;
      rows = [rest];
    }

    if (rows.length === 0 || Object.keys(rows[0]).length === 0) {
      return NextResponse.json(
        { success: false, error: "Empty submission payload received." },
        { status: 400 }
      );
    }

    // 2. Process import & generate cryptographic QR pass
    const importResult = await processRegistrationImport(eventId, rows);

    if (!importResult.success) {
      return NextResponse.json(
        { success: false, error: importResult.message },
        { status: 400 }
      );
    }

    // 3. Look up newly registered/updated teams to send QR email to team leader
    const allTeams = await getTeamsForEvent(eventId);
    const dispatchedTeams: Array<{ id: string; name: string; leaderEmail?: string }> = [];

    if (importResult.teamsSummary && importResult.teamsSummary.length > 0) {
      for (const summary of importResult.teamsSummary) {
        const team = allTeams.find(
          (t) => t.name.toLowerCase() === summary.name.toLowerCase()
        );

        if (team) {
          const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
          
          // Automatically dispatch QR pass email to Team Leader
          await sendTeamQREmail(team.id, true);

          dispatchedTeams.push({
            id: team.id,
            name: team.name,
            leaderEmail: leader?.email,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Processed Google Form submission. Generated QR code and emailed to team leader!`,
        teamsRegistered: dispatchedTeams.length,
        teams: dispatchedTeams,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Google Forms Webhook Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process Google Form submission." },
      { status: 500, headers: corsHeaders }
    );
  }
}
