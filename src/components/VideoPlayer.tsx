import { useEffect, useRef } from "react";
import "video.js/dist/video-js.css";

export type QualityOption = { label: string; url: string };
export type SubtitleTrack = { label: string; lang: string; src: string };

type Props = {
  src: string;
  startAt?: number;
  subtitle: SubtitleTrack | null;
  poster?: string | null | undefined;
  onProgress: (position: number, duration: number) => void;
  onLevels?: (levels: { index: number; height: number }[]) => void;
  hlsLevel?: number; // -1 = auto
};

export function mimeFor(url: string) {
  return /\.m3u8(\?|$)/i.test(url) ? "application/x-mpegURL" : "video/mp4";
}

export function VideoPlayer({ src, startAt = 0, subtitle, poster, onProgress, onLevels, hlsLevel = -1 }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const cbs = useRef({ onProgress, onLevels });
  cbs.current = { onProgress, onLevels };

  // init once
  useEffect(() => {
    let disposed = false;
    import("video.js").then(({ default: videojs }) => {
      if (disposed || !holder.current) return;
      const el = document.createElement("video-js");
      el.classList.add("vjs-big-play-centered", "vjs-fluid");
      holder.current.appendChild(el);
      const p = videojs(el, { controls: true, preload: "auto", fluid: true, playbackRates: [0.5, 1, 1.25, 1.5, 2] });
      player.current = p;
      let last = 0;
      p.on("timeupdate", () => {
        const now = Date.now();
        if (now - last > 10000) {
          last = now;
          cbs.current.onProgress(p.currentTime() || 0, p.duration() || 0);
        }
      });
      p.on("pause", () => cbs.current.onProgress(p.currentTime() || 0, p.duration() || 0));
      p.trigger("lovable-ready");
      setSource(p, src, startAt, poster);
    });
    return () => {
      disposed = true;
      player.current?.dispose();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // source change (quality switch keeps time)
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const keep = p.currentTime() > 0 ? p.currentTime() : startAt;
    setSource(p, src, keep, poster);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function setSource(p: any, url: string, at: number, post?: string | null) {
    const wasPlaying = !p.paused();
    if (post) p.poster(post);
    p.src({ src: url, type: mimeFor(url) });
    p.one("loadedmetadata", () => {
      if (at > 0) p.currentTime(at);
      if (wasPlaying) p.play()?.catch(() => {});
      const ql = typeof p.qualityLevels === "function" ? p.qualityLevels() : null;
      if (ql) {
        const lv: { index: number; height: number }[] = [];
        for (let i = 0; i < ql.length; i++) lv.push({ index: i, height: ql[i].height });
        cbs.current.onLevels?.(lv);
      } else cbs.current.onLevels?.([]);
    });
  }

  // HLS level selection
  useEffect(() => {
    const p = player.current;
    if (!p || typeof p.qualityLevels !== "function") return;
    const ql = p.qualityLevels();
    for (let i = 0; i < ql.length; i++) ql[i].enabled = hlsLevel === -1 || i === hlsLevel;
  }, [hlsLevel]);

  // subtitles (SRT converted to VTT blob)
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    let revoke: string | null = null;
    let cancelled = false;
    const tracks = p.remoteTextTracks();
    for (let i = tracks.length - 1; i >= 0; i--) p.removeRemoteTextTrack(tracks[i]);
    if (!subtitle) return;
    (async () => {
      let url = subtitle.src;
      if (/\.srt(\?|$)/i.test(url) || url.startsWith("blob:srt")) {
        try {
          const txt = await (await fetch(url)).text();
          url = URL.createObjectURL(new Blob([srtToVtt(txt)], { type: "text/vtt" }));
          revoke = url;
        } catch {
          return;
        }
      }
      if (cancelled) return;
      p.addRemoteTextTrack({ kind: "subtitles", src: url, srclang: subtitle.lang, label: subtitle.label, default: true }, false);
      const t = p.textTracks();
      for (let i = 0; i < t.length; i++) t[i].mode = t[i].label === subtitle.label ? "showing" : "disabled";
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [subtitle]);

  return <div ref={holder} data-vjs-player />;
}

export function srtToVtt(srt: string) {
  return (
    "WEBVTT\n\n" +
    srt
      .replace(/\r+/g, "")
      .replace(/^\d+\n(?=\d{2}:)/gm, "")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
  );
}
