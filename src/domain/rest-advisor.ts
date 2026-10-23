import { type Workspace } from "./model";
import { buildTimeline, countRest, type TimelineRun } from "./timeline";
import { nightEvents } from "./qualifications";
import { MINUTE, QUARTER, today } from "./time";

export type RestOpportunity={
  startedAt:number;
  assessedAt:number;
  completedMinutes:number;
  majorTargetMinutes:number;
  majorExtraMinutes:number;
  nightExtraMinutes:number|null;
  nightFinishAt:number|null;
  qualifiesNightNow:boolean;
};
/** Advisory only. Does not change the NHVR rolling window or grant permission to work.
 * Only current, recorded stationary Rest is eligible for a solo night/major-rest tip.
 */
export function restExtensionOpportunity(s:Workspace,date:string,now=Date.now()):RestOpportunity|null{
  const profile=s.days[date]?.profile||s.profile;
  if(today(profile.zone)!==date || profile.twoUp || !["Standard","BFM"].includes(profile.scheme))return null;
  if(!s.days[date])return null;
  const t=buildTimeline(s,date+"T24:00",now,now);
  const last=t.runs.at(-1);
  if(!last || last.kind!=="rest" || last.rest!=="stationary" || last.review || last.clock)return null;
  let first=last.start;
  for(let i=t.runs.length-2;i>=0;i--){
    const p=t.runs[i],next=t.runs[i+1];
    if(p.kind!=="rest" || p.rest!=="stationary" || p.review || p.clock || p.end!==next.start)break;
    first=p.start;
  }
  const completed=countRest((t.through-first)/MINUTE);
  if(completed<60 || completed>=1440)return null;
  const majorTargetMinutes=420;
  const majorExtraMinutes=Math.max(0,majorTargetMinutes-completed);
  const current:TimelineRun={...last,start:first,end:t.through,kind:"rest",rest:"stationary",review:false,clock:false};
  const qualifiesNightNow=nightEvents([current],first,t.through,profile.zone).length>0;
  let nightExtraMinutes:number|null=qualifiesNightNow?0:null;
  if(!qualifiesNightNow){
    for(let n=1;n<=96;n++){
      const end=t.through+n*QUARTER;
      if(nightEvents([{...current,end}],first,end,profile.zone).length){
        nightExtraMinutes=n*15;break;
      }
    }
  }
  // The advice is most useful while a break is close to a major/night qualification.
  if(majorExtraMinutes>180 && (nightExtraMinutes===null || nightExtraMinutes>180))return null;
  return {startedAt:first,assessedAt:t.through,completedMinutes:completed,
    majorTargetMinutes,majorExtraMinutes,nightExtraMinutes,
    nightFinishAt:nightExtraMinutes===null?null:t.through+nightExtraMinutes*MINUTE,qualifiesNightNow};
}
