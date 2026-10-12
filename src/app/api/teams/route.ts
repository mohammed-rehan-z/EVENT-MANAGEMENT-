import { NextRequest, NextResponse } from "next/server";
import { TeamService } from "@/lib/services/teamService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId") || "ev-1";
    const search = searchParams.get("search") || undefined;
    const checkInStatus = (searchParams.get("checkInStatus") as any) || undefined;
    const emailStatus = (searchParams.get("emailStatus") as any) || undefined;

    const teams = await TeamService.listTeams(eventId, {
      search,
      checkInStatus,
      emailStatus,
    });

    return NextResponse.json({
      success: true,
      count: teams.length,
      teams,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId = "ev-1", name, participants } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Team name is required." },
        { status: 400 }
      );
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one participant is required." },
        { status: 400 }
      );
    }

    const result = await TeamService.createTeam(eventId, name, participants);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Team '${name}' registered with distinct QR pass generated.`,
      team: result.team,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
