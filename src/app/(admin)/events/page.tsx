"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchEventsWithStatsAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  EventWithStats,
} from "@/app/actions/eventActions";
import { logoutAction, getSessionUserAction } from "@/app/actions/authActions";
import { UserAccount } from "@/lib/services/authService";
import {
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  Plus,
  ArrowRight,
  QrCode,
  LogOut,
  RefreshCw,
  Sparkles,
  X,
  FileSpreadsheet,
  Shield,
  Trash2,
  AlertTriangle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Upload,
  Image as ImageIcon,
  MoreVertical,
  ExternalLink,
} from "lucide-react";

// Curated high-resolution presets for rapid event creation
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

export default function EventsSelectionPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserAccount | null>(null);

  // Create Event Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [overview, setOverview] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  // Edit Event Modal state
  const [editTarget, setEditTarget] = useState<EventWithStats | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOverview, setEditOverview] = useState("");
  const [editVenue, setEditVenue] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");

  // Delete Event Modal state
  const [deleteEventTarget, setDeleteEventTarget] = useState<EventWithStats | null>(null);

  // Three-dots menu state for individual events
  const [activeMenuEventId, setActiveMenuEventId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  // Search, Filter & Pagination for 100+ Events Scale
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "UPCOMING" | "CONCLUDED">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 9;

  const [isPending, startTransition] = useTransition();

  const loadEvents = async () => {
    setLoading(true);
    try {
      const [eventsRes, userRes] = await Promise.all([
        fetchEventsWithStatsAction(),
        getSessionUserAction(),
      ]);

      if (!userRes) {
        router.replace("/");
        return;
      }
      if (userRes.role !== "ADMIN") {
        router.replace("/scan");
        return;
      }

      setUser(userRes);

      if (eventsRes.success) {
        setEvents(eventsRes.events);
      }
    } catch (err: any) {
      toast.error("Error loading events: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleThumbnailUpload = (file: File, setter: (url: string) => void) => {
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
        setter(e.target.result as string);
        toast.success("Thumbnail uploaded successfully!");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !venue.trim()) {
      toast.error("Please provide Event Name and Venue.");
      return;
    }

    if (date && endDate && new Date(endDate) < new Date(date)) {
      toast.error("Event End Date cannot be earlier than Start Date.");
      return;
    }

    startTransition(async () => {
      const res = await createEventAction(
        name,
        description,
        venue,
        date,
        endDate,
        thumbnailUrl,
        overview
      );
      if (res.success && res.event) {
        toast.success(`Event '${name}' created successfully!`);
        setIsCreateModalOpen(false);
        setName("");
        setDescription("");
        setOverview("");
        setVenue("");
        setDate("");
        setEndDate("");
        setThumbnailUrl("");
        loadEvents();
        // Redirect into the new event's dashboard
        router.push(`/events/${res.event.id}/dashboard`);
      } else {
        toast.error("Failed to create event: " + (res.error || "Unknown error"));
      }
    });
  };

  const openEditModal = (ev: EventWithStats) => {
    setEditTarget(ev);
    setEditName(ev.name);
    setEditDescription(ev.description || "");
    setEditOverview(ev.overview || ev.description || "");
    setEditVenue(ev.venue || "");
    setEditDate(ev.date ? ev.date.split("T")[0] : "");
    setEditEndDate(ev.end_date ? ev.end_date.split("T")[0] : "");
    setEditThumbnailUrl(ev.thumbnail_url || "");
  };

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || !editVenue.trim()) {
      toast.error("Please provide Event Name and Venue.");
      return;
    }

    if (editDate && editEndDate && new Date(editEndDate) < new Date(editDate)) {
      toast.error("Event End Date cannot be earlier than Start Date.");
      return;
    }

    startTransition(async () => {
      const res = await updateEventAction(editTarget.id, {
        name: editName,
        description: editDescription,
        overview: editOverview,
        venue: editVenue,
        date: editDate,
        end_date: editEndDate,
        thumbnail_url: editThumbnailUrl,
      });

      if (res.success) {
        toast.success(`Event '${editName}' updated successfully!`);
        setEditTarget(null);
        loadEvents();
      } else {
        toast.error("Failed to update event: " + (res.error || "Unknown error"));
      }
    });
  };

  const handleDeleteEvent = async () => {
    if (!deleteEventTarget) return;

    startTransition(async () => {
      const res = await deleteEventAction(deleteEventTarget.id);
      if (res.success) {
        toast.success(`Event '${deleteEventTarget.name}' has been deleted.`);
        setDeleteEventTarget(null);
        loadEvents();
      } else {
        toast.error("Failed to delete event: " + (res.error || "Unknown error"));
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedEventIds.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedEventIds.length} selected events?`)) return;

    startTransition(async () => {
      let successCount = 0;
      let errorCount = 0;
      for (const id of selectedEventIds) {
        const res = await deleteEventAction(id);
        if (res.success) successCount++;
        else errorCount++;
      }
      
      if (successCount > 0) {
        toast.success(`Successfully deleted ${successCount} events.`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to delete ${errorCount} events.`);
      }
      
      setSelectedEventIds([]);
      loadEvents();
    });
  };

  const handleLogout = async () => {
    await logoutAction();
    toast.success("Signed out successfully.");
    router.push("/");
  };

  const getEventStatusBadge = (ev: EventWithStats) => {
    const now = new Date();
    if (ev.end_date && new Date(ev.end_date) < now) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 font-sans border border-slate-200">
          Concluded
        </span>
      );
    }
    if (ev.date && new Date(ev.date) <= now && (!ev.end_date || new Date(ev.end_date) >= now)) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 font-sans border border-emerald-200 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          Happening Now
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 font-sans border border-blue-200">
        Upcoming
      </span>
    );
  };

  // Filtered & Paginated Events calculation
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.description && ev.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    const now = new Date();
    const isConcluded = ev.end_date && new Date(ev.end_date) < now;
    const isActive = ev.date && new Date(ev.date) <= now && (!ev.end_date || new Date(ev.end_date) >= now);
    const isUpcoming = !isConcluded && !isActive;

    if (statusFilter === "ACTIVE") return isActive;
    if (statusFilter === "UPCOMING") return isUpcoming;
    if (statusFilter === "CONCLUDED") return isConcluded;

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const paginatedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);

  // Calculate global telemetry metrics
  const totalTournaments = events.length;
  const totalAttendees = events.reduce((sum, ev) => sum + (ev.stats?.totalParticipants || 0), 0);
  const totalAdmitted = events.reduce((sum, ev) => sum + (ev.stats?.checkedInTeams || 0), 0);
  const totalTeams = events.reduce((sum, ev) => sum + (ev.stats?.totalTeams || 0), 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Header - Precision Minimalist Bar */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 md:px-10 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm ring-1 ring-slate-900/10">
            E
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900 tracking-tight leading-none">EventFlow</h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans hidden sm:block mt-0.5">Central Tournament & Access Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/scan")}
            className="text-xs h-8.5 font-sans bg-slate-900 hover:bg-slate-800 text-white border-slate-900 hidden sm:flex items-center gap-1.5 rounded-lg active:scale-[0.98] transition-transform shadow-xs"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            Gate Scanner
          </Button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-xs ring-2 ring-slate-100">
              {user?.avatar || "AD"}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {user?.fullName || "Director"}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {user?.role || "ADMINISTRATOR"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 ml-1 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-7">
        {/* Command Deck Banner (Double-Bezel Hardware Architecture) */}
        <div className="rounded-[2.25rem] p-1.5 ring-1 ring-slate-900/10 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-2xl">
          <div className="rounded-[calc(2.25rem-0.375rem)] p-6 sm:p-8 relative overflow-hidden bg-radial from-slate-800/80 via-slate-900/95 to-slate-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 z-10 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Command Operations Live</span>
                <span className="text-slate-400 text-[10px] font-mono">• 100+ Scale Ready</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
                Tournament Command Center
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                Unified multi-event governance. Provision segregated team rosters, dispatch single-use cryptographic passes, and monitor atomic gate admissions in sub-millisecond real time.
              </p>
            </div>

            {/* Banner Telemetry & Button-in-Button Action */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-4 z-10">
              {/* Telemetry Counter Bay */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center gap-4 text-left backdrop-blur-md">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Total Teams</div>
                  <div className="text-lg font-bold text-white font-mono mt-0.5">{totalTeams}</div>
                </div>
                <div className="w-px h-7 bg-white/10" />
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Attendees</div>
                  <div className="text-lg font-bold text-white font-mono mt-0.5">{totalAttendees}</div>
                </div>
                <div className="w-px h-7 bg-white/10" />
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Admitted</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{totalAdmitted}</div>
                </div>
              </div>

              {/* Nested Button-in-Button CTA */}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="group/btn relative h-11 px-5 rounded-full bg-white text-slate-900 font-semibold text-xs sm:text-sm flex items-center gap-3 shadow-lg shadow-white/10 hover:bg-slate-100 active:scale-[0.98] transition-all duration-200"
              >
                <span>Spin Up New Event</span>
                <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center transition-transform duration-200 group-hover/btn:rotate-90">
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Ambient Lighting Background */}
            <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>
        </div>

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h3 className="font-bold text-xl text-slate-900 tracking-tight">Active Tournaments ({events.length})</h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">Select any event to open its dedicated gate operations, team roster, and live telemetry.</p>
          </div>

          <div className="flex items-center gap-2">
            {selectedEventIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-xs h-8 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Selected ({selectedEventIds.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedEventIds.length === paginatedEvents.length && paginatedEvents.length > 0) {
                  setSelectedEventIds([]);
                } else {
                  setSelectedEventIds(paginatedEvents.map((e) => e.id));
                }
              }}
              className="text-xs h-8 bg-white border-slate-300 text-slate-700 rounded-lg active:scale-[0.98]"
            >
              {selectedEventIds.length === paginatedEvents.length && paginatedEvents.length > 0 ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadEvents}
              disabled={loading}
              className="text-xs h-8 bg-white border-slate-300 text-slate-700 rounded-lg active:scale-[0.98]"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search & Segmented Status Console (Double-Bezel Chassis) */}
        <div className="rounded-2xl p-1.5 ring-1 ring-slate-200/90 bg-slate-100/70 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Filter by tournament name, venue, city, or rules..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9.5 bg-white border-slate-200/80 h-9 text-xs rounded-xl focus-visible:ring-1 focus-visible:ring-slate-900 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 bg-white/70 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              All ({events.length})
            </button>
            <button
              onClick={() => {
                setStatusFilter("ACTIVE");
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "ACTIVE"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              Happening Now
            </button>
            <button
              onClick={() => {
                setStatusFilter("UPCOMING");
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "UPCOMING"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-blue-700 hover:bg-blue-50"
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => {
                setStatusFilter("CONCLUDED");
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === "CONCLUDED"
                  ? "bg-slate-700 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Concluded
            </button>
          </div>
        </div>

        {/* Events Cards Grid */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-sans">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-slate-800 mb-3" />
            Synchronizing event registries...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-[2rem] p-1.5 ring-1 ring-slate-200 bg-slate-100/60 text-center">
            <div className="rounded-[calc(2rem-0.375rem)] bg-white p-12 border border-slate-200">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="font-bold text-lg text-slate-800">
                {searchQuery ? "No matching events found" : "No events registered"}
              </h4>
              <p className="text-xs text-slate-500 font-sans mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? "Adjust search keyword or reset status filters to view configured tournaments."
                  : "Initialize your first collegiate tournament or conference to configure team rosters and single-use QR passes."}
              </p>
              {searchQuery ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                  className="mt-4 text-xs rounded-xl"
                >
                  Clear Filters
                </Button>
              ) : (
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 bg-slate-900 text-white text-xs rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Spin Up Event
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedEvents.map((ev) => {
                const stats = ev.stats;
                const checkInRate =
                  stats.totalTeams > 0
                    ? Math.round((stats.checkedInTeams / stats.totalTeams) * 100)
                    : 0;

                return (
                  /* Double-Bezel (Doppelrand) Card Architecture */
                  <div
                    key={ev.id}
                    className={`group relative rounded-[2rem] p-1.5 ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${
                      selectedEventIds.includes(ev.id)
                        ? "ring-primary/50 bg-primary/5 shadow-md"
                        : "ring-slate-900/5 bg-gradient-to-b from-slate-100 via-slate-200/40 to-slate-100 hover:from-slate-200/80 hover:to-slate-300/60 shadow-2xs hover:shadow-xl"
                    }`}
                  >
                    {/* Concentric Inner Core Container */}
                    <div className="rounded-[calc(2rem-0.375rem)] bg-white border border-slate-200/80 flex flex-col justify-between flex-1 shadow-inner relative overflow-hidden">
                      {/* Event Thumbnail Banner */}
                      <div className="relative h-44 sm:h-48 w-full bg-slate-900 overflow-hidden shrink-0">
                        {ev.thumbnail_url ? (
                          <img
                            src={ev.thumbnail_url}
                            alt={ev.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 flex flex-col items-center justify-center relative p-4 text-center">
                            <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />
                            <Calendar className="w-8 h-8 text-slate-500 mb-1 z-10" />
                            <span className="text-[11px] font-mono text-slate-400 z-10">No Thumbnail Uploaded</span>
                          </div>
                        )}

                        {/* Scrim Gradient for text contrast */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/30 to-black/40 pointer-events-none" />

                        {/* Top Overlay: Badges and Admin Controls */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                          <div className="flex items-center gap-2">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEventIds((prev) =>
                                  prev.includes(ev.id)
                                    ? prev.filter((id) => id !== ev.id)
                                    : [...prev, ev.id]
                                );
                              }}
                              className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer backdrop-blur-md border shadow-sm transition-all ${
                                selectedEventIds.includes(ev.id)
                                  ? "bg-primary/90 border-primary text-white"
                                  : "bg-black/50 border-white/30 text-white/50 hover:text-white hover:bg-black/70"
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="flex items-center gap-1.5 backdrop-blur-md bg-black/50 rounded-full px-2.5 py-1 border border-white/20 shadow-sm">
                            {getEventStatusBadge(ev)}
                            <span className="text-[10px] font-mono text-slate-200 font-medium">
                              {ev.id}
                            </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Three Dots Menu with Edit & Actions */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuEventId(activeMenuEventId === ev.id ? null : ev.id);
                                }}
                                className={`w-7.5 h-7.5 rounded-full backdrop-blur-md flex items-center justify-center transition-all border shadow-sm cursor-pointer ${
                                  activeMenuEventId === ev.id
                                    ? "bg-white text-slate-900 border-white ring-2 ring-primary/30"
                                    : "bg-black/60 hover:bg-black/90 text-white border-white/25"
                                }`}
                                title="Event Actions Menu"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {/* Three-Dots Dropdown Menu */}
                              {activeMenuEventId === ev.id && (
                                <>
                                  {/* Backdrop to close on outside click */}
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuEventId(null);
                                    }}
                                  />

                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-9 z-50 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-slate-800 animate-in fade-in zoom-in-95 font-sans"
                                  >
                                    <div className="px-3 py-1.5 border-b border-slate-100">
                                      <p className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                                        Event Actions
                                      </p>
                                      <p className="text-xs font-bold text-slate-800 truncate">{ev.name}</p>
                                    </div>

                                    {/* Edit Event Button inside Three Dots Menu */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuEventId(null);
                                        openEditModal(ev);
                                      }}
                                      className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:text-primary hover:bg-slate-50 flex items-center gap-2 transition-colors text-left cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-primary shrink-0" />
                                      <span>Edit Event & Thumbnail</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuEventId(null);
                                        router.push(`/events/${ev.id}/dashboard`);
                                      }}
                                      className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 transition-colors text-left cursor-pointer"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      <span>Open Dashboard</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuEventId(null);
                                        router.push(`/events/${ev.id}/registrations`);
                                      }}
                                      className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 transition-colors text-left cursor-pointer"
                                    >
                                      <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                      <span>Registrations</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuEventId(null);
                                        router.push(`/events/${ev.id}/imports`);
                                      }}
                                      className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 transition-colors text-left cursor-pointer"
                                    >
                                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>Upload Roster File</span>
                                    </button>

                                    <div className="my-1 border-t border-slate-100" />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuEventId(null);
                                        setDeleteEventTarget(ev);
                                      }}
                                      className="w-full px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors text-left cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                      <span>Delete Event</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom Tagline / Venue pill on banner */}
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-white/90 z-10 font-sans">
                          <div className="flex items-center gap-1.5 truncate drop-shadow-sm font-medium">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{ev.venue || "Main Convention Hall"}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 text-white/80 text-[10px] font-mono bg-black/40 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-xs">
                            <Clock className="w-3 h-3 text-blue-400" />
                            {ev.date ? new Date(ev.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "TBA"}
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-5 flex flex-col justify-between flex-1 space-y-3.5">
                        <div className="space-y-3">
                          {/* Title */}
                          <div>
                            <h4 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors tracking-tight leading-snug">
                              {ev.name}
                            </h4>
                            <p className="text-xs text-slate-500 font-sans mt-0.5 line-clamp-1">
                              {ev.description || "Collegiate esports and hackathon verification hub."}
                            </p>
                          </div>

                          {/* Event Overview / Summary Block */}
                          <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/70">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                              Event Overview & Summary
                            </div>
                            <p className="text-xs text-slate-600 font-sans line-clamp-3 leading-relaxed">
                              {ev.overview || ev.description || "Comprehensive tournament overview, schedule tracks, and competitive guidelines configured for participants."}
                            </p>
                          </div>

                          {/* Schedule Dates */}
                          <div className="flex items-center gap-2 text-xs text-slate-600 font-sans pt-0.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700">
                              {ev.date ? new Date(ev.date).toLocaleDateString(undefined, { dateStyle: "medium" }) : "TBA"}
                              {ev.end_date && (
                                <span className="text-slate-500 font-normal">
                                  {" "}to {new Date(ev.end_date).toLocaleDateString(undefined, { dateStyle: "medium" })}
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Attendance Fill Gauge (Visual Telemetry) */}
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/90 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-sans">
                              <span className="text-slate-500 font-medium">Gate Admission</span>
                              <span className="font-mono font-bold text-slate-800">
                                {checkInRate}% <span className="text-slate-400 font-normal font-sans">Turnout</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                style={{ width: `${Math.min(100, Math.max(0, checkInRate))}%` }}
                              />
                            </div>
                          </div>

                          {/* 3-Bay Metric Dock */}
                          <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
                            <div className="bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                              <div className="text-[10px] text-slate-400 font-mono uppercase">Teams</div>
                              <div className="font-bold text-sm text-slate-900 mt-0.5">{stats.totalTeams}</div>
                            </div>
                            <div className="bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                              <div className="text-[10px] text-slate-400 font-mono uppercase">Attendees</div>
                              <div className="font-bold text-sm text-slate-900 mt-0.5">{stats.totalParticipants}</div>
                            </div>
                            <div className="bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                              <div className="text-[10px] text-slate-400 font-mono uppercase">Checked In</div>
                              <div className="font-bold text-sm text-emerald-600 mt-0.5">{stats.checkedInTeams}</div>
                            </div>
                          </div>
                        </div>

                      {/* Card Actions Dock (Button-in-Button Architecture) */}
                      <div className="pt-4 space-y-2 border-t border-slate-100 mt-4">
                        <Button
                          onClick={() => router.push(`/events/${ev.id}/dashboard`)}
                          className="w-full group/btn relative bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-9.5 px-3.5 text-xs font-semibold flex items-center justify-between shadow-xs active:scale-[0.98] transition-all"
                        >
                          <span>Open Event Dashboard</span>
                          <div className="w-5.5 h-5.5 rounded-lg bg-white/10 flex items-center justify-center transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:bg-white/20">
                            <ArrowRight className="w-3.5 h-3.5 text-white" />
                          </div>
                        </Button>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-sans">
                          <button
                            onClick={() => router.push(`/events/${ev.id}/registrations`)}
                            className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium text-center transition-colors flex items-center justify-center gap-1 active:scale-[0.98]"
                          >
                            <Users className="w-3 h-3 text-slate-500" />
                            Registrations
                          </button>

                          <button
                            onClick={() => router.push(`/events/${ev.id}/imports`)}
                            className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium text-center transition-colors flex items-center justify-center gap-1 active:scale-[0.98]"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                            Upload Roster
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>

            {/* Pagination Controls for 100+ Events */}
            {filteredEvents.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="text-xs text-slate-500 font-sans">
                  Showing <strong className="text-slate-800">{Math.min((page - 1) * pageSize + 1, filteredEvents.length)}</strong> to{" "}
                  <strong className="text-slate-800">{Math.min(page * pageSize, filteredEvents.length)}</strong> of{" "}
                  <strong className="text-slate-800">{filteredEvents.length}</strong> events
                  {filteredEvents.length !== events.length && (
                    <span className="text-slate-400 ml-1">({events.length} total)</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 disabled:opacity-40 rounded-lg"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                    Previous
                  </Button>

                  <span className="px-2 text-xs font-sans text-slate-600 font-medium font-mono">
                    {page} / {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 disabled:opacity-40 rounded-lg"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE EVENT MODAL WITH THUMBNAIL UPLOAD & OVERVIEW */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary font-mono uppercase tracking-wider">
                Event Setup
              </span>
              <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight mt-1">Create New Event</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Configure event thumbnail, overview summary, dates, venue, and ticketing system.
              </p>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name *</label>
                <Input
                  required
                  placeholder="e.g. National Hackathon Championship 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Event Thumbnail Upload & Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Event Thumbnail / Banner
                  <span className="text-[11px] font-normal text-slate-500 ml-1">(Upload image or choose preset)</span>
                </label>

                {thumbnailUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-36 bg-slate-900 group">
                    <img
                      src={thumbnailUrl}
                      alt="Event preview"
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
                              handleThumbnailUpload(e.target.files[0], setThumbnailUrl);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setThumbnailUrl("")}
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
                            handleThumbnailUpload(e.target.files[0], setThumbnailUrl);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Quick Curated Presets */}
                <div className="pt-0.5">
                  <div className="text-[11px] text-slate-500 font-medium mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Or select a curated preset:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_THUMBNAILS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setThumbnailUrl(preset.url)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          thumbnailUrl === preset.url
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

              {/* Event Overview / Introduction / Summary */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Event Overview & Introduction *
                  </label>
                  <span className="text-[10px] text-slate-400 font-sans">Featured on cards & dashboard</span>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Comprehensive introduction and summary of the event (tracks, agenda, rules, prize pool)..."
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline / Short Subtitle</label>
                <Input
                  placeholder="e.g. National Collegiate Inter-College Championship"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Venue / Location *</label>
                <Input
                  required
                  placeholder="e.g. Grand Convention Center, Hall 2"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
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
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-xs h-9 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <Input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs h-9 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs h-9 shadow-sm"
                >
                  {isPending ? "Creating Event..." : "Create & Open Dashboard"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EVENT MODAL */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 font-mono uppercase tracking-wider">
                Event Editor
              </span>
              <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight mt-1">
                Edit Event & Thumbnail
              </h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Update the visual thumbnail, overview description, dates, or location.
              </p>
            </div>

            <form onSubmit={handleEditEvent} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name *</label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Edit Thumbnail Upload & Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Event Thumbnail / Banner
                  <span className="text-[11px] font-normal text-slate-500 ml-1">(Upload new image or select preset)</span>
                </label>

                {editThumbnailUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-36 bg-slate-900 group">
                    <img
                      src={editThumbnailUrl}
                      alt="Event thumbnail preview"
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
                              handleThumbnailUpload(e.target.files[0], setEditThumbnailUrl);
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
                            handleThumbnailUpload(e.target.files[0], setEditThumbnailUrl);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Presets for edit */}
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

              {/* Overview / Introduction */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Event Overview & Introduction *
                  </label>
                  <span className="text-[10px] text-slate-400 font-sans">Full summary</span>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Comprehensive introduction and summary of the event..."
                  value={editOverview}
                  onChange={(e) => setEditOverview(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline / Short Subtitle</label>
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
                  onClick={() => setEditTarget(null)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs h-9 shadow-sm"
                >
                  {isPending ? "Saving Changes..." : "Save Event Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE EVENT CONFIRMATION MODAL */}
      {deleteEventTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setDeleteEventTarget(null)}
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
                <p className="text-xs text-slate-500 font-sans">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200/80 rounded-xl p-3.5 my-4 space-y-2 text-xs text-red-800 font-sans">
              <p>
                You are about to delete <strong className="font-semibold text-red-950">"{deleteEventTarget.name}"</strong> (ID: {deleteEventTarget.id}).
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-red-700">
                <li>All {deleteEventTarget.stats.totalTeams} team rosters will be permanently purged.</li>
                <li>All {deleteEventTarget.stats.totalParticipants} attendee registrations will be deleted.</li>
                <li>All issued QR passes for this event will be immediately invalidated.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 font-sans">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteEventTarget(null)}
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
                {isPending ? "Deleting..." : "Permanently Delete Event"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
