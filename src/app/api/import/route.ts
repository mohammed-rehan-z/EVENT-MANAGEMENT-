import { NextRequest, NextResponse } from "next/server";
import { processRegistrationImport } from "@/app/actions/importData";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId = "ev-1", data, teamColumn } = body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, error: "An array of participant rows is required in 'data'." },
        { status: 400 }
      );
    }

    const result = await processRegistrationImport(eventId, data, teamColumn);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      teamsCount: result.teamsCount,
      participantsCount: result.participantsCount,
      teamsSummary: result.teamsSummary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
