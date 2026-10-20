export interface EmbedParams {
  id: string;
  season?: number;
  episode?: number;
  type: "movie" | "series";
}

export interface EmbedProvider {
  id: string;
  name: string;
  getUrl: (params: EmbedParams) => string;
}

export const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    id: "vidsrc_me",
    name: "VidSrc.me",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://vidsrc.me/embed/tv?imdb=${id}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/embed/movie?imdb=${id}`,
  },
  {
    id: "vidsrc_xyz",
    name: "VidSrc.xyz",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://vidsrc.xyz/embed/tv?imdb=${id}&season=${season}&episode=${episode}`
        : `https://vidsrc.xyz/embed/movie?imdb=${id}`,
  },
  {
    id: "vidsrc_to",
    name: "VidSrc.to",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`
        : `https://vidsrc.to/embed/movie/${id}`,
  },
  {
    id: "vidsrc_vip",
    name: "VidSrc.vip",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://vidsrc.vip/embed/tv/${id}/${season}/${episode}`
        : `https://vidsrc.vip/embed/movie/${id}`,
  },
  {
    id: "vidlink",
    name: "VidLink",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
        : `https://vidlink.pro/movie/${id}`,
  },
  {
    id: "2embed",
    name: "2Embed",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${id}`,
  },
  {
    id: "superembed",
    name: "SuperEmbed",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://multiembed.mov/directstream.php?video_id=${id}&s=${season}&e=${episode}`
        : `https://multiembed.mov/directstream.php?video_id=${id}`,
  },
  {
    id: "smashystream",
    name: "SmashyStream",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}&s=${season}&e=${episode}`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}`,
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    getUrl: ({ id, season = 1, episode = 1, type }) =>
      type === "series"
        ? `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`
        : `https://player.autoembed.cc/embed/movie/${id}`,
  },
];