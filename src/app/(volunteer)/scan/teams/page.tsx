"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchEventTeams,
  commitTeamCheckIn,
  generateAndSendVenueOtpAction,
  verifyVenueOtpAction,
} from "@/app/actions/qrActions";
import { Team } from "@/lib/dataStore";
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  QrCode,
  Copy,
  Camera,
  X,
  RefreshCw,
  KeyRound,
  Mail,
  Sparkles,
} from "lucide-react";

export default function AuthorityTeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PRESENT" | "NOT_CHECKED_IN">("ALL");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Manual Verification Modal state
  const [verifyTeam, setVerifyTeam] = useState<Team | null>(null);
  const [useOtpVerification, setUseOtpVerification] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [simulatedNotice, setSimulatedNotice] = useState<string | null>(null);

  const [idChecked, setIdChecked] = useState(false);
  const [qrModalTeam, setQrModalTeam] = useState<Team | null>(null);

  const [isPending, startTransition] = useTransition();

  const loadTeams = async () => {
    setLoading(true);
    try {
      const res = await fetchEventTeams("ev-1");
      if (res.success && res.teams) {
        setTeams(res.teams);
      }
    } catch (err: any) {
      toast.error("Error loading team roster: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleSendTeamOtp = async () => {
    if (!verifyTeam) return;
    setOtpSending(true);
    toast.loading("Sending 6-digit code to captain via Resend...", { id: "team-otp" });

    try {
      const res = await generateAndSendVenueOtpAction(verifyTeam.id, verifyTeam.event_id);
      toast.dismiss("team-otp");
      if (res.success) {
        setOtpSent(true);
        toast.success(res.message);
        if (res.isSimulated && res.simulatedOtp) {
          setSimulatedNotice(`Dev Mode Code: ${res.simulatedOtp}`);
        }
      } else {
        toast.error("Failed to send code: " + res.message);
      }
    } catch (err: any) {
      toast.dismiss("team-otp");
      toast.error("Error sending code: " + err.message);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtpAndCheckIn = async () => {
    if (!verifyTeam) return;
    if (!enteredOtp || enteredOtp.trim().length === 0) {
      toast.error("Please enter the 6-digit code.");
      return;
    }

    startTransition(async () => {
      const result = await verifyVenueOtpAction(verifyTeam.id, enteredOtp.trim(), "gate-authority");
      if (result.success) {
        toast.success(`🎉 Team '${verifyTeam.name}' admitted via 2FA verification!`);
        setVerifyTeam(null);
        setEnteredOtp("");
        setOtpSent(false);
        loadTeams();
      } else {
        toast.error("Verification failed: " + result.message);
      }
    });
  };

  const handleConfirmDirectCheckIn = async () => {
    if (!verifyTeam) return;

    startTransition(async () => {
      const result = await commitTeamCheckIn(verifyTeam.id, verifyTeam.event_id, "gate-authority");
      if (result.success) {
        toast.success(`🎉 Team '${verifyTeam.name}' is marked as PRESENT in the system!`);
        setVerifyTeam(null);
        setIdChecked(false);
        loadTeams();
      } else {
        toast.error("Check-in error: " + result.message);
      }
    });
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("QR Token copied to clipboard!");
  };

  const filteredTeams = teams.filter((t) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      t.name.toLowerCase().includes(query) ||
      t.participants.some(
        (p) => p.full_name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query)
      );

    if (!matchesSearch) return false;
    if (filter === "PRESENT") return t.check_in_status === "CHECKED_IN";
    if (filter === "NOT_CHECKED_IN") return t.check_in_status !== "CHECKED_IN";
    return true;
  });

  const totalTeams = teams.length;
  const totalParticipants = teams.reduce((acc, t) => acc + (t.participants?.length || 0), 0);
  const presentCount = teams.filter((t) => t.check_in_status === "CHECKED_IN").length;
  const pendingCount = totalTeams - presentCount;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 pb-28 pt-2 font-sans">
      {/* Precision Top Header matching website theme */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
              Authority View
            </span>
            <span className="text-xs text-slate-500 font-medium">Apex Cyber League 2026</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-7 h-7 text-primary shrink-0" />
            <span>Team Directory & Roster Verification</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
            Every team has a segregated roster and its own unique single-use QR pass. Cross-check member counts and verify on spot.
          </p>
        </div>

        {/* Header Action Buttons with Crystal-Clear Contrast */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            size="sm"
            onClick={loadTeams}
            disabled={loading}
            className="bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 text-xs font-semibold h-9.5 px-3.5 rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => router.push("/scan")}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9.5 px-4 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-white" />
            <span>Open Camera Scanner</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar (Precision Clean White Cards matching website theme) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            Total Teams
          </div>
          <div className="text-2xl sm:text-3xl font-mono text-slate-900 font-bold tracking-tight mt-1">
            {totalTeams}
          </div>
          <div className="text-xs font-sans text-slate-500 mt-0.5">
            {totalParticipants} Registered Members
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-[11px] font-mono font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Present (Checked In)</span>
          </div>
          <div className="text-2xl sm:text-3xl font-mono text-emerald-600 font-bold tracking-tight mt-1">
            {presentCount}
          </div>
          <div className="text-xs font-sans text-emerald-700/90 font-medium mt-0.5">
            {totalTeams > 0 ? `${Math.round((presentCount / totalTeams) * 100)}% Admitted` : "0%"}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-[11px] font-mono font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Pending Admission</span>
          </div>
          <div className="text-2xl sm:text-3xl font-mono text-amber-600 font-bold tracking-tight mt-1">
            {pendingCount}
          </div>
          <div className="text-xs font-sans text-amber-700/90 font-medium mt-0.5">
            Awaiting Verification
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-[11px] font-mono font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
            <QrCode className="w-3.5 h-3.5 text-indigo-500" />
            <span>Unique QR Passes</span>
          </div>
          <div className="text-2xl sm:text-3xl font-mono text-indigo-600 font-bold tracking-tight mt-1">
            {totalTeams}
          </div>
          <div className="text-xs font-sans text-indigo-700/90 font-medium mt-0.5">
            1 pass per distinct team
          </div>
        </div>
      </div>

      {/* Search and Filters Segmented Control */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search Team Name (e.g. Cyber Knights), Leader, or Member..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9.5 bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm h-10 rounded-xl font-sans focus-visible:ring-primary/20 focus-visible:border-primary"
          />
        </div>

        {/* Filter Tabs with Clear Visual Hierarchy */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold font-sans transition-all cursor-pointer ${
              filter === "ALL"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/60"
            }`}
          >
            All ({totalTeams})
          </button>

          <button
            type="button"
            onClick={() => setFilter("PRESENT")}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold font-sans transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "PRESENT"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Present ({presentCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("NOT_CHECKED_IN")}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold font-sans transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "NOT_CHECKED_IN"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Pending ({pendingCount})</span>
          </button>
        </div>
      </div>

      {/* Teams List (High-Contrast White Cards matching website theme) */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 font-sans shadow-2xs">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto text-primary mb-2.5" />
          <p className="text-sm font-medium">Loading authority team rosters...</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-2xs">
          <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h4 className="text-base font-bold text-slate-800 font-sans">No matching teams found</h4>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Try searching by team name like 'Cyber Knights' or leader name like 'Alex Vance'.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredTeams.map((team) => {
            const isCheckedIn = team.check_in_status === "CHECKED_IN";
            const isExpanded = expandedTeamId === team.id;
            const leader = team.participants.find((p) => p.is_leader) || team.participants[0];

            return (
              <div
                key={team.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all overflow-hidden"
              >
                {/* Team Card Top Section */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Distinct QR Thumbnail + Team Details */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* High-Resolution QR Thumbnail */}
                    <div
                      onClick={() => setQrModalTeam(team)}
                      className="w-14 h-14 bg-white p-1 rounded-xl shrink-0 border border-slate-200 cursor-pointer hover:ring-2 hover:ring-primary shadow-2xs transition-all flex items-center justify-center group"
                      title="Click to Enlarge QR Pass"
                    >
                      {team.qr_data_url ? (
                        <img
                          src={team.qr_data_url}
                          alt={team.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <QrCode className="w-full h-full text-slate-700" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Name + Badges with Crystal-Clear Contrast */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-sans text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug break-words">
                          {team.name}
                        </h3>

                        {/* Distinct Member Count Badge (100% visible on white theme) */}
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 font-sans">
                          {team.participants.length} {team.participants.length === 1 ? "Member" : "Members"}
                        </span>

                        {/* Check-In Status Badge */}
                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Present (Checked In)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 font-sans">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Not Checked In</span>
                          </span>
                        )}
                      </div>

                      {/* Subtitle Details */}
                      <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans">
                        <span>
                          <span className="text-slate-400">Leader:</span>{" "}
                          <strong className="text-slate-800 font-semibold">{leader?.full_name || "N/A"}</strong>
                        </span>
                        {leader?.mobile_number && (
                          <span>
                            <span className="text-slate-400">Mobile:</span>{" "}
                            <span className="font-mono text-slate-600">{leader.mobile_number}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">Token:</span>{" "}
                          <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px] font-medium">
                            {team.qr_token}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: High-Visibility Buttons with High Contrast */}
                  <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                    {/* "QR Pass" Button - Prominent, Crisp Border, Visible Text */}
                    <button
                      type="button"
                      onClick={() => setQrModalTeam(team)}
                      className="bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 text-xs font-semibold h-9 px-3.5 rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="View single-use QR pass"
                    >
                      <QrCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>QR Pass</span>
                    </button>

                    {/* "Verify & Check In" Button or "Admitted" Badge */}
                    {!isCheckedIn ? (
                      <button
                        type="button"
                        onClick={() => {
                          setVerifyTeam(team);
                          setIdChecked(false);
                          setOtpSent(false);
                          setEnteredOtp("");
                          setSimulatedNotice(null);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-white shrink-0" />
                        <span>Verify & Check In</span>
                      </button>
                    ) : (
                      <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold h-9 px-3.5 rounded-xl flex items-center gap-1.5 font-sans shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Admitted</span>
                      </div>
                    )}

                    {/* Roster Expansion Chevron */}
                    <button
                      type="button"
                      onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                      className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                      title={isExpanded ? "Collapse roster" : "Expand roster"}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Roster for Physical ID Cross-Checking */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                        Roster Checklist ({team.participants.length} Participants to Verify)
                      </h4>
                      <span className="text-xs text-slate-500 font-sans">
                        Verify photo IDs for all listed members
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {team.participants.map((p, idx) => (
                        <div
                          key={p.id || idx}
                          className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs flex items-center justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                              <span>{p.full_name}</span>
                              {p.is_leader && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold">
                                  Leader
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-sans text-slate-500 mt-0.5 truncate">
                              {p.course || "Student"} • {p.year_of_study || "N/A"}
                            </div>
                          </div>
                          <div className="text-right text-[11px] font-mono text-slate-500 shrink-0 ml-2">
                            {p.mobile_number || p.email}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AUTHORITY VERIFICATION CHECKPOINT MODAL (Clean High-Contrast White Theme) */}
      {verifyTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 font-sans text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-mono text-primary uppercase tracking-wider font-bold">
                  Authority Gate Checkpoint
                </span>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">{verifyTeam.name}</h3>
              </div>
              <span className="px-2.5 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
                {verifyTeam.participants.length} Members
              </span>
            </div>

            {/* Participants list */}
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Participants to Verify on Venue Entry:
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {verifyTeam.participants.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs font-sans text-slate-800 flex justify-between"
                  >
                    <span>
                      {p.full_name}{" "}
                      {p.is_leader && <span className="text-primary font-bold">(Leader)</span>}
                    </span>
                    <span className="text-slate-500">{p.course}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* On-Spot OTP Verification Feature */}
            <div className="bg-blue-50/60 border border-blue-200/80 p-4 rounded-xl mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-primary" />
                  On-Spot Email OTP Verification
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                  <span>Require OTP</span>
                  <input
                    type="checkbox"
                    checked={useOtpVerification}
                    onChange={(e) => setUseOtpVerification(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </label>
              </div>

              {useOtpVerification ? (
                <div className="space-y-2.5 pt-1">
                  {!otpSent ? (
                    <Button
                      size="sm"
                      onClick={handleSendTeamOtp}
                      disabled={otpSending}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-sans text-xs h-9.5 font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      <span>{otpSending ? "Dispatching via Resend..." : "Send Verification Code to Captain Email"}</span>
                    </Button>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Code dispatched to captain's inbox
                        </span>
                        <button
                          onClick={handleSendTeamOtp}
                          className="text-primary hover:underline font-mono text-xs font-semibold cursor-pointer"
                        >
                          Resend Code
                        </button>
                      </div>

                      {simulatedNotice && (
                        <div className="text-[11px] font-mono text-amber-900 bg-amber-100 p-2 rounded-lg border border-amber-300">
                          {simulatedNotice}
                        </div>
                      )}

                      <Input
                        placeholder="Enter 6-Digit Code"
                        value={enteredOtp}
                        maxLength={6}
                        onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ""))}
                        className="h-11 bg-white border border-slate-300 text-slate-900 font-mono text-xl tracking-widest text-center font-bold rounded-xl focus-visible:ring-primary/20"
                      />

                      <Button
                        size="sm"
                        onClick={handleVerifyOtpAndCheckIn}
                        disabled={isPending || enteredOtp.length < 6}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-xs font-semibold h-10 rounded-xl shadow-xs"
                      >
                        {isPending ? "Validating..." : "Verify Code & Mark Present"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                      checked={idChecked}
                      onChange={(e) => setIdChecked(e.target.checked)}
                    />
                    <span className="text-xs text-amber-900 leading-relaxed">
                      I certify physical ID verification for all attendees of <strong>{verifyTeam.name}</strong>.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-1 border-t border-slate-100">
              <Button
                className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold h-9.5 rounded-xl cursor-pointer"
                onClick={() => setVerifyTeam(null)}
              >
                Cancel
              </Button>

              {!useOtpVerification && (
                <Button
                  disabled={!idChecked || isPending}
                  onClick={handleConfirmDirectCheckIn}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9.5 rounded-xl shadow-xs cursor-pointer"
                >
                  {isPending ? "Admitting..." : "Confirm & Mark Present"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR PASS MODAL (Clean High-Contrast White Theme) */}
      {qrModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center relative animate-in fade-in zoom-in-95 font-sans text-slate-900">
            <button
              onClick={() => setQrModalTeam(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full uppercase border border-indigo-200 mb-2 font-mono">
              Single-Use Entry Pass
            </span>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">{qrModalTeam.name}</h3>
            <p className="text-xs text-slate-500 mb-4">{qrModalTeam.participants.length} Registered Members</p>

            <div className="bg-white p-3.5 rounded-2xl border-2 border-slate-200/90 inline-block mb-4 shadow-inner">
              {qrModalTeam.qr_data_url ? (
                <img
                  src={qrModalTeam.qr_data_url}
                  alt={qrModalTeam.name}
                  className="w-56 h-56 mx-auto object-contain"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                  Loading QR...
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between text-xs font-mono text-slate-700 mb-4">
              <span className="truncate max-w-[200px]">{qrModalTeam.qr_token}</span>
              <button
                onClick={() => handleCopyToken(qrModalTeam.qr_token)}
                className="text-primary hover:text-primary/80 p-1 hover:bg-white rounded transition-colors"
                title="Copy token to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <Button
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-10 rounded-xl shadow-xs"
              onClick={() => {
                setQrModalTeam(null);
                router.push(`/scan?token=${encodeURIComponent(qrModalTeam.qr_token)}`);
              }}
            >
              Test in Gate Scanner
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
