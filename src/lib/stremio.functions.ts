import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type StremioStream = {
  name: string;
  title: string;
  url: string | null;
  infoHash: string | null;
  externalUrl: string | null;
};

// Fetched server-side to avoid CORS / mixed-content issues with addon hosts.
export const getStremioStreams = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        addonUrl: z.string().url(),
        type: z.enum(["movie", "series"]),
        id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<StremioStream[]> => {
    const base = data.addonUrl.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
    const res = await fetch(`${base}/stream/${data.type}/${encodeURIComponent(data.id)}.json`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Addon responded with ${res.status}`);
    const json: any = await res.json();
    const streams = Array.isArray(json?.streams) ? json.streams : [];
    return streams.map((s: any) => ({
      name: typeof s?.name === "string" ? s.name : "Stream",
      title: typeof s?.title === "string" ? s.title : typeof s?.description === "string" ? s.description : "",
      url: typeof s?.url === "string" ? s.url : null,
      infoHash: typeof s?.infoHash === "string" ? s.infoHash : null,
      externalUrl: typeof s?.externalUrl === "string" ? s.externalUrl : null,
    }));
  });
