import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  QrCode,
  Layers,
  ArrowLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { getEventById } from "@/lib/dataStore";
import { AuthService } from "@/lib/services/authService";
import SignOutButton from "@/components/SignOutButton";

async function AdminSidebar({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await connection();
  const resolvedParams = await params;
  const eventId = resolvedParams.eventId || "ev-1";

  const [event, user] = await Promise.all([
    getEventById(eventId),
    AuthService.getCurrentUser(),
  ]);

  const eventName = event?.name || `Event (${eventId})`;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0">
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-sans font-bold text-base shadow-xs">
            E
          </div>
          <span className="font-sans font-bold text-lg text-slate-900 tracking-tight">Event Portal</span>
        </div>

        <Link
          href="/events"
          title="All Events Hub"
          className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5 bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Hub</span>
        </Link>
      </div>

      {/* Current Event Context Pill */}
      <div className="p-3.5 mx-3 mt-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            Active Event
          </span>
          <Link
            href="/events"
            className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5"
          >
            Switch <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="text-xs font-sans font-bold text-slate-800 line-clamp-1" title={eventName}>
          {eventName}
        </div>
        <div className="text-[10px] text-slate-400 font-mono">ID: {eventId}</div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-3.5 space-y-1">
        <Link
          href={`/events/${eventId}/dashboard`}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-100/70 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          <LayoutDashboard className="w-4 h-4 text-slate-500" />
          Dashboard
        </Link>

        <Link
          href={`/events/${eventId}/registrations`}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-100/70 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          <Users className="w-4 h-4 text-slate-500" />
          Registrations & Passes
        </Link>

        <Link
          href={`/events/${eventId}/imports`}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-100/70 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          <FileSpreadsheet className="w-4 h-4 text-slate-500" />
          Data Imports
        </Link>

        <Link
          href={`/events/${eventId}/audit`}
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-rose-700 hover:bg-rose-50 transition-colors text-sm font-medium"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            Security Audit
          </div>
          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-mono font-semibold">
            Telemetry
          </span>
        </Link>

        <div className="pt-4 pb-1">
          <span className="px-3.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-sans">
            On-Site Venue Check-In
          </span>
        </div>

        <Link
          href="/scan"
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors text-sm font-medium shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <QrCode className="w-4 h-4 text-primary" />
            <span>Gate Scanner</span>
          </div>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">
            Live
          </span>
        </Link>

        <Link
          href="/scan/teams"
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-100/70 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Authority Teams</span>
          </div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">
            Venue
          </span>
        </Link>
      </nav>

      {/* User Profile Bar */}
      <div className="p-3.5 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
            {user?.avatar || "AD"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 truncate">
              {user?.fullName || "Administrator"}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {user?.email || "admin@eventportal.com"}
            </div>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

function AdminSidebarSkeleton() {
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0 animate-pulse">
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="h-8 w-32 bg-slate-200 rounded-lg" />
      </div>
      <div className="p-3.5 mx-3 mt-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-4 w-36 bg-slate-200 rounded" />
      </div>
      <div className="flex-1 p-3.5 space-y-2 mt-2">
        <div className="h-9 bg-slate-100 rounded-xl" />
        <div className="h-9 bg-slate-100 rounded-xl" />
        <div className="h-9 bg-slate-100 rounded-xl" />
      </div>
      <div className="p-3.5 border-t border-slate-100 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
        <div className="space-y-1 flex-1">
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-2.5 w-28 bg-slate-100 rounded" />
        </div>
      </div>
    </aside>
  );
}

async function AdminHeader({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await connection();
  const resolvedParams = await params;
  const eventId = resolvedParams.eventId || "ev-1";

  const [event, user] = await Promise.all([
    getEventById(eventId),
    AuthService.getCurrentUser(),
  ]);

  const eventName = event?.name || `Event (${eventId})`;

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 sm:px-6 md:px-8 justify-between shrink-0 shadow-2xs overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 pr-2">
        <Link
          href="/events"
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline-block">All Events</span>
        </Link>

        <span className="text-slate-300 shrink-0">/</span>

        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-sans text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
            {eventName}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-sans font-medium hidden md:inline-block shrink-0">
            Active
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <Link
          href="/events"
          className="text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
        >
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span className="hidden md:inline-block">Switch Event</span>
        </Link>

        <Link
          href="/scan"
          className="text-xs font-sans font-medium px-2 sm:px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 shadow-2xs shrink-0"
        >
          <QrCode className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline-block">Gate Scanner</span>
        </Link>

        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs border border-primary/20 shrink-0 ml-1">
          {user?.avatar || "AD"}
        </div>
      </div>
    </header>
  );
}

function AdminHeaderSkeleton() {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 md:px-8 justify-between shrink-0 shadow-2xs animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-20 bg-slate-100 rounded-lg" />
        <div className="h-5 w-40 bg-slate-200 rounded" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-7 w-24 bg-slate-100 rounded-lg" />
        <div className="w-8 h-8 rounded-full bg-slate-200" />
      </div>
    </header>
  );
}

async function AdminMobileNav({ params }: { params: Promise<{ eventId: string }> }) {
  await connection();
  const resolved = await params;
  const eventId = resolved.eventId || "ev-1";

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
      <Link
        href={`/events/${eventId}/dashboard`}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-600 hover:text-slate-900 active:text-primary"
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[10px] font-medium">Dashboard</span>
      </Link>

      <Link
        href={`/events/${eventId}/registrations`}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-600 hover:text-slate-900 active:text-primary"
      >
        <Users className="w-5 h-5" />
        <span className="text-[10px] font-medium">Passes</span>
      </Link>

      <Link
        href="/scan"
        className="flex flex-col items-center gap-0.5 -mt-4 bg-slate-900 text-white p-2.5 rounded-full shadow-md active:scale-95 transition-transform"
      >
        <QrCode className="w-5 h-5 text-emerald-400" />
      </Link>

      <Link
        href={`/events/${eventId}/imports`}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-600 hover:text-slate-900 active:text-primary"
      >
        <FileSpreadsheet className="w-5 h-5" />
        <span className="text-[10px] font-medium">Import</span>
      </Link>

      <Link
        href={`/events/${eventId}/audit`}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-rose-600 hover:text-rose-700 active:text-rose-800"
      >
        <ShieldAlert className="w-5 h-5" />
        <span className="text-[10px] font-medium font-semibold">Audit</span>
      </Link>
    </div>
  );
}

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex font-sans">
      <Suspense fallback={<AdminSidebarSkeleton />}>
        <AdminSidebar params={params} />
      </Suspense>

      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden">
        <Suspense fallback={<AdminHeaderSkeleton />}>
          <AdminHeader params={params} />
        </Suspense>

        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 pb-20 md:pb-8">
          {children}
        </div>

        <Suspense fallback={null}>
          <AdminMobileNav params={params} />
        </Suspense>
      </main>
    </div>
  );
}
