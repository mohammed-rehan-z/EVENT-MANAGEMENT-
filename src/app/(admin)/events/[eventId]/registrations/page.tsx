"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchEventTeams,
  approveTeamAndGenerateQR,
  sendTeamQREmail,
  addManualTeamAction,
  deleteTeamQRAction,
  regenerateTeamQRAction,
  batchRegenerateEventQRsAction,
  sendCustomTeamEmailAction,
  bulkDeleteTeamsAction,
  bulkCheckInTeamsAction,
  bulkExtendQRExpirationAction,
  bulkApproveTeamsAction,
} from "@/app/actions/qrActions";
import { Team, Participant } from "@/lib/dataStore";
import {
  QrCode,
  Mail,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Send,
  X,
  FileSpreadsheet,
  RefreshCw,
  Copy,
  ExternalLink,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";

export default function RegistrationsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <Suspense fallback={<RegistrationsSkeleton />}>
        <RegistrationsContent />
      </Suspense>
    </div>
  );
}

function RegistrationsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-8 w-60 bg-slate-200 rounded-lg" />
          <div className="h-4 w-96 bg-slate-100 rounded" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-8 w-20 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          <div className="h-8 w-32 bg-slate-200 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-white border border-slate-200 rounded-xl p-4">
            <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
            <div className="h-5 w-12 bg-slate-200 rounded mb-1" />
            <div className="h-2.5 w-24 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      <div className="h-14 bg-white rounded-xl border border-slate-200 p-4" />

      <div className="space-y-3.5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-5" />
        ))}
      </div>
    </div>
  );
}

