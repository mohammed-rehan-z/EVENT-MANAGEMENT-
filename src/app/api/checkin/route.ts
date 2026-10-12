import { NextRequest, NextResponse } from "next/server";
import { CheckInService } from "@/lib/services/checkInService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, volunteerId = "gate-authority", action = "confirm" } = body;

    if (!token || !String(token).trim()) {
      return NextResponse.json(
        { success: false, error: "QR token or team code is required." },
        { status: 400 }
      );
    }

    const cleanToken = String(token).trim();

    // 1. Action: "lookup" (Roster verification before physical entry)
    if (action === "lookup") {
      const result = await CheckInService.lookupTeam(cleanToken);
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.message,
            alreadyCheckedIn: result.alreadyCheckedIn,
            team: result.team,
          },
          { status: result.alreadyCheckedIn ? 409 : 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: result.message,
        team: result.team,
      });
    }

    // 2. Action: "confirm" (Marks team as Present in the system)
    const checkInResult = await CheckInService.processCheckIn(
      cleanToken,
      "ev-1",
      volunteerId
    );

    if (!checkInResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: checkInResult.message,
          alreadyCheckedIn: checkInResult.alreadyCheckedIn,
          team: checkInResult.team,
        },
        { status: checkInResult.alreadyCheckedIn ? 409 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: checkInResult.message,
      team: checkInResult.team,
      timestamp: checkInResult.timestamp,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
