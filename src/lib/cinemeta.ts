export interface CinemetaVideo {
  id: string;
  title: string;
  released: string;
  season: number;
  episode: number;
  thumbnail?: string;
  overview?: string;
}

export interface Meta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
}

export interface DetailedMeta extends Meta {
  videos?: CinemetaVideo[];
}

/**
 * Fetch detailed metadata for a specific title (movie or series)
 */
export async function fetchMetaDetails(type: "movie" | "series", id: string): Promise<DetailedMeta> {
  const res = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
  if (!res.ok) {
    throw new Error("Failed to fetch Cinemeta meta details");
  }
  const data = await res.json();
  return data.meta;
}

/**
 * Fetch catalog list for main browse grid
 */
export async function fetchCatalog(type: string, id: string, search?: string): Promise<Meta[]> {
  const url = search
    ? `https://v3-cinemeta.strem.io/catalog/${type}/${id}/search=${encodeURIComponent(search)}.json`
    : `https://v3-cinemeta.strem.io/catalog/${type}/${id}.json`;
    
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch catalog");
  }
  const data = await res.json();
  return data.metas || [];
}