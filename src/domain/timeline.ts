import { type Activity, type Day, type Profile, type RestType, type Workspace, profileOn, ruleProfileAt } from "./model";
import { civil, dateAdd, hhmm, instantFor, MINUTE, QUARTER, validDate } from "./time";
import { operatingRules } from "./catalogue";

export interface TimelineRun {
  start: number;
  end: number;
  kind: Activity;
  rest: RestType;
  profile: Profile;
  review: boolean;
  clock: boolean;
  countStart?: number;
}
export interface Timeline {
  runs: TimelineRun[];
  through: number;
  requestedDate: string;
  profile: Profile;
  clockReview: boolean;
}
export function atBase(at: number, zone: string) {
  const c = civil(at, zone);
  return `${c.date} ${c.time}`;
}
export function boundary(date: string, slot: number, zone: string) {
  if (slot === 96) return instantFor(dateAdd(date,1),"00:00",zone)[0];
  return instantFor(date,hhmm(slot),zone)[0];
}
export const countWork = (minutes: number) => Math.ceil(Math.max(0,minutes) / 15 - 1e-10) * 15;
export const countRest = (minutes: number) => Math.floor(Math.max(0,minutes) / 15 + 1e-10) * 15;

/** Cumulative credits round one continuous activity once, including across midnight. */
export function credit(r: TimelineRun, at: number) {
  const mins = (Math.min(r.end,Math.max(r.start,at)) - (r.countStart ?? r.start)) / MINUTE;
  return r.kind === "work" ? countWork(mins) : r.kind === "rest" ? countRest(mins) : 0;
}
export function counted(runs: TimelineRun[], a: number, b: number, kind: "work" | "rest") {
  return runs.reduce((n,r) => n + (r.kind === kind && r.end > a && r.start < b ? credit(r,b) - credit(r,a) : 0),0);
}
export function elapsed(runs: TimelineRun[], a: number, b: number, kind: Activity) {
  return runs.reduce((n,r) => n + (r.kind === kind ? Math.max(0, Math.min(b,r.end)-Math.max(a,r.start)) / MINUTE : 0),0);
}
export function incomplete(runs: TimelineRun[], a: number, b: number) {
  return runs.some(r => r.end > a && r.start < b && (r.kind === null || r.review));
}
export function sameRules(a: Profile, b: Profile) {
  return a.scheme === b.scheme && a.twoUp === b.twoUp && a.zone === b.zone && operatingRules(a) === operatingRules(b);
}

