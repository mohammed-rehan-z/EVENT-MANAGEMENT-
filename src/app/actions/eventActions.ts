"use server";

import {
  createEventInStore,
  deleteEventInStore,
  updateEventInStore,
  EventData,
  getAllEvents,
  getEventById,
  getEventStats,
} from "@/lib/dataStore";

export interface EventWithStats extends EventData {
  stats: {
    totalTeams: number;
    totalParticipants: number;
    checkedInTeams: number;
    emailsSent: number;
    checkInRate: number;
  };
}

export async function fetchEventsWithStatsAction(): Promise<{
  success: boolean;
  events: EventWithStats[];
  error?: string;
}> {
  try {
    const rawEvents = await getAllEvents();
    const eventsWithStats: EventWithStats[] = await Promise.all(
      rawEvents.map(async (e) => {
        const stats = await getEventStats(e.id);
        return {
          ...e,
          stats,
        };
      })
    );

    return { success: true, events: eventsWithStats };
  } catch (err: any) {
    return { success: false, events: [], error: err.message };
  }
}

export async function createEventAction(
  name: string,
  description: string,
  venue: string,
  date: string,
  endDate?: string,
  thumbnailUrl?: string,
  overview?: string
): Promise<{ success: boolean; event?: EventData; error?: string }> {
  try {
    if (!name || !name.trim()) {
      return { success: false, error: "Event name is required." };
    }

    const newEvent = await createEventInStore(
      name,
      description,
      venue,
      date,
      endDate,
      thumbnailUrl,
      overview
    );
    return { success: true, event: newEvent };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateEventAction(
  eventId: string,
  updates: {
    name?: string;
    description?: string;
    overview?: string;
    venue?: string;
    date?: string;
    end_date?: string;
    thumbnail_url?: string;
    is_active?: boolean;
  }
): Promise<{ success: boolean; event?: EventData; error?: string }> {
  try {
    if (!eventId) {
      return { success: false, error: "Event ID is required." };
    }

    const updated = await updateEventInStore(eventId, updates);
    if (!updated) {
      return { success: false, error: "Event not found or could not be updated." };
    }

    return { success: true, event: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteEventAction(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await deleteEventInStore(eventId);
    if (!success) {
      return { success: false, error: "Event not found or could not be deleted." };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchEventDetailsAction(eventId: string) {
  try {
    const event = await getEventById(eventId);
    if (!event) return { success: false, error: "Event not found" };
    const stats = await getEventStats(eventId);
    return { success: true, event, stats };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

