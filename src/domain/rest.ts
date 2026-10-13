import { type RestType, type Workspace } from "./model";
import { dateAdd } from "./time";
import { buildTimeline, boundary } from "./timeline";
import { restLabel } from "./qualifications";

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
  const type = restTypeAt(s, date, slot);
  const lastDate=Object.keys(s.days).filter(d=>d>=date).sort().at(-1) || date;
  const t=buildTimeline(s,asOf || lastDate+"T24:00");
  const p=s.days[date]?.profile || s.profile, origin=boundary(date,slot,p.zone);
  const r=t.runs.find(r=>r.kind==="rest" && r.start<=origin && r.end>origin);
  return r ? restLabel(r.start,r.end,r.rest,p.zone,r.profile) : {minutes:0,type,label:"Rest",night:false};
}
