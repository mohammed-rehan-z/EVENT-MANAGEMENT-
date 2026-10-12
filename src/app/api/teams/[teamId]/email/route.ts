import { NextRequest, NextResponse } from "next/server";
import { TeamService } from "@/lib/services/teamService";
import { EmailService } from "@/lib/services/emailService";

export async function POST(
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

    let shouldSend = true;
    let recipientOverride: string | undefined = undefined;

    try {
      const body = await req.json();
      if (body.shouldSend !== undefined) shouldSend = Boolean(body.shouldSend);
      if (body.recipientEmail) recipientOverride = String(body.recipientEmail).trim();
    } catch {
      // empty body defaults to sending
    }

    if (!shouldSend) {
      await TeamService.setEmailStatus(team.id, false);
      return NextResponse.json({
        success: true,
        message: `Email dispatch set to 'No' (skipped) for team '${team.name}'.`,
        status: "NOT_SENT",
      });
    }

    // Dispatch email
    const result = await EmailService.sendQrPassEmail(team, recipientOverride);
    await TeamService.setEmailStatus(team.id, true);

    return NextResponse.json({
      success: true,
      message: result.message,
      dispatch: result.record,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
