import { NextResponse } from "next/server";
import { TeamService } from "@/lib/services/teamService";

export async function GET() {
  try {
    const stats = await TeamService.getStats("ev-1");
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    );

    return NextResponse.json({
      status: "HEALTHY",
      timestamp: new Date().toISOString(),
      services: {
        database: isSupabaseConfigured ? "SUPABASE_POSTGRESQL" : "LOCAL_PERSISTENT_STORE",
        qrGeneration: "ACTIVE",
        emailDispatch:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? "GMAIL_SMTP_ACTIVE"
            : process.env.RESEND_API_KEY
            ? "RESEND_ACTIVE"
            : "LOCAL_LOG_DISPATCH",
      },
      metrics: stats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "DEGRADED", error: err.message },
      { status: 500 }
    );
  }
}