function RegistrationsContent() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "ev-1";

  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PRESENT" | "ABSENT" | "MAIL_SENT" | "MAIL_NOT_SENT">("ALL");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Pagination state for high scale (1000+ teams)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // QR Modal State
  const [selectedQRTeam, setSelectedQRTeam] = useState<Team | null>(null);

  const handleOpenQRModal = async (team: Team) => {
    if (team.qr_token && !team.qr_data_url) {
      try {
        const QRCode = (await import("qrcode")).default;
        const dataUrl = await QRCode.toDataURL(team.qr_token, {
          width: 450,
          margin: 2,
          color: { dark: "#0F172A", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        team.qr_data_url = dataUrl;
      } catch (err) {
        console.error("QR modal generation error:", err);
      }
    }
    setSelectedQRTeam(team);
  };

  // Manual Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  const [leaderPhone, setLeaderPhone] = useState("");
  const [leaderCourse, setLeaderCourse] = useState("Computer Science");
  const [leaderYear, setLeaderYear] = useState("3rd Year");
  const [extraMembers, setExtraMembers] = useState<Array<{ name: string; email: string; course: string; year: string }>>([]);

  // Delete QR Target Modal State
  const [deleteQRTarget, setDeleteQRTarget] = useState<Team | null>(null);
  const [batchRegenerateModalOpen, setBatchRegenerateModalOpen] = useState(false);

  // Bulk selection state
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

  // Resend Custom Email Compose Modal state
  const [emailModalTeam, setEmailModalTeam] = useState<Team | null>(null);
  const [customEmailSubject, setCustomEmailSubject] = useState("");
  const [customEmailBody, setCustomEmailBody] = useState("");
  const [includeQrAttachment, setIncludeQrAttachment] = useState(true);
  const [isSendingCustomEmail, setIsSendingCustomEmail] = useState(false);

  const [isPending, startTransition] = useTransition();

  const loadTeams = async () => {
    setIsLoading(true);
    try {
      const res = await fetchEventTeams(eventId);
      if (res.success && res.teams) {
        setTeams(res.teams);
      } else {
        toast.error("Failed to load registrations: " + (res.message || "Unknown error"));
      }
    } catch (err: any) {
      toast.error("Error loading registrations: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, [eventId]);

  // Handle Regenerate / Re-run QR for a team
  const handleRegenerateQR = async (team: Team) => {
    startTransition(async () => {
      const res = await regenerateTeamQRAction(team.id);
      if (res.success && res.team) {
        toast.success(`Fresh single-use QR pass generated for '${team.name}'. Old pass invalidated.`);
        setTeams((prev) => prev.map((t) => (t.id === team.id ? res.team! : t)));
        if (selectedQRTeam && selectedQRTeam.id === team.id) {
          setSelectedQRTeam(res.team);
        }
      } else {
        toast.error("Failed to regenerate QR: " + (res.message || "Unknown error"));
      }
    });
  };

  // Handle Delete / Revoke QR for a team
  const handleDeleteQR = async () => {
    if (!deleteQRTarget) return;
    startTransition(async () => {
      const res = await deleteTeamQRAction(deleteQRTarget.id);
      if (res.success && res.team) {
        toast.success(`QR pass deleted for '${deleteQRTarget.name}'. Pass is now revoked.`);
        setTeams((prev) => prev.map((t) => (t.id === deleteQRTarget.id ? res.team! : t)));
        if (selectedQRTeam && selectedQRTeam.id === deleteQRTarget.id) {
          setSelectedQRTeam(null);
        }
        setDeleteQRTarget(null);
      } else {
        toast.error("Failed to delete QR: " + (res.message || "Unknown error"));
      }
    });
  };

  // Handle Batch Re-run QRs for all teams in the event
  const handleBatchRegenerateQRs = async () => {
    startTransition(async () => {
      const res = await batchRegenerateEventQRsAction(eventId);
      if (res.success) {
        toast.success(`Successfully re-run & generated ${res.count} fresh single-use QR passes across this event.`);
        setBatchRegenerateModalOpen(false);
        loadTeams();
      } else {
        toast.error("Failed to batch regenerate QR codes: " + res.message);
      }
    });
  };

  // Handle Send QR to Mail (Send or No)
  const handleToggleMail = async (team: Team, shouldSend: boolean) => {
    startTransition(async () => {
      const res = await sendTeamQREmail(team.id, shouldSend);
      if (res.success) {
        toast.success(
          shouldSend
            ? `QR Pass sent to ${team.participants[0]?.email || team.name}!`
            : `Marked as 'Do Not Send' for ${team.name}`
        );
        // Optimistically update
        setTeams((prev) =>
          prev.map((t) =>
            t.id === team.id
              ? {
                  ...t,
                  qr_email_sent: shouldSend,
                  qr_email_sent_at: shouldSend ? new Date().toISOString() : null,
                }
              : t
          )
        );
      } else {
        toast.error("Failed to update email status: " + res.message);
      }
    });
  };

  // Bulk selection toggles
  const toggleSelectTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedTeams.map((t) => t.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedTeamIds.includes(id));
    if (allVisibleSelected) {
      setSelectedTeamIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedTeamIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectAllTeams = () => {
    const allFilteredIds = filteredTeams.map((t) => t.id);
    const allSelected =
      allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedTeamIds.includes(id));
    if (allSelected) {
      setSelectedTeamIds([]);
    } else {
      setSelectedTeamIds(allFilteredIds);
    }
  };

  // Bulk Delete teams action
  const handleBulkDelete = async () => {
    if (selectedTeamIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkDeleteTeamsAction(selectedTeamIds);
      if (res.success) {
        toast.success(`Deleted ${res.deletedCount} teams permanently.`);
        setSelectedTeamIds([]);
        setBulkDeleteModalOpen(false);
        loadTeams();
      } else {
        toast.error("Failed to delete teams: " + res.message);
      }
    });
  };

  // Bulk Check-in selected teams
  const handleBulkCheckIn = async () => {
    if (selectedTeamIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkCheckInTeamsAction(selectedTeamIds, "admin-bulk-gate");
      if (res.success) {
        toast.success(res.message);
        loadTeams();
        setSelectedTeamIds([]);
      } else {
        toast.error(res.message);
      }
    });
  };

  // Bulk Extend QR Expiration for selected teams
  const handleBulkExtendExpiry = async () => {
    if (selectedTeamIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkExtendQRExpirationAction(selectedTeamIds, 24);
      if (res.success) {
        toast.success(res.message);
        loadTeams();
      } else {
        toast.error(res.message);
      }
    });
  };

  // Open Resend Custom Email Compose Modal
  const handleOpenEmailModal = (team: Team) => {
    const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
    setEmailModalTeam(team);
    setCustomEmailSubject(`🎟️ Official QR Entry Pass - Team ${team.name} [Apex Cyber League]`);
    setCustomEmailBody(
      `Dear ${leader?.full_name || team.name},\n\nYour team registration for "${team.name}" has been approved for admission.\n\nPlease find your official single-use cryptographic QR pass attached to this email. Present this digital pass along with physical student ID cards at the gate checkpoint for admission.\n\nWe look forward to seeing you at the arena!`
    );
    setIncludeQrAttachment(true);
  };

  // Send Custom Email via Resend
  const handleSendCustomEmail = async () => {
    if (!emailModalTeam) return;
    setIsSendingCustomEmail(true);
    try {
      const res = await sendCustomTeamEmailAction({
        teamId: emailModalTeam.id,
        customSubject: customEmailSubject,
        customBody: customEmailBody,
        includeAttachment: includeQrAttachment,
      });

      if (res.success) {
        toast.success(res.message);
        setEmailModalTeam(null);
        // Optimistically update
        setTeams((prev) =>
          prev.map((t) =>
            t.id === emailModalTeam.id
              ? { ...t, qr_email_sent: true, qr_email_sent_at: new Date().toISOString() }
              : t
          )
        );
      } else {
        toast.error("Failed to send email: " + res.message);
      }
    } catch (err: any) {
      toast.error("Email error: " + err.message);
    } finally {
      setIsSendingCustomEmail(false);
    }
  };

  // Bulk Send QR to all unsent
  const handleBulkSendEmails = async () => {
    const unsentTeams = teams.filter((t) => !t.qr_email_sent);
    if (unsentTeams.length === 0) {
      toast.info("All teams have already received their QR code emails.");
      return;
    }

    toast.loading(`Sending QR passes to ${unsentTeams.length} teams...`, { id: "bulk-mail" });
    for (const team of unsentTeams) {
      await sendTeamQREmail(team.id, true);
    }
    toast.dismiss("bulk-mail");
    toast.success(`Dispatched QR passes to ${unsentTeams.length} teams!`);
    loadTeams();
  };

  // Handle Manual Team Submission
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !leaderName.trim() || !leaderEmail.trim()) {
      toast.error("Please fill in Team Name, Leader Name, and Leader Email.");
      return;
    }

    const participantsPayload = [
      {
        full_name: leaderName.trim(),
        email: leaderEmail.trim(),
        mobile_number: leaderPhone.trim() || undefined,
        course: leaderCourse,
        year_of_study: leaderYear,
        is_leader: true,
      },
      ...extraMembers
        .filter((m) => m.name.trim())
        .map((m) => ({
          full_name: m.name.trim(),
          email: m.email.trim() || `${m.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          course: m.course || leaderCourse,
          year_of_study: m.year || leaderYear,
          is_leader: false,
        })),
    ];

    startTransition(async () => {
      const res = await addManualTeamAction(eventId, newTeamName.trim(), participantsPayload);
      if (res.success && res.team) {
        toast.success(`Team '${newTeamName}' created with QR pass generated!`);
        setIsAddModalOpen(false);
        // Reset form
        setNewTeamName("");
        setLeaderName("");
        setLeaderEmail("");
        setLeaderPhone("");
        setExtraMembers([]);
        loadTeams();
      } else {
        toast.error("Failed to create team: " + (res.message || "Unknown error"));
      }
    });
  };

  // Copy QR token
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("QR Token copied to clipboard!");
  };

  // Download QR code image
  const handleDownloadQR = (team: Team) => {
    if (!team.qr_data_url) return;
    const link = document.createElement("a");
    link.href = team.qr_data_url;
    link.download = `QR_PASS_${team.name.replace(/\s+/g, "_")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloaded QR pass for ${team.name}`);
  };

  // Export roster as JSON / CSV
  const handleExportRoster = () => {
    const rows = teams.flatMap((t) =>
      t.participants.map((p) => ({
        Team_Name: t.name,
        Full_Name: p.full_name,
        Role: p.is_leader ? "Leader" : "Member",
        Email: p.email,
        Mobile: p.mobile_number || "N/A",
        Course: p.course || "N/A",
        Year: p.year_of_study || "N/A",
        Status: t.status,
        QR_Token: t.qr_token,
        Mail_Sent: t.qr_email_sent ? "Yes" : "No",
        Attendance: t.check_in_status === "CHECKED_IN" ? "Present" : "Absent",
        Checked_In_At: t.checked_in_at || "N/A",
      }))
    );

    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event_roster_${eventId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} participants across ${teams.length} teams.`);
  };

  // Filtered teams
  const filteredTeams = teams.filter((team) => {
    const matchesSearch =
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.participants.some(
        (p) =>
          p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email.toLowerCase().includes(searchQuery.toLowerCase())
      );

    if (!matchesSearch) return false;

    if (statusFilter === "PRESENT") return team.check_in_status === "CHECKED_IN";
    if (statusFilter === "ABSENT") return team.check_in_status !== "CHECKED_IN";
    if (statusFilter === "MAIL_SENT") return team.qr_email_sent;
    if (statusFilter === "MAIL_NOT_SENT") return !team.qr_email_sent;

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / pageSize));
  const paginatedTeams = filteredTeams.slice((page - 1) * pageSize, page * pageSize);

  const totalParticipants = teams.reduce((acc, t) => acc + (t.participants?.length || 0), 0);
  const presentTeams = teams.filter((t) => t.check_in_status === "CHECKED_IN").length;
  const emailsSentCount = teams.filter((t) => t.qr_email_sent).length;

  return (
    <>
      {/* Responsive Header: Title + Action Cluster (Zero Overlapping) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Team Registrations</h1>
          <p className="text-slate-500 font-sans text-xs sm:text-sm">
            Segregated team rosters, on-demand cryptographic passes, and gate verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={loadTeams}
            disabled={isLoading}
            className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-sans rounded-lg active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/imports`)}
            className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-sans rounded-lg active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Upload File
          </Button>

          <Button
            variant="outline"
            onClick={handleExportRoster}
            className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-sans rounded-lg active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export Roster
          </Button>

          <Button
            variant="outline"
            onClick={() => setBatchRegenerateModalOpen(true)}
            className="bg-white border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-xs font-sans rounded-lg active:scale-[0.98]"
            title="Batch re-generate single-use QR passes for all teams"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            Re-run All QRs
          </Button>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-sans shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Team / Member
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview (Double-Bezel Architecture) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-4 border border-slate-200/80">
            <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Total Teams</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{teams.length}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{totalParticipants} registered attendees</div>
          </div>
        </div>

        <div className="rounded-2xl p-1.5 ring-1 ring-emerald-500/20 bg-gradient-to-b from-emerald-50/80 to-slate-100 shadow-2xs">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-4 border border-emerald-200/80">
            <div className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider">Present / Admitted</div>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{presentTeams}</div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">
              {teams.length > 0 ? `${Math.round((presentTeams / teams.length) * 100)}% turnout` : "0% turnout"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-4 border border-slate-200/80">
            <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Passes Generated</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {teams.filter((t) => t.qr_token).length}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Single-use passes</div>
          </div>
        </div>

        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-4 border border-slate-200/80">
            <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Emails Dispatched</div>
            <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{emailsSentCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {teams.length - emailsSentCount} unsent
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter & Quick Bulk Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by Team Name, Leader, or Email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-slate-50/60 border-slate-200 h-9.5 text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {/* Master Select All Filtered Teams Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAllTeams}
              className={`text-xs h-8 font-sans ${
                filteredTeams.length > 0 && filteredTeams.every((t) => selectedTeamIds.includes(t.id))
                  ? "bg-primary text-white border-primary hover:bg-primary/90 hover:text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
              }`}
              title="Select / Deselect all matching teams across the entire event"
            >
              {filteredTeams.length > 0 && filteredTeams.every((t) => selectedTeamIds.includes(t.id)) ? (
                <CheckSquare className="w-3.5 h-3.5 mr-1 text-white" />
              ) : (
                <Square className="w-3.5 h-3.5 mr-1 text-slate-400" />
              )}
              Select All ({filteredTeams.length})
            </Button>

            {/* Master Select Page Checkbox */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAllVisible}
              className={`text-xs h-8 font-sans ${
                paginatedTeams.length > 0 && paginatedTeams.every((t) => selectedTeamIds.includes(t.id))
                  ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
              }`}
              title="Select / Deselect all teams shown on this page"
            >
              {paginatedTeams.length > 0 && paginatedTeams.every((t) => selectedTeamIds.includes(t.id)) ? (
                <CheckSquare className="w-3.5 h-3.5 mr-1 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5 mr-1 text-slate-400" />
              )}
              Select Page ({paginatedTeams.length})
            </Button>

            <Button
              variant={statusFilter === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatusFilter("ALL");
                setPage(1);
              }}
              className="text-xs h-8"
            >
              All ({teams.length})
            </Button>
            <Button
              variant={statusFilter === "PRESENT" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatusFilter("PRESENT");
                setPage(1);
              }}
              className="text-xs h-8 text-emerald-700"
            >
              Present ({presentTeams})
            </Button>
            <Button
              variant={statusFilter === "ABSENT" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatusFilter("ABSENT");
                setPage(1);
              }}
              className="text-xs h-8 text-slate-600"
            >
              Not Checked In ({teams.length - presentTeams})
            </Button>
            <Button
              variant={statusFilter === "MAIL_NOT_SENT" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatusFilter("MAIL_NOT_SENT");
                setPage(1);
              }}
              className="text-xs h-8 text-amber-700"
            >
              Unsent Mails ({teams.length - emailsSentCount})
            </Button>
          </div>
        </div>

        {teams.length - emailsSentCount > 0 && (
          <Button
            onClick={handleBulkSendEmails}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-sans shrink-0 h-8.5"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Send QR to All Unsent ({teams.length - emailsSentCount})
          </Button>
        )}
      </div>

      {/* Main Segregated Team List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 font-sans">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
          <p>Loading segregated team records...</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 font-sans">No matching teams found</h3>
          <p className="text-sm text-slate-500 font-sans mt-1 max-w-sm mx-auto">
            {searchQuery
              ? "Try adjusting your search query or clear the filter."
              : "Import an Excel/CSV roster or click 'Add Team / Member' to populate registrations."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/events/${eventId}/imports`)}
            >
              Go to Upload
            </Button>
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              Add First Team
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3.5">
            {paginatedTeams.map((team) => {
            const leader = team.participants.find((p) => p.is_leader) || team.participants[0];
            const isExpanded = expandedTeamId === team.id;
            const isCheckedIn = team.check_in_status === "CHECKED_IN";

            return (
              <div
                key={team.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  selectedTeamIds.includes(team.id)
                    ? "border-primary ring-2 ring-primary/20 bg-blue-50/25 shadow-sm"
                    : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300"
                }`}
              >
                {/* Team Summary Row */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Team Info + Selection Checkbox */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Individual Team Checkbox */}
                    <div className="pt-2 shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={() => toggleSelectTeam(team.id)}
                        className="w-4 h-4 rounded accent-primary text-primary cursor-pointer shrink-0"
                        title={`Select team ${team.name}`}
                      />
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 font-bold text-sm ring-1 ring-slate-900/10 mt-0.5">
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight leading-snug">
                          {team.name}
                        </h3>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-sans font-medium">
                          {team.participants.length} {team.participants.length === 1 ? "Member" : "Members"}
                        </span>

                        {/* Check-in status badge */}
                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Present (Checked In)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                            <Clock className="w-3 h-3" />
                            Not Checked In
                          </span>
                        )}

                        {/* Single-Use QR Pass status badge */}
                        {team.qr_token ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <QrCode className="w-3 h-3 text-indigo-600" />
                            Single-Use Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                            QR Revoked / Deleted
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 font-sans mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          <strong className="text-slate-700 font-medium">Leader:</strong> {leader?.full_name || "Unassigned"} ({leader?.email || "No email"})
                        </span>
                        {leader?.mobile_number && (
                          <span>
                            <strong className="text-slate-700 font-medium">Phone:</strong> {leader.mobile_number}
                          </span>
                        )}
                        {leader?.course && (
                          <span className="text-slate-400">
                            • {leader.course}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
                    {team.qr_token ? (
                      <>
                        {/* QR Code Pass Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenQRModal(team)}
                          className="bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-sans h-8.5"
                        >
                          <QrCode className="w-3.5 h-3.5 mr-1.5 text-primary" />
                          View QR Pass
                        </Button>

                        {/* RE-RUN QR PASS BUTTON */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRegenerateQR(team)}
                          disabled={isPending}
                          title="Invalidate current code and re-issue a brand new single-use QR pass"
                          className="bg-slate-50 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-700 text-xs font-sans h-8.5 px-2.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                          Re-run QR
                        </Button>

                        {/* DELETE QR PASS BUTTON */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteQRTarget(team)}
                          disabled={isPending}
                          title="Delete and permanently revoke QR pass"
                          className="bg-slate-50 border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-slate-400 text-xs font-sans h-8.5 px-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      /* If team QR has been deleted/revoked */
                      <Button
                        size="sm"
                        onClick={() => handleRegenerateQR(team)}
                        disabled={isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-sans h-8.5 px-3 flex items-center gap-1.5 shadow-2xs"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Generate QR Pass
                      </Button>
                    )}

                    {/* SEND QR TO MAIL BUTTONS (Explicit Send or No button) */}
                    <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
                      <div className="px-2 text-xs font-sans text-slate-500 flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span>Send QR to Mail:</span>
                      </div>

                      {/* Explicit "SEND" Button */}
                      <Button
                        size="sm"
                        variant={team.qr_email_sent ? "outline" : "default"}
                        onClick={() => handleToggleMail(team, true)}
                        disabled={isPending || !team.qr_token}
                        className={`text-xs h-7 px-2.5 font-sans font-medium ${
                          team.qr_email_sent
                            ? "border-emerald-300 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {team.qr_email_sent ? "✓ Sent (Resend)" : "Send"}
                      </Button>

                      {/* Explicit "NO" Button (Skip / Revoke) */}
                      <Button
                        size="sm"
                        variant={!team.qr_email_sent ? "outline" : "ghost"}
                        onClick={() => handleToggleMail(team, false)}
                        disabled={isPending}
                        className={`text-xs h-7 px-2.5 font-sans ${
                          !team.qr_email_sent
                            ? "border-amber-300 text-amber-700 bg-amber-50/50 hover:bg-amber-100"
                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        No
                      </Button>
                    </div>

                    {/* RESEND CUSTOM EMAIL COMPOSE BUTTON */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEmailModal(team)}
                      className="bg-slate-50 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 text-slate-700 text-xs font-sans h-8.5 px-2.5"
                      title="Compose custom subject, body, and attachment via Resend"
                    >
                      <Mail className="w-3.5 h-3.5 mr-1 text-blue-600" />
                      Email Pass
                    </Button>

                    {/* Expand/Collapse Roster Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                      className="text-slate-500 hover:text-slate-900 text-xs h-8.5 px-2"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded Participant Roster Table */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-sans">
                        Team Roster Details ({team.participants.length} Members)
                      </h4>
                      <span className="text-xs text-slate-400 font-mono">
                        Token: {team.qr_token || "None"}
                      </span>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs font-sans text-left">
                        <thead className="bg-slate-100/80 text-slate-600 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Participant Name</th>
                            <th className="py-2.5 px-3">Role</th>
                            <th className="py-2.5 px-3">Email Address</th>
                            <th className="py-2.5 px-3">Mobile</th>
                            <th className="py-2.5 px-3">Course / Branch</th>
                            <th className="py-2.5 px-3">Year</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {team.participants.map((p, idx) => (
                            <tr key={p.id || idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {p.full_name}
                              </td>
                              <td className="py-2.5 px-3">
                                {p.is_leader ? (
                                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                                    Team Leader
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Member</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{p.email || "-"}</td>
                              <td className="py-2.5 px-3 text-slate-600">{p.mobile_number || "-"}</td>
                              <td className="py-2.5 px-3 text-slate-600">{p.course || "-"}</td>
                              <td className="py-2.5 px-3 text-slate-600">{p.year_of_study || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination Bar for Scale (1,000+ teams) */}
        {filteredTeams.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="text-xs text-slate-500 font-sans flex items-center gap-2">
              <span>
                Showing <strong className="text-slate-800">{Math.min((page - 1) * pageSize + 1, filteredTeams.length)}</strong> to{" "}
                <strong className="text-slate-800">{Math.min(page * pageSize, filteredTeams.length)}</strong> of{" "}
                <strong className="text-slate-800">{filteredTeams.length}</strong> teams
              </span>
              {filteredTeams.length !== teams.length && (
                <span className="text-slate-400">({teams.length} total)</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Page size selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-sans">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Prev / Page / Next Controls */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 px-2 text-xs border-slate-200 text-slate-600 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                  Prev
                </Button>

                <span className="px-2.5 text-xs font-sans text-slate-600 font-medium">
                  {page} / {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 px-2 text-xs border-slate-200 text-slate-600 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* QR CODE MODAL DIALOG */}
      {selectedQRTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setSelectedQRTeam(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="inline-block px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full uppercase tracking-wider mb-2 border border-indigo-200">
                Single-Use Entry Pass
              </span>
              <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight mb-0.5">
                {selectedQRTeam.name}
              </h3>
              <p className="text-xs text-slate-500 font-sans mb-3">
                {selectedQRTeam.participants.length} Verified Participants
              </p>

              {/* Single-Use Warning Notice */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 mb-3.5 text-left flex items-start gap-2 text-[11px] text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Single-Use Security:</strong> This QR can be scanned and verified only once at the gate. Any re-entry attempt is automatically rejected.
                </div>
              </div>

              {/* Scannable QR Code Image */}
              <div className="bg-white p-3 rounded-xl border-2 border-slate-900/10 inline-block shadow-inner mb-3">
                {selectedQRTeam.qr_data_url ? (
                  <img
                    src={selectedQRTeam.qr_data_url}
                    alt={`QR Code for ${selectedQRTeam.name}`}
                    className="w-52 h-52 mx-auto object-contain"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                    Generating QR...
                  </div>
                )}
              </div>

              {/* QR Token with copy button */}
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 flex items-center justify-between text-xs font-mono text-slate-700 mb-3">
                <span className="truncate max-w-[200px]">{selectedQRTeam.qr_token}</span>
                <button
                  onClick={() => handleCopyToken(selectedQRTeam.qr_token)}
                  className="text-primary hover:text-primary/80 ml-2"
                  title="Copy Token"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Verification & Action buttons */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleDownloadQR(selectedQRTeam)}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs font-sans h-9"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download PNG
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleToggleMail(selectedQRTeam, true);
                      setSelectedQRTeam(null);
                    }}
                    className="flex-1 text-xs font-sans h-9"
                  >
                    <Mail className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                    Email to Leader
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerateQR(selectedQRTeam)}
                    disabled={isPending}
                    className="text-xs h-8 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 border-indigo-200 flex items-center justify-center gap-1 font-sans"
                    title="Invalidate and generate fresh QR"
                  >
                    <RotateCcw className="w-3 h-3 text-indigo-600" />
                    Re-run QR
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setDeleteQRTarget(selectedQRTeam)}
                    disabled={isPending}
                    className="text-xs h-8 text-red-600 bg-red-50/50 hover:bg-red-100 border-red-200 flex items-center justify-center gap-1 font-sans"
                    title="Delete and revoke QR pass"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete QR
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => router.push(`/scan?token=${encodeURIComponent(selectedQRTeam.qr_token)}`)}
                  className="text-slate-600 hover:text-slate-900 text-xs font-sans h-8"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Test in Check-in Scanner
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD TEAM MODAL DIALOG */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight">Add New Team / Registration</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Enter team and participant details. QR pass will be created and saved to the server immediately.
              </p>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Team Name *</label>
                <Input
                  required
                  placeholder="e.g. Delta Force Gaming"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="text-sm h-9"
                />
              </div>

              {/* Leader Details */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                  Team Leader Information
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Leader Full Name *</label>
                    <Input
                      required
                      placeholder="e.g. John Doe"
                      value={leaderName}
                      onChange={(e) => setLeaderName(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Leader Email *</label>
                    <Input
                      required
                      type="email"
                      placeholder="john.doe@college.edu"
                      value={leaderEmail}
                      onChange={(e) => setLeaderEmail(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Mobile Phone</label>
                    <Input
                      placeholder="+1 (555) 000-0000"
                      value={leaderPhone}
                      onChange={(e) => setLeaderPhone(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Course / Major</label>
                    <Input
                      placeholder="e.g. Computer Science"
                      value={leaderCourse}
                      onChange={(e) => setLeaderCourse(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Year of Study</label>
                    <Input
                      placeholder="e.g. 3rd Year"
                      value={leaderYear}
                      onChange={(e) => setLeaderYear(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Extra Team Members */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Additional Team Members ({extraMembers.length})
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExtraMembers([
                        ...extraMembers,
                        { name: "", email: "", course: leaderCourse, year: leaderYear },
                      ])
                    }
                    className="text-xs h-7 px-2"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Member
                  </Button>
                </div>

                {extraMembers.map((mem, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <Input
                      placeholder={`Member ${i + 2} Name`}
                      value={mem.name}
                      onChange={(e) => {
                        const updated = [...extraMembers];
                        updated[i].name = e.target.value;
                        setExtraMembers(updated);
                      }}
                      className="text-xs h-7.5 bg-white flex-1"
                    />
                    <Input
                      placeholder="Email"
                      value={mem.email}
                      onChange={(e) => {
                        const updated = [...extraMembers];
                        updated[i].email = e.target.value;
                        setExtraMembers(updated);
                      }}
                      className="text-xs h-7.5 bg-white flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setExtraMembers(extraMembers.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white text-xs h-9 font-medium shadow-sm"
                >
                  {isPending ? "Creating & Generating QR..." : "Save Team & Generate QR"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE QR PASS CONFIRMATION MODAL */}
      {deleteQRTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-red-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setDeleteQRTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-base font-sans font-bold text-slate-900 tracking-tight">Delete QR Pass</h3>
                <p className="text-[11px] text-slate-500 font-sans">Invalidate team entry credentials</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 my-3 text-xs text-red-800 font-sans space-y-1">
              <p>
                Delete QR entry pass for <strong>{deleteQRTarget.name}</strong>?
              </p>
              <p className="text-[11px] text-red-700">
                The current QR code will be immediately revoked and cannot be scanned at the venue gate. You can re-run and generate a new one at any time.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 font-sans">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteQRTarget(null)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteQR}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-8"
              >
                {isPending ? "Deleting..." : "Confirm Delete QR"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH RE-RUN ALL QRS MODAL */}
      {batchRegenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-indigo-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setBatchRegenerateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-base font-sans font-bold text-slate-900 tracking-tight">Re-run All QR Passes</h3>
                <p className="text-[11px] text-slate-500 font-sans">Batch re-generation for all teams</p>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 my-3 text-xs text-indigo-900 font-sans space-y-1">
              <p>
                Re-generate fresh single-use QR passes for all <strong>{teams.length} teams</strong> in this event?
              </p>
              <p className="text-[11px] text-indigo-700">
                All previously distributed QR passes will be immediately invalidated and replaced with fresh cryptographic single-use passes.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 font-sans">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchRegenerateModalOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBatchRegenerateQRs}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-8"
              >
                {isPending ? "Generating..." : "Re-run All QRs"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING STICKY BATCH ACTIONS DOCK (WHEN TEAMS ARE SELECTED) */}
      {/* FLOATING STICKY BATCH ACTIONS DOCK (WHEN TEAMS ARE SELECTED) */}
      {selectedTeamIds.length > 0 && (
        <div className="dark fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center font-mono">
              {selectedTeamIds.length}
            </span>
            <span className="text-xs font-medium font-sans">
              {selectedTeamIds.length === 1
                ? "team selected"
                : `${selectedTeamIds.length} of ${teams.length} teams selected`}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <button
            type="button"
            onClick={() => setSelectedTeamIds([])}
            className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs h-8 px-2.5 font-sans transition-colors cursor-pointer"
          >
            Clear Selection
          </button>

          <Button
            size="sm"
            onClick={handleBulkCheckIn}
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold font-sans h-8 flex items-center gap-1.5 shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Check In Selected ({selectedTeamIds.length})
          </Button>

          <Button
            size="sm"
            onClick={handleBulkExtendExpiry}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold font-sans h-8 flex items-center gap-1.5 shadow-sm"
          >
            <Clock className="w-3.5 h-3.5" />
            Extend Expiry (+24h)
          </Button>

          <Button
            size="sm"
            onClick={() => setBulkDeleteModalOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold font-sans h-8 flex items-center gap-1.5 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete ({selectedTeamIds.length})
          </Button>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 relative animate-in fade-in zoom-in-95 font-sans">
            <button
              onClick={() => setBulkDeleteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-sans font-bold text-slate-900 tracking-tight">Bulk Delete Teams</h3>
                <p className="text-xs text-slate-500">Permanent action across {selectedTeamIds.length} selected teams</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200/80 rounded-xl p-3.5 my-4 space-y-2 text-xs text-red-800">
              <p>
                Are you sure you want to permanently delete <strong>{selectedTeamIds.length} teams</strong>?
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-red-700">
                <li>All team member rosters and contact info will be removed.</li>
                <li>All issued cryptographic QR passes will be wiped and cannot be scanned.</li>
                <li>This action is irreversible.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkDelete}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isPending ? "Deleting Teams..." : `Confirm Delete (${selectedTeamIds.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RESEND CUSTOM EMAIL COMPOSE MODAL */}
      {emailModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto font-sans">
            <button
              onClick={() => setEmailModalTeam(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-sans font-bold text-slate-900 tracking-tight">
                  Email Pass via Resend
                </h3>
                <p className="text-xs text-slate-500">
                  Dispatching to Captain of <strong>{emailModalTeam.name}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Recipient meta */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Team:</span>
                  <span className="font-semibold text-slate-800">{emailModalTeam.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Captain:</span>
                  <span className="font-medium text-slate-800">
                    {emailModalTeam.participants.find((p) => p.is_leader)?.full_name || emailModalTeam.participants[0]?.full_name || "Captain"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Email:</span>
                  <span className="font-mono text-blue-600 font-semibold">
                    {emailModalTeam.participants.find((p) => p.is_leader)?.email || emailModalTeam.participants[0]?.email || "No email"}
                  </span>
                </div>
              </div>

              {/* Custom Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Subject Line *
                </label>
                <Input
                  value={customEmailSubject}
                  onChange={(e) => setCustomEmailSubject(e.target.value)}
                  className="text-xs h-9 bg-white"
                  placeholder="Enter custom email subject..."
                />
              </div>

              {/* Custom Body */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Email Body / Instructions *
                </label>
                <textarea
                  rows={5}
                  value={customEmailBody}
                  onChange={(e) => setCustomEmailBody(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white font-sans focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                  placeholder="Write custom instructions or message to the team captain..."
                />
              </div>

              {/* Attachment toggle & preview */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeQrAttachment}
                    onChange={(e) => setIncludeQrAttachment(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-600" />
                    Include Single-Use QR Pass as File Attachment (.png)
                  </span>
                </label>

                {includeQrAttachment && emailModalTeam.qr_data_url && (
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-200/60">
                    <img
                      src={emailModalTeam.qr_data_url}
                      alt="QR Attachment Preview"
                      className="w-12 h-12 bg-white p-1 rounded-lg border border-slate-300 object-contain shadow-xs"
                    />
                    <div className="text-[11px] text-slate-500 font-mono">
                      <div>{emailModalTeam.name.replace(/\s+/g, "_")}_Entry_Pass.png</div>
                      <div className="text-slate-400">Cryptographic PNG Image Attachment</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEmailModalTeam(null)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendCustomEmail}
                  disabled={isSendingCustomEmail}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 shadow-sm flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSendingCustomEmail ? "Dispatching via Resend..." : "Send Custom Email (Resend)"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
