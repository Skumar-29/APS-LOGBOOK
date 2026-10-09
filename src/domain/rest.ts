import { type RestType, type Workspace } from "./model";
import { dateAdd } from "./time";

/** Only saved pages have implicit rest. An absent day is unknown history. */
export function activityAt(s: Workspace, date: string, slot: number) {
  const d = s.days[date];
  return d ? d.slots[slot] || "rest" : null;
}

/** A rest setting lasts for this continuous break, never across intervening work. */
export function restTypeAt(s: Workspace, date: string, slot: number): RestType {
  for (let steps = 0; steps < 29; steps++) {
    const d = s.days[date];
    if (!d || activityAt(s, date, slot) !== "rest") return "unknown";
    const start = slot === 0 ? 0 : d.slots.lastIndexOf("work", slot - 1) + 1;
    const explicit = Object.values(d.changes)
      .filter(
        (c) =>
          c.slot >= start &&
          c.slot <= slot &&
          activityAt(s, date, c.slot) === "rest",
      )
      .sort((a, b) => b.slot - a.slot)[0];
    if (explicit) return explicit.restType;
    if (d.restDefault && d.restDefault !== "unknown") return d.restDefault;
    if (start > 0) return "unknown";
    date = dateAdd(date, -1);
    slot = 95;
  }
  return "unknown";
}

export interface RestClassification {
  minutes: number;
  type: RestType;
  label: string;
  night: boolean;
}
/** Duration labels are derived; physical rest type remains an explicit recorded fact. */
export function classifyRest(
  s: Workspace,
  date: string,
  slot: number,
  asOf?: string,
): RestClassification {
  const origin = Date.parse(date + "T00:00:00Z") + slot * 900000;
  const cutoff = asOf ? Date.parse(asOf.replace(" ", "T") + ":00Z") : Infinity;
  const read = (at: number) => {
    const iso = new Date(at).toISOString(),
      day = iso.slice(0, 10);
    const i = Number(iso.slice(11, 13)) * 4 + Number(iso.slice(14, 16)) / 15;
    return { kind: activityAt(s, day, i), type: restTypeAt(s, day, i) };
  };
  const type = restTypeAt(s, date, slot);
  if (activityAt(s, date, slot) !== "rest" || origin >= cutoff)
    return { minutes: 0, type, label: "Rest", night: false };
  let start = origin,
    end = origin + 900000;
  for (let n = 0; n < 29 * 96; n++) {
    const c = read(start - 900000);
    if (c.kind !== "rest" || c.type !== type) break;
    start -= 900000;
  }
  for (let n = 0; n < 29 * 96 && end + 900000 <= cutoff; n++) {
    const c = read(end);
    if (c.kind !== "rest" || c.type !== type) break;
    end += 900000;
  }
  let night = false;
  for (
    let at = Math.floor(start / 86400000) * 86400000 - 86400000;
    at < end;
    at += 86400000
  )
    if (
      Math.min(end, at + 32 * 3600000) - Math.max(start, at + 22 * 3600000) >=
      7 * 3600000
    )
      night = type === "stationary";
  const minutes = (end - start) / 60000;
  return {
    minutes,
    type,
    night,
    label:
      type === "unknown"
        ? "Rest · confirm type"
        : type === "sleeper-moving"
          ? "Moving sleeper rest"
          : minutes >= 1440
            ? "24-hour rest"
            : night
              ? "Night rest"
              : minutes >= 420
                ? "Major stationary rest"
                : "Rest break",
  };
}
