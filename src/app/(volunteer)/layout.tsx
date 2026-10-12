import Link from "next/link";
import { QrCode, Users, ArrowLeft } from "lucide-react";

export default function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-900 font-sans">
      {/* Precision Navigation Header matching website theme */}
      <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center px-4 md:px-8 justify-between shrink-0 sticky top-0 z-50 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href="/events/ev-1/dashboard"
            className="text-slate-500 hover:text-slate-900 text-xs flex items-center gap-1 font-medium transition-colors"
            title="Return to Admin Portal"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Portal</span>
          </Link>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <h1 className="font-sans text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Gate Authority & Check-In
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/scan/teams"
            className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200/60"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>Teams Directory</span>
          </Link>
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs ring-2 ring-slate-900/10">
            GA
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#F8FAFC]">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="h-16 bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex items-center justify-around shrink-0 pb-safe fixed bottom-0 left-0 right-0 z-40 shadow-lg">
        <Link
          href="/scan"
          className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-slate-900 transition-colors"
        >
          <QrCode className="w-5 h-5 mb-1 text-primary" />
          <span className="text-xs font-medium font-sans">Camera Scanner</span>
        </Link>

        <Link
          href="/scan/teams"
          className="flex flex-col items-center justify-center w-full h-full text-primary font-semibold transition-colors"
        >
          <Users className="w-5 h-5 mb-1 text-primary" />
          <span className="text-xs font-medium font-sans">Teams Section</span>
        </Link>
      </nav>
    </div>
  );
}
