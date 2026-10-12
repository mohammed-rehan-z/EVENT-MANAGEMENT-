import { NextRequest, NextResponse } from "next/server";
import { TeamService } from "@/lib/services/teamService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const team = await TeamService.getTeam(teamId);

    if (!team) {
      return NextResponse.json(
        { success: false, error: "Team not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      team,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await req.json();

    if (body.emailSent !== undefined) {
      const updated = await TeamService.setEmailStatus(teamId, Boolean(body.emailSent));
      if (!updated) {
        return NextResponse.json(
          { success: false, error: "Team not found." },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: body.emailSent ? "Marked as email sent." : "Marked as email not sent (No).",
        emailSent: Boolean(body.emailSent),
      });
    }

    return NextResponse.json(
      { success: false, error: "No recognized fields to update." },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
