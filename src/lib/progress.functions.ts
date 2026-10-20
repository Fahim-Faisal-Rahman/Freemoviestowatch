import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Input validator schema
const SaveProgressInput = z.object({
  deviceId: z.string(),
  imdbId: z.string(),
  type: z.enum(["movie", "series"]).default("movie"),
  season: z.number().optional().default(1),
  episode: z.number().optional().default(1),
  title: z.string(),
  poster: z.string().nullable().optional(),
  streamUrl: z.string(),
  position: z.number(),
  duration: z.number(),
  completed: z.boolean().optional().default(false),
});

const ListProgressInput = z.object({
  deviceId: z.string(),
});

export type ProgressRecord = {
  id: string;
  device_id: string;
  imdb_id: string;
  type: "movie" | "series";
  season: number;
  episode: number;
  title: string;
  poster: string | null;
  stream_url: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
};

/**
 * Save or update watch progress
 */
export const saveProgress = createServerFn({ method: "POST" })
  .validator((data: unknown) => SaveProgressInput.parse(data))
  .handler(async ({ data }) => {
    const { deviceId, imdbId, type, season, episode, title, poster, streamUrl, position, duration, completed } = data;
    
    // Unique key: Combine IMDb ID + Season + Episode for TV series
    const recordKey = type === "series" ? `${imdbId}:s${season}:e${episode}` : imdbId;

    // Database upsert logic here (e.g. SQLite, Supabase, Drizzle, Prisma)
    return { success: true, key: recordKey, completed };
  });

/**
 * Retrieve watch progress list for a device
 */
export const listProgress = createServerFn({ method: "GET" })
  .validator((data: unknown) => ListProgressInput.parse(data))
  .handler(async ({ data }) => {
    // Database query logic here
    return [] as ProgressRecord[];
  });