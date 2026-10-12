import { NextRequest, NextResponse } from "next/server";
import { TeamService } from "@/lib/services/teamService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId") || "ev-1";
    const format = (searchParams.get("format") || "json").toLowerCase();

    const teams = await TeamService.listTeams(eventId);

    const flattened = teams.flatMap((t) =>
      t.participants.map((p) => ({
        Team_Name: t.name,
        Full_Name: p.full_name,
        Role: p.is_leader ? "Leader" : "Member",
        Email: p.email,
        Mobile_Number: p.mobile_number || "N/A",
        Course: p.course || "N/A",
        Year_Of_Study: p.year_of_study || "N/A",
        Approval_Status: t.status,
        QR_Token: t.qr_token,
        QR_Email_Dispatched: t.qr_email_sent ? "Yes" : "No",
        Attendance_Status: t.check_in_status === "CHECKED_IN" ? "Present" : "Not Checked In",
        Checked_In_At: t.checked_in_at || "N/A",
        Checked_In_By: t.checked_in_by || "N/A",
      }))
    );

    if (format === "csv") {
      if (flattened.length === 0) {
        return new NextResponse("", {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="roster_${eventId}.csv"`,
          },
        });
      }

      const headers = Object.keys(flattened[0]).join(",");
      const csvRows = flattened.map((row) =>
        Object.values(row)
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(",")
      );
      const csvContent = [headers, ...csvRows].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="roster_${eventId}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      eventId,
      exportedAt: new Date().toISOString(),
      teamsCount: teams.length,
      participantsCount: flattened.length,
      roster: flattened,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
