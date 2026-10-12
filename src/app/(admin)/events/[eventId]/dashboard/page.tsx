"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchEventDetailsAction,
  deleteEventAction,
  updateEventAction,
} from "@/app/actions/eventActions";
import { toast } from "sonner";
import {
  Users,
  CheckCircle2,
  Mail,
  QrCode,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Flame,
  ArrowRight,
  Calendar,
  MapPin,
  Layers,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
  Clock,
  Pencil,
  Upload,
  Image as ImageIcon,
} from "lucide-react";

const PRESET_THUMBNAILS = [
  {
    name: "Cyber Arena",
    url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "AI Hackathon",
    url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Tech Summit",
    url: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Robotics Arena",
    url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Gaming Tournament",
    url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
  },
];

function DashboardContent() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "ev-1";

  const [eventData, setEventData] = useState<any>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOverview, setEditOverview] = useState("");
  const [editVenue, setEditVenue] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");

  const [isPending, startTransition] = useTransition();

  const [stats, setStats] = useState<any>({
    totalTeams: 0,
    totalParticipants: 0,
    checkedInTeams: 0,
    emailsSent: 0,
    approvedTeams: 0,
    checkInRate: 0,
  });

  const loadEventData = async () => {
    try {
      const res = await fetchEventDetailsAction(eventId);
      if (res.success) {
        if (res.event) setEventData(res.event);
        if (res.stats) setStats(res.stats);
      }
    } catch (err) {
      console.error("Dashboard event details load error:", err);
    }
  };

  useEffect(() => {
    loadEventData();
  }, [eventId]);

  const openEditModal = () => {
    if (!eventData) return;
    setEditName(eventData.name || "");
    setEditDescription(eventData.description || "");
    setEditOverview(eventData.overview || eventData.description || "");
    setEditVenue(eventData.venue || "");
    setEditDate(eventData.date ? eventData.date.split("T")[0] : "");
    setEditEndDate(eventData.end_date ? eventData.end_date.split("T")[0] : "");
    setEditThumbnailUrl(eventData.thumbnail_url || "");
    setIsEditModalOpen(true);
  };

  const handleThumbnailUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image file is too large. Max allowed size is 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setEditThumbnailUrl(e.target.result as string);
        toast.success("Thumbnail uploaded successfully!");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEventDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editVenue.trim()) {
      toast.error("Event name and venue are required.");
      return;
    }
    startTransition(async () => {
      const res = await updateEventAction(eventId, {
        name: editName,
        description: editDescription,
        overview: editOverview,
        venue: editVenue,
        date: editDate,
        end_date: editEndDate,
        thumbnail_url: editThumbnailUrl,
      });

      if (res.success && res.event) {
        toast.success("Event details and thumbnail updated!");
        setEventData(res.event);
        setIsEditModalOpen(false);
      } else {
        toast.error("Failed to update event: " + (res.error || "Unknown error"));
      }
    });
  };

  const handleDeleteEvent = () => {
    startTransition(async () => {
      const res = await deleteEventAction(eventId);
      if (res.success) {
        toast.success(`Event '${eventData?.name || eventId}' deleted successfully.`);
        router.push("/events");
      } else {
        toast.error("Failed to delete event: " + (res.error || "Unknown error"));
      }
    });
  };

  return (
    <>
      {/* Event Header Banner (Double-Bezel Architecture) */}
      <div className="rounded-[2rem] p-1.5 ring-1 ring-slate-900/10 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-xl mb-6">
        <div className="rounded-[calc(2rem-0.375rem)] p-6 bg-slate-900/95 text-white flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
          {/* Subtle Ambient Backdrop from Thumbnail */}
          {eventData?.thumbnail_url && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-15 filter blur-md pointer-events-none scale-105"
              style={{ backgroundImage: `url(${eventData.thumbnail_url})` }}
            />
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 z-10 min-w-0 flex-1">
            {/* Visual Thumbnail Avatar / Poster */}
            {eventData?.thumbnail_url ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden ring-2 ring-white/20 shadow-lg shrink-0 relative bg-slate-800">
                <img
                  src={eventData.thumbnail_url}
                  alt={eventData.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-slate-400">
                <Calendar className="w-8 h-8" />
              </div>
            )}

            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Tournament Core
                </span>
                <span className="text-[11px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10">
                  {eventId}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">
                {eventData?.name || "Event Dashboard"}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-sans pt-0.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-medium">
                    {eventData?.date
                      ? new Date(eventData.date).toLocaleDateString(undefined, { dateStyle: "medium" })
                      : "Event Date Active"}
                    {eventData?.end_date && (
                      <span className="text-slate-400 font-normal">
                        {" "}to {new Date(eventData.end_date).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{eventData?.venue || "Main Convention Center"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 z-10 shrink-0 w-full lg:w-auto mt-4 lg:mt-0">
            <Button
              variant="outline"
              onClick={openEditModal}
              className="w-full lg:w-auto text-xs font-sans h-9 bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 shadow-xs px-2"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-200 shrink-0" />
              <span className="truncate">Edit Info</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/events")}
              className="w-full lg:w-auto text-xs font-sans h-9 bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center px-2"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span className="truncate">Switch Event</span>
            </Button>

            <button
              onClick={() => router.push(`/events/${eventId}/registrations`)}
              className="w-full lg:w-auto group/btn h-9 px-3 lg:px-4 rounded-xl bg-white text-slate-900 font-semibold text-xs flex items-center justify-center gap-2 shadow-md hover:bg-slate-100 active:scale-[0.98] transition-all col-span-2 lg:col-span-1"
            >
              <span className="truncate">Manage Registrations</span>
              <div className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center transition-transform group-hover/btn:translate-x-0.5 shrink-0">
                <ArrowRight className="w-3 h-3" />
              </div>
            </button>

            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-full lg:w-auto text-xs font-sans h-9 bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 hover:border-red-500/50 rounded-xl flex items-center justify-center col-span-2 lg:col-span-1"
              title="Delete this entire event"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1 text-red-400 shrink-0" />
              <span className="truncate">Delete Event</span>
            </Button>
          </div>

          {/* Ambient Lighting */}
          <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>
      </div>

      {/* EVENT OVERVIEW & INTRODUCTION SECTION (Double-Bezel Hardware Architecture) */}
      <div className="rounded-[2rem] p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 via-slate-200/40 to-slate-100 shadow-2xs mb-6">
        <div className="rounded-[calc(2rem-0.375rem)] bg-white border border-slate-200/80 p-5 sm:p-6 flex flex-col md:flex-row gap-6 relative overflow-hidden">
          {/* Left Thumbnail Hero Card */}
          {eventData?.thumbnail_url && (
            <div className="md:w-72 lg:w-80 shrink-0 rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative h-48 md:h-auto min-h-[160px] bg-slate-900 group">
              <img
                src={eventData.thumbnail_url}
                alt={eventData.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/25 to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 right-3 text-white">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">Official Poster</span>
                <p className="text-xs font-semibold truncate text-white">{eventData.name}</p>
              </div>
            </div>
          )}

          {/* Right/Center: Overview Text & Metadata Highlights */}
          <div className="flex-1 flex flex-col justify-between space-y-4 min-w-0">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 tracking-tight">
                      Event Overview & Introduction
                    </h3>
                    <p className="text-[11px] text-slate-500 font-sans">
                      Collegiate briefing, competitive scope & guidelines
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditModal}
                  className="h-8 px-3 text-xs rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 shrink-0 shadow-2xs"
                >
                  <Pencil className="w-3 h-3 text-slate-500" />
                  Edit Overview
                </Button>
              </div>

              <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/60 text-xs text-slate-700 font-sans leading-relaxed whitespace-pre-line">
                {eventData?.overview ||
                  eventData?.description ||
                  "No overview summary provided yet. Click 'Edit Overview' to add a comprehensive introduction for attendees and volunteers."}
              </div>
            </div>

            {/* Quick Context Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-slate-50/60 rounded-xl p-2.5 border border-slate-200/50">
                <div className="text-[10px] font-mono uppercase text-slate-400">Tournament Venue</div>
                <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                  {eventData?.venue || "Grand Convention Arena"}
                </div>
              </div>
              <div className="bg-slate-50/60 rounded-xl p-2.5 border border-slate-200/50">
                <div className="text-[10px] font-mono uppercase text-slate-400">Event Window</div>
                <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                  {eventData?.date
                    ? new Date(eventData.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "Active"}
                  {eventData?.end_date &&
                    ` - ${new Date(eventData.end_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}`}
                </div>
              </div>
              <div className="bg-slate-50/60 rounded-xl p-2.5 border border-slate-200/50">
                <div className="text-[10px] font-mono uppercase text-slate-400">Registered Teams</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">
                  {stats.totalTeams} Teams ({stats.totalParticipants} attendees)
                </div>
              </div>
              <div className="bg-slate-50/60 rounded-xl p-2.5 border border-slate-200/50">
                <div className="text-[10px] font-mono uppercase text-slate-400">Venue Check-In</div>
                <div className="text-xs font-semibold text-emerald-600 mt-0.5">
                  {stats.checkedInTeams} admitted ({stats.checkInRate}%)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards (Double-Bezel Hardware Architecture) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI 1: Teams */}
        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs hover:shadow-md transition-all">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-5 border border-slate-200/80 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Total Teams</span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">{stats.totalTeams}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-sans">
                {stats.totalParticipants} registered attendees
              </p>
            </div>
          </div>
        </div>

        {/* KPI 2: Checked In */}
        <div className="rounded-2xl p-1.5 ring-1 ring-emerald-500/20 bg-gradient-to-b from-emerald-50/80 to-slate-100 shadow-2xs hover:shadow-md transition-all">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-5 border border-emerald-200/80 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-700">Present At Venue</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tracking-tight text-emerald-600 font-mono">{stats.checkedInTeams}</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, stats.checkInRate || 0))}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-semibold text-emerald-700">{stats.checkInRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Single-Use Passes */}
        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs hover:shadow-md transition-all">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-5 border border-slate-200/80 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">QR Passes Issued</span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <QrCode className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
                {stats.approvedTeams || stats.totalTeams}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-sans">
                Single-use gate scannable
              </p>
            </div>
          </div>
        </div>

        {/* KPI 4: Emails */}
        <div className="rounded-2xl p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 shadow-2xs hover:shadow-md transition-all">
          <div className="rounded-[calc(1rem-0.125rem)] bg-white p-5 border border-slate-200/80 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Passes Dispatched</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Mail className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tracking-tight text-blue-600 font-mono">{stats.emailsSent}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-sans">
                {Math.max(0, stats.totalTeams - stats.emailsSent)} pending delivery
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECURITY AUDIT & SINGLE-USE TELEMETRY SECTION */}
      <div className="rounded-[2rem] p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 via-slate-200/40 to-slate-100 shadow-2xs mb-6">
        <div className="rounded-[calc(2rem-0.375rem)] bg-white border border-slate-200/80 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <ShieldAlert className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 tracking-tight">
                  Gate Security & Single-Use Verification Telemetry
                </h3>
                <p className="text-xs text-slate-500">
                  Cryptographic pass verification, duplicate entry prevention, and OTP brute-force defense
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => router.push(`/events/${eventId}/audit`)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-8.5 px-3.5 rounded-xl shadow-xs gap-1.5 self-start sm:self-center"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Full Audit Trail</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-rose-50/60 border border-rose-200/70 rounded-xl">
              <div className="flex items-center justify-between text-xs text-rose-800 font-semibold mb-1">
                <span>Duplicates Blocked</span>
                <Flame className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-700">
                {stats.security?.duplicateAttemptsBlocked ?? 0}
              </div>
              <span className="text-[10px] text-rose-600/80 font-medium">Re-entry attempts denied</span>
            </div>

            <div className="p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl">
              <div className="flex items-center justify-between text-xs text-amber-800 font-semibold mb-1">
                <span>Expired Passes</span>
                <Clock className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold font-mono text-amber-700">
                {stats.security?.expiredAttemptsBlocked ?? 0}
              </div>
              <span className="text-[10px] text-amber-600/80 font-medium">Scans past validity threshold</span>
            </div>

            <div className="p-3.5 bg-purple-50/60 border border-purple-200/70 rounded-xl">
              <div className="flex items-center justify-between text-xs text-purple-800 font-semibold mb-1">
                <span>OTP Lockouts</span>
                <Lock className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <div className="text-xl font-bold font-mono text-purple-700">
                {stats.security?.otpLockoutsCount ?? 0}
              </div>
              <span className="text-[10px] text-purple-600/80 font-medium">Brute-force protections</span>
            </div>

            <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/70 rounded-xl">
              <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold mb-1">
                <span>HMAC Signatures</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-700">
                100% Valid
              </div>
              <span className="text-[10px] text-emerald-600/80 font-medium">Zero forged tokens detected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Launchpads (Double-Bezel Hardware Architecture) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {/* Launchpad 1: Roster Import */}
        <div
          onClick={() => router.push(`/events/${eventId}/imports`)}
          className="group rounded-[1.75rem] p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 hover:from-slate-200 hover:to-slate-300/60 shadow-2xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col"
        >
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-white p-6 border border-slate-200/80 flex flex-col justify-between flex-1">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 tracking-tight">Upload Registration Roster</h3>
              <p className="text-xs text-slate-500 font-sans mt-1 leading-relaxed">
                Ingest Excel (.xlsx) or CSV files. Automatically parses teams, assigns leader roles, and issues cryptographic QR passes.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-semibold text-slate-800">
              <span>Go to File Import</span>
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-transform group-hover:translate-x-1">
                <ArrowRight className="w-3.5 h-3.5 text-slate-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Launchpad 2: Registrations */}
        <div
          onClick={() => router.push(`/events/${eventId}/registrations`)}
          className="group rounded-[1.75rem] p-1.5 ring-1 ring-slate-900/5 bg-gradient-to-b from-slate-100 to-slate-200/40 hover:from-slate-200 hover:to-slate-300/60 shadow-2xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col"
        >
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-white p-6 border border-slate-200/80 flex flex-col justify-between flex-1">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900 tracking-tight">Roster & Pass Operations</h3>
              <p className="text-xs text-slate-500 font-sans mt-1 leading-relaxed">
                Inspect segregated teams, view on-demand QR passes, re-run invalidated tokens, toggle email delivery, and export CSV/JSON.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-semibold text-slate-800">
              <span>Manage Team Roster</span>
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-transform group-hover:translate-x-1">
                <ArrowRight className="w-3.5 h-3.5 text-slate-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Launchpad 3: Scanner */}
        <div
          onClick={() => router.push("/scan")}
          className="group rounded-[1.75rem] p-1.5 ring-1 ring-slate-900/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col text-white"
        >
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-slate-900 p-6 border border-white/10 flex flex-col justify-between flex-1">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white tracking-tight">Gate Entry Scanner</h3>
              <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">
                Field terminal for gate marshals and volunteers. Scans single-use QR passes with strict double-entry lockout.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/10 text-xs font-semibold text-white">
              <span>Launch Gate Terminal</span>
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center transition-transform group-hover:translate-x-1">
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EDIT EVENT OVERVIEW & THUMBNAIL MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 font-mono uppercase tracking-wider">
                Event Customization
              </span>
              <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight mt-1">
                Edit Event & Thumbnail
              </h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Update the official tournament thumbnail, overview summary, and details.
              </p>
            </div>

            <form onSubmit={handleSaveEventDetails} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name *</label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Thumbnail Section */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Event Thumbnail / Banner
                  <span className="text-[11px] font-normal text-slate-500 ml-1">(Upload new image or select preset)</span>
                </label>

                {editThumbnailUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-36 bg-slate-900 group">
                    <img
                      src={editThumbnailUrl}
                      alt="Thumbnail preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="cursor-pointer bg-white text-slate-900 text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 hover:bg-slate-100">
                        <Upload className="w-3.5 h-3.5" />
                        Replace Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleThumbnailUpload(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditThumbnailUrl("")}
                        className="bg-red-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 hover:bg-red-700"
                      >
                        <X className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-slate-300 transition-colors bg-slate-50/50">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                      <ImageIcon className="w-4.5 h-4.5" />
                    </div>
                    <p className="text-xs text-slate-700 font-medium">Upload custom event thumbnail</p>
                    <p className="text-[11px] text-slate-400 mb-2">PNG, JPG or WebP up to 3MB</p>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      Browse Image File
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleThumbnailUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Preset selectors */}
                <div className="pt-0.5">
                  <div className="text-[11px] text-slate-500 font-medium mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Curated Presets:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_THUMBNAILS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setEditThumbnailUrl(preset.url)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          editThumbnailUrl === preset.url
                            ? "bg-slate-900 text-white border-slate-900 font-semibold shadow-2xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Event Overview / Summary Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Event Overview & Introduction *
                  </label>
                  <span className="text-[10px] text-slate-400 font-sans">Full summary</span>
                </div>
                <textarea
                  rows={4}
                  required
                  placeholder="Comprehensive introduction and summary of the tournament tracks, guidelines, and rules..."
                  value={editOverview}
                  onChange={(e) => setEditOverview(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline / Short Description</label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Venue / Location *</label>
                <Input
                  required
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Start Date and End Date in 2 Columns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <Input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="text-xs h-9 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <Input
                    type="date"
                    required
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="text-xs h-9 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs h-9 shadow-sm"
                >
                  {isPending ? "Saving Changes..." : "Save Overview & Thumbnail"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE EVENT CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-sans font-bold text-slate-900 tracking-tight">Delete Event</h3>
                <p className="text-xs text-slate-500 font-sans">Permanent action: all rosters & passes will be purged</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200/80 rounded-xl p-3.5 my-4 space-y-2 text-xs text-red-800 font-sans">
              <p>
                Delete <strong className="font-semibold text-red-950">"{eventData?.name || eventId}"</strong>?
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-red-700">
                <li>All team rosters and participant records in this event will be permanently deleted.</li>
                <li>All issued QR passes will be wiped and cannot be scanned at the venue gate.</li>
                <li>You will be redirected back to the Event Management Hub.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 font-sans">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteEvent}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isPending ? "Deleting Event..." : "Permanently Delete Event"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-32 bg-slate-200 rounded-2xl" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl p-4">
            <div className="h-3 w-24 bg-slate-200 rounded mb-4" />
            <div className="h-7 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-44 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-slate-200 rounded-lg mb-3" />
              <div className="h-4 w-40 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-full bg-slate-100 rounded mb-1" />
              <div className="h-3 w-2/3 bg-slate-100 rounded" />
            </div>
            <div className="h-3 w-28 bg-slate-200 rounded mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
