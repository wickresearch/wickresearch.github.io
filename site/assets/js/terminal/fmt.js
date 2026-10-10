// Formatting helpers: one place for number, change, date and label conventions.

export const MINUS = "−";

export function num(v, dp = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }).replace("-", MINUS);
}

/** Level formatted for its units. */
export function value(v, units = "", opts = {}) {
  if (v == null || !Number.isFinite(v)) return "—";
  const u = units || "";
  if (u === "%") return num(v, opts.dp ?? 2) + "%";
  if (u === "bp") return num(v, opts.dp ?? 0) + "bp";
  if (u === "USD bn") return Math.abs(v) >= 1000 ? num(v / 1000, 2) + "tn" : num(v, 0) + "bn";
  if (u === "thousands" || u.startsWith("thousands")) return num(v, 0) + "k";
  if (u === "USD mn") return num(v / 1000, 1) + "bn";
  if (Math.abs(v) >= 10000) return num(v, 0);
  if (Math.abs(v) >= 100) return num(v, 2);
  return num(v, opts.dp ?? (Math.abs(v) < 10 ? 4 : 2));
}

/** Change formatted by kind: 'bp' (yields), 'pct' (returns), 'abs' (levels). Returns [text, cls]. */
export function change(c, kind, units = "") {
  if (c == null || !Number.isFinite(c)) return ["—", "flat"];
  const cls = c > 0 ? "up" : c < 0 ? "down" : "flat";
  const s = c > 0 ? "+" : c < 0 ? MINUS : "±";
  const a = Math.abs(c);
  if (kind === "pct") return [`${s}${a.toFixed(2)}%`, cls];
  if (kind === "bp") return [units === "%" ? `${s}${a.toFixed(1)}bp` : `${s}${a.toFixed(2)}`, cls];
  if (units === "bp") return [`${s}${a.toFixed(1)}bp`, cls];
  if (units === "%") return [`${s}${a.toFixed(2)}pp`, cls];
  if (units === "USD bn") return [`${s}${a >= 1000 ? (a / 1000).toFixed(2) + "tn" : a.toFixed(0) + "bn"}`, cls];
  if (units && units.startsWith("thousands")) return [`${s}${a.toFixed(0)}k`, cls];
  return [`${s}${a >= 100 ? a.toFixed(0) : a.toFixed(2)}`, cls];
}

export function date(s, style = "short") {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? s + "T00:00:00Z" : s);
  if (style === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  if (style === "long") return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (style === "time") return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Observation date in the natural granularity of the series' frequency. */
export const obsDate = (s, freq) => (freq === "M" ? date(s, "month") : freq === "Q" ? quarter(s) : freq === "A" ? s.slice(0, 4) : date(s));
export const quarter = (s) => `Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1} ${s.slice(0, 4)}`;

export const FREQ = { D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly", A: "Annual" };
export const CHECK = { tested: "Source tested 10 Oct 2026", production: "Confirmed by production pipeline", family: "Same API family as a tested call",
  partial: "Partially verified source", derived: "Calculated from verified inputs" };