/** Read-only overlay. No saving, finishing timers, page allocation or audit writes. */
export function buildTimeline(s: Workspace, asOf: string, now = Date.now(), liveThrough = now): Timeline {
  const requestedDate = asOf.slice(0,10);
  if (!validDate(requestedDate) || !/^(?:[01]\d|2[0-3]|24):[0-5]\d$/.test(asOf.slice(11,16)) || (asOf.slice(11,13) === "24" && asOf.slice(14,16) !== "00"))
    throw Error("Choose a valid assessment time.");
  const profile = s.days[requestedDate]?.profile || profileOn(s,requestedDate);
  const times = asOf.slice(11,16) === "24:00" ? instantFor(dateAdd(requestedDate,1),"00:00",profile.zone) : instantFor(requestedDate,asOf.slice(11,16),profile.zone);
  if (!times.length) throw Error("This time is skipped by the clock change.");
  const requested = times.at(-1)!, through = Math.min(requested,now);
  const endDate = civil(through,profile.zone).date;
  // Retain the actual preceding 24h checkpoint; a fixed 28-day buffer must not reset 84h work.
  const firstDate = [dateAdd(endDate,-42), ...Object.keys(s.days).filter(d => d <= endDate),
    ...s.activities.filter(t=>t.start < through).map(t=>civil(t.start,t.zone).date),
    ...(s.timer && s.timer.start < through ? [civil(s.timer.start,s.timer.zone).date] : [])].sort()[0];
  const raw = new Map(s.activities.map(t=>[t.id,t]));
  const liveEnd = Math.min(through,liveThrough);
  const live = s.timer && s.timer.start < liveEnd ? {...s.timer,end:liveEnd} : null;
  if (live && through-live.start > 31*86400000) throw Error("Correct the timer start.");
  const parts: TimelineRun[] = [];
  let carry: RestType = "unknown", previousKind: Activity = null, previousEnd = 0;
  for (let date=firstDate; date<=dateAdd(endDate,1); date=dateAdd(date,1)) {
    const d=s.days[date], p=d?.profile || profileOn(s,date);
    const midnight=boundary(date,0,p.zone), next=boundary(date,96,p.zone);
    if (!Number.isFinite(midnight) || !Number.isFinite(next) || midnight >= through) continue;
    const clock = next-midnight !== 86400000;
    if (midnight !== previousEnd) {carry="unknown";previousKind=null;}
    const starts = d?.changes || {};
    let rest: RestType = previousKind === "rest" ? carry : "unknown";
    for (let at=midnight; at<Math.min(next,through); at+=QUARTER) {
      const slot=clock ? Math.floor(civil(at,p.zone).slot) : Math.round((at-midnight)/QUARTER);
      const kind=d ? d.slots[slot] === "work" ? "work" : "rest" : null;
      if (kind === "rest") {
        if (previousKind !== "rest") rest=d?.restDefault || "unknown";
        else if (slot === 0 && d?.restDefault && d.restDefault !== "unknown") rest=d.restDefault;
        if (starts[slot] && kind === "rest") rest=starts[slot].restType;
      } else rest="unknown";
      const end=Math.min(at+QUARTER,next,through);
      const candidates=(d?.timerMap?.[slot] || []).map(id=>raw.get(id)).filter((t): t is NonNullable<typeof t>=>!!t);
      if (live && live.start < end && live.end > at) candidates.push(live);
      const ruleCuts=(s.ruleChanges||[]).filter(c=>c.driverId===p.id).flatMap(c=>[c.from,...c.to===null?[]:[c.to]]).filter(t=>t>at&&t<end);
      const cuts=[...new Set([at,end,...ruleCuts,...candidates.flatMap(t=>[Math.max(at,t.start),Math.min(end,t.end)]).filter(t=>t>at&&t<end)])].sort((a,b)=>a-b);
      for (let i=1;i<cuts.length;i++) {
        const a=cuts[i-1], b=cuts[i], timer=candidates.filter(t=>t.start<=a && t.end>=b).at(-1);
        const mapped=candidates.some(t=>t!==live);
        // The old outward grid footprint is only a view; its padding is not extra work.
        const k=timer?.kind || (mapped ? "rest" : kind);
        const firstSlot=timer&&civil(timer.start,p.zone).date===date ? Math.floor(civil(timer.start,p.zone).slot) : 0;
        const override=timer&&timer!==live&&timer.kind==="rest" ? Object.values(starts).filter(c=>c.slot>=firstSlot&&c.slot<=slot&&d?.slots[c.slot]==="rest").sort((a,b)=>b.slot-a.slot)[0] : null;
        const recordedProfile=ruleProfileAt(s,a,timer===live ? timer.profile : p);
        const physical=k === "rest" ? timer ? override?.restType || timer.restType : mapped && kind === "work" ? d?.restDefault || "unknown" : rest : "unknown";
        // A moving sleeper is only potentially qualifying during two-up.
        // Keep the physical Rest minutes, but never credit an incorrectly
        // inherited solo sleeper entry as a qualifying major break.
        const eligiblePhysical=physical==="sleeper-moving" && !recordedProfile.twoUp ? "unknown" : physical;
        parts.push({start:a,end:b,kind:k,rest:eligiblePhysical,profile:recordedProfile,
          review:timer ? !!d?.review : !!d?.review || !!d?.clockReview, clock:timer ? false : clock});
      }
      carry=rest;previousKind=kind;previousEnd=end;
    }
  }
  parts.sort((a,b)=>a.start-b.start);
  const runs: TimelineRun[]=[];
  for (const p of parts) {
    // A missing date must never cover a recorded neighbouring page when its
    // base-zone midnight differs. Prefer recorded facts; retain real conflicts
    // for review rather than silently counting work twice.
    while(runs.length && p.start < runs.at(-1)!.end) {
      const prev=runs.at(-1)!;
      if(p.kind!==null && (prev.kind===null || prev.kind===p.kind)) {
        if(prev.start>=p.start) runs.pop();
        else {prev.end=p.start;break;}
      } else {
        if(prev.kind!==null && p.kind!==null){prev.review=true;p.review=true;}
        p.start=prev.end;break;
      }
    }
    const prev=runs.at(-1);
    if (p.end <= p.start) continue;
    if (prev && prev.end < p.start) runs.push({...p,start:prev.end,end:p.start,kind:null,rest:"unknown",review:true});
    const last=runs.at(-1);
    if (last && last.end === p.start && last.kind === p.kind && last.rest === p.rest && last.review === p.review && last.clock === p.clock && sameRules(last.profile,p.profile)) last.end=p.end;
    else runs.push({...p});
  }
  for (let i=0;i<runs.length;i++) runs[i].countStart=i>0 && runs[i-1].kind===runs[i].kind && runs[i-1].end===runs[i].start
    ? runs[i-1].countStart : runs[i].start;
  const cutoffProfile=s.days[endDate]?.profile || profileOn(s,endDate);
  return {runs,through,requestedDate,profile:ruleProfileAt(s,through,cutoffProfile),clockReview:times.length>1};
}

