import type { Workspace } from "./model";
import type { WorkWindow, Check } from "./rules";
import { operatingRules } from "./catalogue";
import { buildTimeline, boundary } from "./timeline";
import { restEpisodes } from "./qualifications";
import { civil, instantFor, MINUTE, QUARTER } from "./time";

export interface ProtectedRest {
  deadline: number;
  latestStart: number;
  minutesToDeadline: number;
  /** Advisory only; selected Work is red only when the rule engine confirms
   * that the complete planned counting period cannot contain its required Rest. */
  slots: Record<number, "reserve"|"conflict">;
}

function stamp(value: string,zone:string) {
  return instantFor(value.slice(0,10),value.slice(11,16),zone).at(-1);
}

/** Advisory based only on established, unambiguous major-Rest counting windows.
 * Does not modify records, reset a period, or claim uncertain time is compliant.
 * Slot colours are for planning; the rule engine alone identifies confirmed breaches.
 */
export function protectedRest(s: Workspace, date: string, windows: WorkWindow[], now=Date.now(), checks:Check[]=[]): ProtectedRest|null {
  const p=s.days[date]?.profile||s.profile;
  const today=civil(now,p.zone).date;
  // On a future page the baseline is midnight, so only windows already open
  // at the start of that page are considered for protection.
  if(!["Standard","BFM"].includes(p.scheme) || operatingRules(p)!=="HVNL" ||
    date<today || !s.days[date]) return null;
  const baseline=date===today?now:boundary(date,0,p.zone);
  const startOfDay=boundary(date,0,p.zone),endOfDay=boundary(date,96,p.zone);
  if(!Number.isFinite(startOfDay)||!Number.isFinite(endOfDay)) return null;
  const eligible24=windows.filter(w=>w.established&&!w.review && w.unknown===0 && w.zone===p.zone
    && w.requiredRest===(p.twoUp?(p.scheme==="Standard"?300:0):420) && w.requiredRest>0
    && w.limit!==null && w.end>w.start).map(w=>({
      start:w.start,end:w.end,requiredRest:w.requiredRest,duration:1440,stationaryOnly:!p.twoUp,
    }));
  // Two-up also has a compulsory continuous 10h stationary Rest every 52h
  // (Standard) or 82h (BFM); protect its last opportunity without suggesting
  // any invented 7h requirement for BFM Two-up's separate 24h work rule.
  const longLabel=p.twoUp ? p.scheme==="BFM"?"82h00m":"52h00m" : "";
  const eligibleLong=checks.filter(w=>w.label===longLabel && w.zone===p.zone
    && w.status!=="Needs review" && w.requiredRest===600 && w.end>w.start)
    .map(w=>({start:w.start,end:w.end,requiredRest:600,duration:p.scheme==="BFM"?4920:3120,stationaryOnly:true}));
  const eligible=[...eligible24,...eligibleLong];
  // Assess the saved plan through the page end. The running timer is still
  // limited to the baseline, so it does not create future recorded activity.
  const plan = buildTimeline(s, date + "T24:00", endOfDay, baseline);
  const restPeriods=restEpisodes(plan.runs).filter(rest=>!rest.review&&!rest.clock);
  const qualifies=(rest:(typeof restPeriods)[number],stationaryOnly:boolean)=>
    rest.rest==="stationary" || (!stationaryOnly && p.twoUp && p.scheme==="Standard" &&
      !!p.coDriver?.trim() && rest.rest==="sleeper-moving");
  const workStarts = new Set(plan.runs.filter((run) => run.kind === "work").map((run) => run.start));
  const opportunities:Array<{start:number;end:number;latest:number}>=[];
  for(const w of eligible){
    const a=stamp(w.start,p.zone),b=stamp(w.end,p.zone);
    if(a===undefined||b===undefined || a>baseline || b<=baseline || b-a!==w.duration*MINUTE) continue;
    const completedRest = restPeriods.some(rest=>qualifies(rest,w.stationaryOnly)
      && Math.min(rest.end,baseline,b)-Math.max(rest.start,a)>=w.requiredRest*MINUTE);
    // A selected restart can follow enough planned Rest before the deadline.
    // Keep the yellow reserve for an open-ended plan with no selected restart.
    const plannedRestart = restPeriods.some(rest=>qualifies(rest,w.stationaryOnly)
      && rest.end>baseline && rest.end<b && workStarts.has(rest.end)
      && rest.end-Math.max(rest.start,a)>=w.requiredRest*MINUTE);
    if (completedRest || plannedRestart) continue;
    const latest=b-w.requiredRest*MINUTE;
    if(latest>=endOfDay || b<=startOfDay)continue;
    opportunities.push({start:a,end:b,latest});
  }
  if(!opportunities.length)return null;
  opportunities.sort((a,b)=>a.end-b.end);
  const first=opportunities[0],slots:ProtectedRest["slots"]={};
  for(let i=0;i<96;i++){
    const a=boundary(date,i,p.zone),b=boundary(date,i+1,p.zone);
    if(!Number.isFinite(a)||!Number.isFinite(b) || b<=baseline)continue;
    if(opportunities.some(w=>b>w.latest&&a<w.end)) slots[i]=s.days[date].slots[i]==="work"?"conflict":"reserve";
  }
  return {deadline:first.end,latestStart:first.latest,minutesToDeadline:Math.max(0,Math.floor((first.end-baseline)/MINUTE)),slots};
}
