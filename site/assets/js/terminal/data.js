// Data access for the terminal. All files are static JSON produced by the pipeline (pipeline/run.py).
// Requests are cached per page load; a failed file rejects its promise so callers can show
// an explicit "unavailable" state for that panel only.

const BASE = (document.documentElement.dataset.base || "/") + "data/";
const cache = new Map();

export function json(path) {
  if (!cache.has(path)) {
    const p = fetch(BASE + path, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${path} unavailable (HTTP ${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path)); // allow a retry on the next navigation
    cache.set(path, p);
  }
  return cache.get(path);
}

export const catalog = () => json("catalog.json");
export const status = () => json("status.json");

/** Load one series {id, meta, d, v}. Rejects with a readable message if the series has no data. */
export async function series(id) {
  const cat = await catalog();
  const entry = cat.series[id];
  if (!entry) throw new Error(`${id}: not in catalogue`);
  if (!entry.file) throw new Error(`${entry.name || id}: no data (${entry.status || "unavailable"})`);
  const s = await json(entry.file);
  return { ...s, meta: { ...entry, ...s.meta, latest: entry.latest, stale: entry.stale } };
}

/** Load many series; returns {ok: {id: series}, failed: {id: message}} – never throws. */
export async function many(ids) {
  const res = await Promise.allSettled(ids.map(series));
  const ok = {}, failed = {};
  res.forEach((r, i) => (r.status === "fulfilled" ? (ok[ids[i]] = r.value) : (failed[ids[i]] = r.reason.message)));
  return { ok, failed };
}

export const curve = (id) => json(`curves/${id}.json`);