export interface DayFragment {start: number;end: number;kind: Activity;rest: RestType;work: number;restMinutes: number;startSlot: number;endSlot: number;profile:Profile;}
export interface DaySummary {
  date:string;work:number;rest:number;unknown:number;through:string;
  slots:Activity[];fractions:Array<{work:number;rest:number}>;fragments:DayFragment[];
}
export function summarizeDay(t: Timeline, date: string, p: Profile): DaySummary {
  const a=boundary(date,0,p.zone), end=boundary(date,96,p.zone), b=Math.max(a,Math.min(t.through,end));
  const fragments=t.runs.filter(r=>r.end>a&&r.start<b).map(r=>{
    const start=Math.max(a,r.start), finish=Math.min(b,r.end);
    const civilStart=civil(start,p.zone), civilEnd=civil(finish,p.zone);
    return {start,end:finish,kind:r.kind,rest:r.rest,profile:r.profile,work:r.kind === "work" ? credit(r,finish)-credit(r,start) : 0,
      restMinutes:r.kind === "rest" ? credit(r,finish)-credit(r,start) : 0,
      startSlot:civilStart.slot+(start%MINUTE)/(15*MINUTE),endSlot:civilEnd.date!==date ? 96 : civilEnd.slot+(finish%MINUTE)/(15*MINUTE)};
  });
  const fractions=Array.from({length:96},()=>({work:0,rest:0}));
  for(const f of fragments) for(let i=Math.floor(f.startSlot);i<Math.min(96,Math.ceil(f.endSlot));i++) {
    const n=Math.max(0,Math.min(i+1,f.endSlot)-Math.max(i,f.startSlot));
    if(f.kind === "work") fractions[i].work+=n;
    if(f.kind === "rest") fractions[i].rest+=n;
  }
  return {date,work:counted(t.runs,a,b,"work"),rest:counted(t.runs,a,b,"rest"),unknown:elapsed(t.runs,a,b,null),
    through:atBase(Math.min(t.through,end),p.zone),slots:fractions.map(f=>f.work>0 ? "work" : f.rest>0 ? "rest" : null),fractions,fragments};
}

/** A render/export view, never written back over the driver's original records. */
export function assessedDay(d: Day, summary: DaySummary | undefined): Day {
  if(!summary) return d;
  const periods:Array<{start:number;end:number;profile:Profile;fragments:DayFragment[]}>=[];
  for(const f of summary.fragments) {
    const last=periods.at(-1);
    if(last&&last.end===f.start&&sameRules(last.profile,f.profile)&&last.profile.operator===f.profile.operator&&last.profile.certificate===f.profile.certificate){last.end=f.end;last.fragments.push(f);}
    else periods.push({start:f.start,end:f.end,profile:f.profile,fragments:[f]});
  }
  return {...d,slots:summary.slots,profile:periods[0]?.profile||d.profile,calculatedTotals:{work:summary.work,rest:summary.rest},calculatedThrough:summary.through,
    calculatedFragments:summary.fragments,calculatedRulePeriods:periods};
}
