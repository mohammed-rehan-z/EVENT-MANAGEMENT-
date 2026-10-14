import { Suspense } from "react";
import Link from "next/link";
import { QrCode, Users, ArrowLeft, Calendar, LogOut } from "lucide-react";
import { AuthService } from "@/lib/services/authService";
import SignOutButton from "@/components/SignOutButton";

async function VolunteerHeader() {
  const user = await AuthService.getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center px-4 md:px-8 justify-between shrink-0 sticky top-0 z-50 shadow-2xs">
      <div className="flex items-center gap-3">
        {isAdmin ? (
          <Link
            href="/events"
            className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs flex items-center gap-1.5 font-semibold transition-colors border border-primary/20"
            title="Switch to Admin Event Hub"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Events Hub</span>
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gate Volunteer Mode</span>
          </div>
        )}
        <span className="text-slate-300 hidden sm:inline">|</span>
        <h1 className="font-sans text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
          Gate Authority & Scanner
        </h1>
      </div>

      <div className="flex items-center gap-2.5">
        <Link
          href="/scan/teams"
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200/60"
        >
          <Users className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">Teams Directory</span>
        </Link>

        {/* User Identity & Role Badge */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white ${
              isAdmin ? "bg-primary" : "bg-emerald-600"
            }`}
          >
            {user?.avatar || (isAdmin ? "AD" : "VL")}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-semibold text-slate-800 line-clamp-1 leading-tight">
              {user?.fullName || "User"}
            </div>
            <div className="text-[9px] font-mono font-bold text-slate-400">
              {user?.role || "VOLUNTEER"}
            </div>
          </div>
        </div>

        <SignOutButton />
      </div>
    </header>
  );
}

function VolunteerHeaderSkeleton() {
  return (
    <header className="h-16 bg-white/90 border-b border-slate-200/80 flex items-center px-4 md:px-8 justify-between shrink-0">
      <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-24 bg-slate-100 rounded-xl animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
      </div>
    </header>
  );
}

async function VolunteerBottomNav() {
  const user = await AuthService.getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  return (
    <nav className="h-16 bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex items-center justify-around shrink-0 pb-safe fixed bottom-0 left-0 right-0 z-40 shadow-lg">
      {isAdmin && (
        <Link
          href="/events"
          className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-primary transition-colors"
        >
          <Calendar className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-medium font-sans">Event Hub</span>
        </Link>
      )}

      <Link
        href="/scan"
        className="flex flex-col items-center justify-center w-full h-full text-primary font-semibold transition-colors"
      >
        <QrCode className="w-5 h-5 mb-1 text-primary" />
        <span className="text-[11px] font-medium font-sans">Camera Scanner</span>
      </Link>

      <Link
        href="/scan/teams"
        className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-slate-900 transition-colors"
      >
        <Users className="w-5 h-5 mb-1 text-primary" />
        <span className="text-[11px] font-medium font-sans">Teams Section</span>
      </Link>
    </nav>
  );
}

export default function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-900 font-sans">
      <Suspense fallback={<VolunteerHeaderSkeleton />}>
        <VolunteerHeader />
      </Suspense>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#F8FAFC]">
        {children}
      </main>

      <Suspense fallback={null}>
        <VolunteerBottomNav />
      </Suspense>
    </div>
  );
}
