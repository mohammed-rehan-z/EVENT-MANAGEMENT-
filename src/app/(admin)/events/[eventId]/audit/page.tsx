"use client";

import { useEffect, useState, useTransition, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchEventAuditLogsAction,
  clearEventAuditLogsAction,
  resetTeamCheckInAction,
} from "@/app/actions/qrActions";
import { AuditLog } from "@/lib/dataStore";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  Activity,
  Layers,
  ChevronRight,
  ExternalLink,
  Lock,
  Flame,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

export default function SecurityAuditPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <Suspense fallback={<AuditSkeleton />}>
        <AuditContent />
      </Suspense>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl p-4" />
        ))}
      </div>
      <div className="h-16 bg-white border border-slate-200 rounded-xl" />
      <div className="h-96 bg-white border border-slate-200 rounded-xl" />
    </div>
  );
}

function AuditContent() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "ev-1";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [selectedAction, setSelectedAction] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Reset Check-in Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTeamId, setResetTeamId] = useState("");
  const [resetTeamName, setResetTeamName] = useState("");
  const [resetReason, setResetReason] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetchEventAuditLogsAction(eventId, {
        severity: selectedSeverity,
        action: selectedAction,
        search,
        limit: 150,
      });
      if (res.success) {
        setLogs(res.logs || []);
      } else {
        toast.error("Failed to load audit logs: " + res.message);
      }
    } catch (err: any) {
      toast.error("Error loading security audit: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [eventId, selectedSeverity, selectedAction]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.info("No audit logs available to export.");
      return;
    }
    const headers = ["Timestamp", "Severity", "Action", "Actor Role", "Actor ID", "Target Team", "Details"];
    const rows = logs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.severity}"`,
      `"${l.action}"`,
      `"${l.actor_role}"`,
      `"${l.actor_id}"`,
      `"${l.target_name || l.target_id || "-"}"`,
      `"${JSON.stringify(l.details).replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `security-audit-trail-${eventId}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Security audit trail exported to CSV.");
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to purge all security logs for this event? This action will be audited.")) return;
    startTransition(async () => {
      const res = await clearEventAuditLogsAction(eventId);
      if (res.success) {
        toast.success("Audit trail cleared.");
        loadLogs();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetReason.trim()) {
      toast.error("An administrative justification note is mandatory for security audit integrity.");
      return;
    }

    startTransition(async () => {
      const res = await resetTeamCheckInAction(resetTeamId, resetReason.trim());
      if (res.success) {
        toast.success(res.message);
        setResetModalOpen(false);
        setResetReason("");
        loadLogs();
      } else {
        toast.error(res.message);
      }
    });
  };

  // Metrics
  const criticalCount = logs.filter((l) => l.severity === "CRITICAL").length;
  const warningCount = logs.filter((l) => l.severity === "WARNING").length;
  const duplicateBlocks = logs.filter((l) => l.action === "CHECK_IN_DUPLICATE_ATTEMPT").length;
  const otpLockouts = logs.filter((l) => l.action === "OTP_LOCKOUT").length;
  const expiredBlocks = logs.filter((l) => l.action === "CHECK_IN_EXPIRED_ATTEMPT").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Security Audit Trail</h1>
              <p className="text-sm text-slate-500">
                Cryptographic token verification, single-use violations, rate-limiting, and tamper telemetry.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 text-slate-700">
            <Download className="w-4 h-4" />
            Export Audit Trail (CSV)
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearLogs}
            disabled={isPending}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Clear Logs
          </Button>
        </div>
      </div>

      {/* Security Threat Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-rose-200 bg-rose-50/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-rose-800 uppercase tracking-wider font-mono">
              Single-Use Duplicates
            </CardTitle>
            <Flame className="w-4 h-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">{duplicateBlocks}</div>
            <p className="text-xs text-rose-600/80 mt-1 font-medium">Secondary scan re-entry attempts blocked</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-amber-800 uppercase tracking-wider font-mono">
              Expired QR Passes
            </CardTitle>
            <Clock className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{expiredBlocks}</div>
            <p className="text-xs text-amber-600/80 mt-1 font-medium">Scans past validity threshold rejected</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-purple-800 uppercase tracking-wider font-mono">
              OTP Brute-Force Lockouts
            </CardTitle>
            <Lock className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{otpLockouts}</div>
            <p className="text-xs text-purple-600/80 mt-1 font-medium">Teams locked out after 4 incorrect attempts</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
              Security Level Status
            </CardTitle>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xl font-bold text-slate-800">
                {criticalCount === 0 ? "SECURE" : `${criticalCount} ALERTS`}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">HMAC signatures verified live</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search by team, volunteer ID, action, or failure reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 font-medium"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Alerts Only</option>
              <option value="WARNING">Warnings Only</option>
              <option value="INFO">Informational Events</option>
            </select>

            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 font-medium"
            >
              <option value="ALL">All Action Types</option>
              <option value="CHECK_IN_DUPLICATE_ATTEMPT">Duplicate Scans (Single-Use Violations)</option>
              <option value="CHECK_IN_EXPIRED_ATTEMPT">Expired Pass Attempts</option>
              <option value="CHECK_IN_TAMPER_ATTEMPT">Cryptographic Signature Violations</option>
              <option value="CHECK_IN_SUCCESS">Successful Check-Ins</option>
              <option value="OTP_LOCKOUT">OTP Brute Force Lockouts</option>
              <option value="OTP_MATCH_FAILURE">OTP Matching Mismatches</option>
              <option value="OTP_MATCH_SUCCESS">OTP Gate Verifications</option>
              <option value="BULK_IMPORT">Bulk Registration Imports</option>
              <option value="BULK_APPROVE">Bulk Approvals</option>
              <option value="CHECK_IN_RESET">Admin Check-in Resets</option>
            </select>

            <Button type="submit" size="sm" variant="secondary" className="gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5" />
              Apply
            </Button>
          </div>
        </form>
      </Card>

      {/* Log Feed Table */}
      <Card className="border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-44 text-xs font-mono">Timestamp</TableHead>
                <TableHead className="w-28 text-xs">Severity</TableHead>
                <TableHead className="text-xs">Security Event / Action</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Target Team</TableHead>
                <TableHead className="text-xs">Technical Details & Telemetry</TableHead>
                <TableHead className="w-24 text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-300" />
                    Loading encrypted security audit trail...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    No security violations or audit events found matching the active criteria.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const dateObj = new Date(log.timestamp);
                  const formattedTime = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  const formattedDate = dateObj.toLocaleDateString([], { month: "short", day: "numeric" });

                  return (
                    <TableRow
                      key={log.id}
                      className={
                        log.severity === "CRITICAL"
                          ? "bg-rose-50/30 hover:bg-rose-50/60"
                          : log.severity === "WARNING"
                          ? "bg-amber-50/30 hover:bg-amber-50/60"
                          : "hover:bg-slate-50/60"
                      }
                    >
                      <TableCell className="font-mono text-xs text-slate-600">
                        <div>{formattedDate}</div>
                        <div className="text-[11px] text-slate-400">{formattedTime}</div>
                      </TableCell>

                      <TableCell>
                        {log.severity === "CRITICAL" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            CRITICAL
                          </span>
                        ) : log.severity === "WARNING" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            WARNING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                            <CheckCircle2 className="w-3 h-3 text-slate-500" />
                            INFO
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="font-medium text-xs text-slate-900">
                        <div className="font-mono text-[11px] text-slate-800">{log.action}</div>
                      </TableCell>

                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {log.actor_role}: {log.actor_id}
                        </span>
                      </TableCell>

                      <TableCell className="text-xs font-semibold text-slate-800">
                        {log.target_name ? (
                          <div>
                            <div>{log.target_name}</div>
                            {log.target_id && <div className="text-[10px] font-mono text-slate-400">{log.target_id}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">-</span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-slate-600 max-w-md">
                        <pre className="text-[11px] font-mono bg-slate-100/70 p-1.5 rounded border border-slate-200/80 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.details, null, 1)}
                        </pre>
                      </TableCell>

                      <TableCell className="text-right">
                        {log.target_id && (log.action === "CHECK_IN_DUPLICATE_ATTEMPT" || log.action === "CHECK_IN_SUCCESS") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setResetTeamId(log.target_id!);
                              setResetTeamName(log.target_name || log.target_id!);
                              setResetModalOpen(true);
                            }}
                            className="h-7 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-100/80 gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset Status
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Administrative Check-in Reset Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Administrative Check-in Reset</h3>
                <p className="text-xs text-slate-500">Target Team: {resetTeamName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              Resetting will clear the single-use consumption lock and return the team to <strong>NOT_CHECKED_IN</strong>. This action requires a security justification note and will be recorded permanently in the audit trail.
            </p>

            <form onSubmit={handleExecuteReset} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Security Justification / Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="e.g., Accidental duplicate scan at Gate 2; verified physical badges of all 4 members."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setResetModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !resetReason.trim()}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                >
                  Confirm & Audit Reset
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
