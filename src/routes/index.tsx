import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientOnly } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCatalog, fetchMetaDetails, type Meta } from "@/lib/cinemeta";
import { listProgress, saveProgress } from "@/lib/progress.functions";
import { getStremioStreams, type StremioStream } from "@/lib/stremio.functions";
import { VideoPlayer, type QualityOption, type SubtitleTrack } from "@/components/VideoPlayer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel — Stream Dashboard & Player" },
      { name: "description", content: "Browse Cinemeta posters, play MP4/HLS streams, pick quality and subtitles, and resume where you left off." },
    ],
  }),
  component: Dashboard,
});

interface EmbedParams {
  id: string;
  season?: number;
  episode?: number;
  type: "movie" | "series";
}

interface EmbedProvider {
  id: string;
  name: string;
  getUrl: (params: EmbedParams) => string;
}

const EMBED_PROVIDERS: EmbedProvider[] = [
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

const DEMO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const DEMO_MP4 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const CATALOGS = [
  { id: "top", label: "Popular" },
  { id: "imdbRating", label: "Top rated" },
];

function useDeviceId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let v = localStorage.getItem("reel-device");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("reel-device", v);
    }
    setId(v);
  }, []);
  return id;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 60) ? Math.floor(m / 60) + "h " : ""}${m % 60}m`;
}

function Dashboard() {
  const deviceId = useDeviceId();
  const qc = useQueryClient();
  const list = useServerFn(listProgress);
  const save = useServerFn(saveProgress);

  // Global Browse Catalog Type (movie vs series)
  const [browseType, setBrowseType] = useState<"movie" | "series">("movie");
  const [catalog, setCatalog] = useState("top");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Meta | null>(null);

  const [playerMode, setPlayerMode] = useState<"native" | "embed">("native");
  const [activeEmbedUrl, setActiveEmbedUrl] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [countdown, setCountdown] = useState(10);

  const [qualities, setQualities] = useState<QualityOption[]>([
    { label: "Auto (HLS)", url: DEMO_HLS },
    { label: "1080p MP4", url: DEMO_MP4 },
  ]);
  const [activeUrl, setActiveUrl] = useState(DEMO_HLS);
  const [hlsLevels, setHlsLevels] = useState<{ index: number; height: number }[]>([]);
  const [hlsLevel, setHlsLevel] = useState(-1);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const [subs, setSubs] = useState<SubtitleTrack[]>([]);
  const [activeSub, setActiveSub] = useState<SubtitleTrack | null>(null);
  const [subUrl, setSubUrl] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);

  const [addonUrl, setAddonUrl] = useState(() =>
    typeof window === "undefined" ? "https://torrentio.strem.co" : localStorage.getItem("reel-addon") ?? "https://torrentio.strem.co",
  );
  const [stremioStreams, setStremioStreams] = useState<StremioStream[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const fetchStremio = useServerFn(getStremioStreams);

  // Synchronized type change across panel and catalog
  const handleTypeChange = (type: "movie" | "series") => {
    setContentType(type);
    setBrowseType(type);
    setSeason(1);
    setEpisode(1);
  };

  // Fetch Movies or Series depending on browseType
  const posters = useQuery({
    queryKey: ["catalog", browseType, catalog, query],
    queryFn: () => fetchCatalog(browseType, catalog, query || undefined),
  });

  const metaDetails = useQuery({
    queryKey: ["metaDetails", contentType, selected?.id],
    enabled: !!selected && contentType === "series",
    queryFn: () => fetchMetaDetails("series", selected!.id),
  });

  const progress = useQuery({
    queryKey: ["progress", deviceId],
    enabled: !!deviceId,
    queryFn: () => list({ data: { deviceId: deviceId! } }),
  });

  const progressMap = useMemo(() => new Map((progress.data ?? []).map((r) => [r.imdb_id, r])), [progress.data]);

  const availableSeasons = useMemo(() => {
    const videos = metaDetails.data?.videos ?? [];
    const seasons = Array.from(new Set(videos.map((v) => v.season))).filter((s) => s > 0);
    return seasons.sort((a, b) => a - b);
  }, [metaDetails.data]);

  const availableEpisodes = useMemo(() => {
    const videos = metaDetails.data?.videos ?? [];
    return videos.filter((v) => v.season === season).sort((a, b) => a.episode - b.episode);
  }, [metaDetails.data, season]);

  const nextEpisode = useMemo(() => {
    if (contentType !== "series" || availableEpisodes.length === 0) return null;
    const currentIndex = availableEpisodes.findIndex((ep) => ep.episode === episode);
    if (currentIndex !== -1 && currentIndex < availableEpisodes.length - 1) {
      return availableEpisodes[currentIndex + 1];
    }
    const nextSeasonNum = season + 1;
    if (availableSeasons.includes(nextSeasonNum)) {
      return { season: nextSeasonNum, episode: 1, title: "Episode 1" };
    }
    return null;
  }, [contentType, episode, season, availableEpisodes, availableSeasons]);

  const openTitle = (m: Meta, resumeUrl?: string | null) => {
    const p = progressMap.get(m.id);
    setSelected(m);
    
    // Auto-detect media type from item or current browse filter
    const detectedType = m.type === "series" || browseType === "series" ? "series" : "movie";
    setContentType(detectedType);
    setSeason(1);
    setEpisode(1);

    setStartAt(p ? p.position_seconds : 0);
    const url = resumeUrl ?? p?.stream_url ?? activeUrl;
    setActiveUrl(url);
    setPlayerMode("native");
    setActiveEmbedUrl(null);
    setActiveProviderId(null);
    if (!qualities.some((q) => q.url === url)) setQualities((qs) => [...qs, { label: "Saved stream", url }]);
    setPlayerKey((k) => k + 1);
    setHlsLevel(-1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const playEmbed = (provider: EmbedProvider) => {
    if (!selected) return;
    const embedUrl = provider.getUrl({ id: selected.id, season, episode, type: contentType });
    setActiveEmbedUrl(embedUrl);
    setActiveProviderId(provider.id);
    setPlayerMode("embed");
  };

  const playNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    if (nextEpisode.season && nextEpisode.season !== season) {
      setSeason(nextEpisode.season);
    }
    setEpisode(nextEpisode.episode);
    setStartAt(0);
    setShowNextPrompt(false);
    setCountdown(10);
    setPlayerKey((k) => k + 1);
  }, [nextEpisode, season]);

  useEffect(() => {
    if (!showNextPrompt) {
      setCountdown(10);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          playNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showNextPrompt, playNextEpisode]);

  useEffect(() => {
    if (playerMode === "embed" && activeProviderId && selected) {
      const provider = EMBED_PROVIDERS.find((p) => p.id === activeProviderId);
      if (provider) {
        setActiveEmbedUrl(
          provider.getUrl({ id: selected.id, season, episode, type: contentType })
        );
      }
    }
  }, [season, episode, contentType, selected, playerMode, activeProviderId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        const video = document.querySelector("video") as HTMLVideoElement | null;
        if (video) video.paused ? video.play().catch(() => {}) : video.pause();
      } else if (key === "m") {
        e.preventDefault();
        const video = document.querySelector("video") as HTMLVideoElement | null;
        if (video) video.muted = !video.muted;
      } else if (key === "n") {
        e.preventDefault();
        if (nextEpisode) playNextEpisode();
      } else if (key === "f") {
        e.preventDefault();
        const playerContainer = document.querySelector(".aspect-video") as HTMLElement | null;
        if (playerContainer) {
          document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : playerContainer.requestFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextEpisode, playNextEpisode]);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (!deviceId || !selected || !isFinite(duration) || position < 1) return;
      const pct = position / duration;
      const isCompleted = pct >= 0.9;

      if (isCompleted && contentType === "series" && nextEpisode && !showNextPrompt) {
        setShowNextPrompt(true);
        setCountdown(10);
      }

      save({
        data: {
          deviceId,
          imdbId: selected.id,
          type: contentType,
          season: contentType === "series" ? season : 1,
          episode: contentType === "series" ? episode : 1,
          title: contentType === "series" ? `${selected.name} S${season}E${episode}` : selected.name,
          poster: selected.poster ?? null,
          streamUrl: activeUrl,
          position,
          duration,
          completed: isCompleted,
        },
      })
        .then(() => qc.invalidateQueries({ queryKey: ["progress", deviceId] }))
        .catch(() => {});
    },
    [deviceId, selected, contentType, season, episode, activeUrl, nextEpisode, showNextPrompt, save, qc],
  );

  const addQuality = () => {
    try {
      new URL(newUrl);
    } catch {
      return;
    }
    const q = { label: newLabel || `Stream ${qualities.length + 1}`, url: newUrl };
    setQualities((qs) => [...qs, q]);
    setActiveUrl(q.url);
    setPlayerMode("native");
    setNewLabel("");
    setNewUrl("");
  };

  const findStreams = async () => {
    if (!selected) return;
    setStreamsLoading(true);
    setStremioStreams([]);
    try {
      localStorage.setItem("reel-addon", addonUrl);
      const list = await fetchStremio({ data: { addonUrl: addonUrl.trim(), type: contentType, id: selected.id } });
      setStremioStreams(list);
    } catch {
    } finally {
      setStreamsLoading(false);
    }
  };

  const playStremio = (s: StremioStream) => {
    if (!s.url) return;
    const label = s.title.split("\n")[0]?.slice(0, 40) || s.name;
    if (!qualities.some((q) => q.url === s.url)) setQualities((qs) => [...qs, { label, url: s.url! }]);
    setActiveUrl(s.url);
    setPlayerMode("native");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-20 flex-col items-center gap-6 border-r bg-sidebar/70 py-6 md:flex">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent font-display text-lg font-bold text-accent-foreground shadow-glow">R</div>
        {["Board", "Discover", "Library"].map((l) => (
          <span key={l} className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</span>
        ))}
      </aside>

      <main className="flex-1 space-y-10 px-4 py-6 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Reel</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
            className="flex w-full max-w-md gap-2"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search movies & TV shows on Cinemeta…"
              className="flex-1 rounded-full border bg-input px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button className="rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
          </form>
        </header>

        {/* Player Section */}
        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="relative rounded-2xl bg-card p-2 shadow-glow">
              <ClientOnly fallback={<div className="aspect-video rounded-xl bg-muted" />}>
                {playerMode === "embed" && activeEmbedUrl ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <iframe
                      src={activeEmbedUrl}
                      className="h-full w-full border-0"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <VideoPlayer
                    key={playerKey}
                    src={activeUrl}
                    startAt={startAt}
                    subtitle={activeSub}
                    poster={selected?.background ?? selected?.poster}
                    onProgress={onProgress}
                    onLevels={setHlsLevels}
                    hlsLevel={hlsLevel}
                  />
                )}
              </ClientOnly>

              {/* Next Episode Prompt Overlay */}
              {showNextPrompt && nextEpisode && (
                <div className="absolute bottom-6 right-6 z-20 flex items-center gap-4 rounded-xl border border-white/10 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-md">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Up Next in {countdown}s</p>
                    <p className="line-clamp-1 text-sm font-semibold">
                      S{nextEpisode.season ?? season} E{nextEpisode.episode}: {nextEpisode.title || `Episode ${nextEpisode.episode}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={playNextEpisode} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                      <span>Play Next</span>
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-black/20 text-[10px]">{countdown}</span>
                    </button>
                    <button onClick={() => setShowNextPrompt(false)} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-white/20 hover:text-white">✕</button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{selected?.name ?? "Pick a title, then play any stream"}</h2>
                {playerMode === "embed" && (
                  <button onClick={() => setPlayerMode("native")} className="rounded-lg bg-secondary px-3 py-1 text-xs font-medium hover:bg-muted">
                    Switch to Direct Player
                  </button>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {selected
                  ? [selected.releaseInfo, selected.imdbRating && `IMDb ${selected.imdbRating}`, selected.genres?.slice(0, 3).join(" · ")].filter(Boolean).join("  ·  ")
                  : "Select an embed server or paste your own stream URL."}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Shortcuts:</span>
                <span><kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">Space</kbd> Play/Pause</span>
                <span><kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">M</kbd> Mute</span>
                <span><kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">N</kbd> Next Ep</span>
                <span><kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">F</kbd> Fullscreen</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Embed Servers Panel */}
            <Panel title="Third-Party Embed Sources">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Chip active={contentType === "movie"} onClick={() => handleTypeChange("movie")}>Movie</Chip>
                  <Chip active={contentType === "series"} onClick={() => handleTypeChange("series")}>TV Show</Chip>
                </div>

                {!selected ? (
                  <p className="text-xs text-muted-foreground pt-1">Select a title below to load external players.</p>
                ) : (
                  <>
                    {contentType === "series" && (
                      <div className="space-y-2 pt-1">
                        {metaDetails.isLoading ? (
                          <p className="text-xs animate-pulse text-muted-foreground">Loading episode list…</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Season</label>
                              <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="w-full rounded-lg border bg-input px-3 py-1.5 text-xs outline-none">
                                {availableSeasons.length > 0 ? (
                                  availableSeasons.map((s) => <option key={s} value={s}>Season {s}</option>)
                                ) : (
                                  <option value={1}>Season 1</option>
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Episode</label>
                              <select value={episode} onChange={(e) => setEpisode(Number(e.target.value))} className="w-full rounded-lg border bg-input px-3 py-1.5 text-xs outline-none">
                                {availableEpisodes.length > 0 ? (
                                  availableEpisodes.map((ep) => (
                                    <option key={ep.id} value={ep.episode}>
                                      E{ep.episode}: {ep.title || `Episode ${ep.episode}`}
                                    </option>
                                  ))
                                ) : (
                                  <option value={1}>Episode 1</option>
                                )}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {EMBED_PROVIDERS.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => playEmbed(provider)}
                          className={`rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                            playerMode === "embed" && activeProviderId === provider.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-secondary text-secondary-foreground hover:bg-muted"
                          }`}
                        >
                          ▶ {provider.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Panel>

            <Panel title="Stream quality">
              <div className="flex flex-wrap gap-2">
                {qualities.map((q) => (
                  <Chip key={q.url + q.label} active={playerMode === "native" && q.url === activeUrl} onClick={() => { setActiveUrl(q.url); setPlayerMode("native"); }}>
                    {q.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Field value={newLabel} onChange={setNewLabel} placeholder="Label (e.g. 720p)" />
                <Field value={newUrl} onChange={setNewUrl} placeholder="https://…/video.mp4 or .m3u8" />
                <button onClick={addQuality} className="w-full rounded-lg bg-secondary py-2 text-sm font-medium hover:bg-muted">Add & play stream</button>
              </div>
            </Panel>

            <Panel title="Stremio addon">
              <div className="space-y-2">
                <Field value={addonUrl} onChange={setAddonUrl} placeholder="Addon URL, e.g. https://torrentio.strem.co" />
                <button onClick={findStreams} disabled={!selected || streamsLoading} className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {streamsLoading ? "Fetching streams…" : selected ? `Find streams for “${selected.name}”` : "Select a title first"}
                </button>
                {stremioStreams.length > 0 && (
                  <ul className="max-h-64 space-y-1 overflow-y-auto pt-1">
                    {stremioStreams.map((s, i) => (
                      <li key={i}>
                        {s.url && (
                          <button onClick={() => playStremio(s)} className={`w-full rounded-lg px-3 py-2 text-left text-xs transition hover:bg-muted ${playerMode === "native" && s.url === activeUrl ? "bg-primary/15 ring-1 ring-primary" : "bg-secondary"}`}>
                            <span className="block truncate font-medium">{s.name}</span>
                            <span className="block truncate text-muted-foreground">{s.title}</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel title="Subtitles">
              <div className="flex flex-wrap gap-2">
                <Chip active={!activeSub} onClick={() => setActiveSub(null)}>Off</Chip>
                {subs.map((s) => (
                  <Chip key={s.src} active={activeSub?.src === s.src} onClick={() => setActiveSub(s)}>{s.label}</Chip>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        {/* Poster grid */}
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="mr-4 text-lg font-semibold">{query ? `Results for “${query}”` : "Discover"}</h2>
            
            {/* Category Type Switcher (Movies vs TV Shows) */}
            <div className="mr-4 flex gap-1 rounded-full bg-secondary p-1">
              <button
                onClick={() => handleTypeChange("movie")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${browseType === "movie" ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:text-foreground"}`}
              >
                Movies
              </button>
              <button
                onClick={() => handleTypeChange("series")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${browseType === "series" ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:text-foreground"}`}
              >
                TV Shows
              </button>
            </div>

            {!query && CATALOGS.map((c) => (
              <Chip key={c.id} active={catalog === c.id} onClick={() => setCatalog(c.id)}>{c.label}</Chip>
            ))}
          </div>

          {posters.data && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {posters.data.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openTitle(m)}
                  className={`group relative aspect-[2/3] overflow-hidden rounded-xl bg-card text-left transition duration-300 hover:-translate-y-1 hover:shadow-glow ${selected?.id === m.id ? "ring-2 ring-primary" : ""}`}
                >
                  {m.poster && <img src={m.poster} alt={m.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                  <div className="absolute inset-0 bg-poster-fade opacity-90" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="line-clamp-2 text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.releaseInfo} {m.imdbRating && <span className="text-primary">★ {m.imdbRating}</span>}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card/80 p-4 backdrop-blur">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border bg-input px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring" />
  );
}