import type { Workspace } from "./model";
import type { WorkWindow } from "./rules";
import { operatingRules } from "./catalogue";
import { buildTimeline, boundary } from "./timeline";
import { restEpisodes } from "./qualifications";
import { civil, instantFor, MINUTE, QUARTER } from "./time";

export interface ProtectedRest {
  deadline: number;
  latestStart: number;
  minutesToDeadline: number;
  /** Future Work that conflicts with the protective Rest window is a projection,
   * not a confirmed NHVR breach until the corresponding actual Work occurs. */
  slots: Record<number, "reserve"|"conflict">;
}

function stamp(value: string,zone:string) {
  return instantFor(value.slice(0,10),value.slice(11,16),zone).at(-1);
}

/** Advisory based only on established, unambiguous 24-hour counting windows.
 * Does not modify records, reset a period, or claim uncertain time is compliant.
 * Slot colours are for planning; the rule engine alone identifies confirmed breaches.
 */
export function protectedRest(s: Workspace, date: string, windows: WorkWindow[], now=Date.now()): ProtectedRest|null {
  const p=s.days[date]?.profile||s.profile;
  if(p.twoUp || !["Standard","BFM"].includes(p.scheme) || operatingRules(p)!=="HVNL" || civil(now,p.zone).date!==date || !s.days[date]) return null;
  const t=buildTimeline(s,date+"T24:00",now,now);
  const startOfDay=boundary(date,0,p.zone),endOfDay=boundary(date,96,p.zone);
  if(!Number.isFinite(startOfDay)||!Number.isFinite(endOfDay)) return null;
  const eligible=windows.filter(w=>w.established&&!w.review && w.unknown===0 && w.zone===p.zone
    && w.limit!==null && w.end>w.start && w.rest>=0);
  const opportunities:Array<{start:number;end:number;latest:number}>=[];
  for(const w of eligible){
    const a=stamp(w.start,p.zone),b=stamp(w.end,p.zone);
    if(a===undefined||b===undefined || a>now || b<=now || b-a!==24*60*MINUTE) continue;
    const fulfilled=restEpisodes(t.runs).some(r=>r.kind==="rest" && r.rest==="stationary"&&!r.review&&!r.clock
      && Math.min(r.end,now,b)-Math.max(r.start,a)>=420*MINUTE);
    if(fulfilled)continue;
    const latest=b-420*MINUTE;
    if(latest>=endOfDay || b<=startOfDay)continue;
    opportunities.push({start:a,end:b,latest});
  }
  if(!opportunities.length)return null;
  opportunities.sort((a,b)=>a.end-b.end);
  const first=opportunities[0],slots:ProtectedRest["slots"]={};
  for(let i=0;i<96;i++){
    const a=boundary(date,i,p.zone),b=boundary(date,i+1,p.zone);
    if(!Number.isFinite(a)||!Number.isFinite(b) || b<=now)continue;
    if(opportunities.some(w=>b>w.latest&&a<w.end)) slots[i]=s.days[date].slots[i]==="work"?"conflict":"reserve";
  }
  return {deadline:first.end,latestStart:first.latest,minutesToDeadline:Math.max(0,Math.floor((first.end-now)/MINUTE)),slots};
}
