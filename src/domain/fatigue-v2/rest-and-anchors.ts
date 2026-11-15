import {civil,dateAdd,instantFor,MINUTE} from "../time";
import {countRest, type TimelineRun} from "../timeline";
import type {RestObligation,WindowRule} from "./types";

export interface RestEpisode {start:number;end:number;physical:TimelineRun["rest"];known:boolean;}
/** Merge actual continuous Rest even when it crosses midnight or an hours-option
 * transition; never merge through intervening Work or missing records. */
export function restEpisodesV2(runs:readonly TimelineRun[]):RestEpisode[]{
 const episodes:RestEpisode[]=[];
 for(const r of runs){
  if(r.kind!=="rest")continue;
  const known=!r.review&&!r.clock;
  const last=episodes.at(-1);
  if(last&&last.end===r.start&&last.physical===r.rest&&last.known===known) last.end=r.end;
  else episodes.push({start:r.start,end:r.end,physical:r.rest,known});
 }
 return episodes;
}
function intersect(a:number,b:number,c:number,d:number){return Math.max(0,Math.min(b,d)-Math.max(a,c));}
export function continuousRest(runs:readonly TimelineRun[],start:number,end:number,allowSleeper=false):number {
 return restEpisodesV2(runs).filter(r=>r.known&&(r.physical==="stationary"||(allowSleeper&&r.physical==="sleeper-moving")))
  .reduce((longest,r)=>Math.max(longest,countRest(intersect(start,end,r.start,r.end)/MINUTE)),0);
}
export function shortRestMinutes(runs:readonly TimelineRun[],start:number,end:number):number {
 return restEpisodesV2(runs).filter(r=>r.known)
  .reduce((total,r)=>{const n=countRest(intersect(start,end,r.start,r.end)/MINUTE);return total+(n>=15?n:0);},0);
}
export function hasUncertainRest(runs:readonly TimelineRun[],a:number,b:number):boolean {
 return runs.some(r=>r.start<b&&r.end>a&&(r.kind===null||r.review||r.clock
   ||r.kind==="rest"&&r.rest==="unknown"));
}
export function nightEventsV2(runs:readonly TimelineRun[],a:number,b:number,zone:string){
 const candidates:Array<{start:number;end:number;day:string}>=[];
 for(const rest of restEpisodesV2(runs)){
  if(!rest.known||rest.physical!=="stationary")continue;
  const s=Math.max(rest.start,a),e=Math.min(rest.end,b);
  if(e-s<420*MINUTE)continue;
  // Seven continuous hours contained in the base-time 22:00–08:00 band.
  for(let day=dateAdd(civil(s,zone).date,-1);day<=civil(e,zone).date;day=dateAdd(day,1)){
    const nightStart=instantFor(day,"22:00",zone)[0];
    const nightEnd=instantFor(dateAdd(day,1),"08:00",zone)[0];
    const left=Math.max(s,nightStart),right=Math.min(e,nightEnd);
    if(right-left>=420*MINUTE)candidates.push({start:left,end:left+420*MINUTE,day});
  }
  // Every separate 24h continuous stationary Rest can qualify as a night break.
  for(let from=s;from+1440*MINUTE<=e;from+=1440*MINUTE)
    candidates.push({start:from,end:from+1440*MINUTE,day:civil(from,zone).date});
 }
 candidates.sort((x,y)=>x.end-y.end||x.start-y.start);
 const result:typeof candidates=[];
 for(const item of candidates)if(!result.length||result.at(-1)!.end<=item.start)result.push(item);
 return result;
}
export function consecutiveNightPair(events:ReturnType<typeof nightEventsV2>){
 const dates=new Set(events.map(x=>x.day));
 return [...dates].some(d=>dates.has(dateAdd(d,1)));
}
export function stationaryTwentyFours(runs:readonly TimelineRun[],a:number,b:number){
 const result:Array<{start:number;end:number}>=[];
 for(const r of restEpisodesV2(runs)){
  if(!r.known||r.physical!=="stationary")continue;
  const start=Math.max(a,r.start),end=Math.min(b,r.end);
  for(let t=start;t+1440*MINUTE<=end;t+=1440*MINUTE)result.push({start:t,end:t+1440*MINUTE});
 }
 return result;
}
/** Weekly Two-up requires one continuous 24h stationary Rest PLUS another
 * 24h stationary Rest in blocks >=7h. No time may satisfy both obligations.
 * Try each quarter-hour boundary for the reserved 24h within actual long Rest. */
export function twoUpWeeklyRest(runs:readonly TimelineRun[],a:number,b:number){
 const episodes=restEpisodesV2(runs).filter(r=>r.known&&r.physical==="stationary")
  .map(r=>({start:Math.max(a,r.start),end:Math.min(b,r.end)})).filter(r=>r.end>r.start);
 for(const main of episodes){
  for(let reserveStart=main.start;reserveStart+1440*MINUTE<=main.end;reserveStart+=15*MINUTE){
   const reserveEnd=reserveStart+1440*MINUTE;
   let other=0;
   for(const e of episodes){
    for(const block of [{a:e.start,b:Math.min(e.end,reserveStart)},{a:Math.max(e.start,reserveEnd),b:e.end}]){
     const mins=countRest(Math.max(0,block.b-block.a)/MINUTE);
     if(mins>=420)other+=mins;
    }
   }
   if(other>=1440)return true;
  }
 }
 return false;
}
export function restRequirementV2(runs:readonly TimelineRun[],a:number,b:number,rule:WindowRule,zone:string){
 const rest=rule.rest;
 if(rest==="none")return {satisfied:true,amount:0,uncertain:false};
 if(rest.startsWith("short-")){
  const amount=shortRestMinutes(runs,a,b);
  return {satisfied:amount>=rule.minimumRestMinutes,amount,uncertain:false};
 }
 if(rest==="stationary"||rest==="stationary-or-approved-moving-sleeper"){
  const amount=continuousRest(runs,a,b,rest==="stationary-or-approved-moving-sleeper");
  const unknown=hasUncertainRest(runs,a,b);
  return {satisfied:amount>=rule.minimumRestMinutes,amount,uncertain:unknown};
 }
 if(rest==="two-up-seven-day"){
  return {satisfied:twoUpWeeklyRest(runs,a,b),amount:0,uncertain:hasUncertainRest(runs,a,b)};
 }
 const nights=nightEventsV2(runs,a,b,zone),pair=consecutiveNightPair(nights);
 if(rest==="night-six")return {satisfied:nights.length>=6,amount:nights.length,uncertain:hasUncertainRest(runs,a,b)};
 if(rest==="night-four")return {satisfied:nights.length>=4,amount:nights.length,uncertain:hasUncertainRest(runs,a,b)};
 if(rest==="night-four-paired")return {satisfied:nights.length>=4&&pair,amount:nights.length,uncertain:hasUncertainRest(runs,a,b)};
 if(rest==="bus-28-day"){
  const hours=stationaryTwentyFours(runs,a,b).length;
  return {satisfied:hours>=4,amount:hours,uncertain:hasUncertainRest(runs,a,b)};
 }
 if(rest==="bfm-solo-fourteen"){
  const twentyFours=stationaryTwentyFours(runs,a,b);
  // 84h checkpoint is assessed separately. Two distinct 24h intervals are
  // required in this 14d period, in addition to the night-rest pattern.
  return {satisfied:twentyFours.length>=2&&nights.length>=4&&pair,
    amount:nights.length,uncertain:hasUncertainRest(runs,a,b)};
 }
 return {satisfied:false,amount:0,uncertain:true};
}
export function qualifiesAnchor(r:RestEpisode,rule:WindowRule,zone:string){
 if(!r.known||r.end-r.start<15*MINUTE)return false;
 const mins=countRest((r.end-r.start)/MINUTE);
 if(rule.anchor==="any-rest"||rule.anchor==="fallback-any-rest")return true;
 if(rule.anchor==="major-5")return mins>=300&&(r.physical==="stationary"||r.physical==="sleeper-moving");
 if(rule.anchor==="major-7")return mins>=420&&r.physical==="stationary";
 if(rule.anchor==="major-10")return mins>=600&&r.physical==="stationary";
 if(rule.anchor==="major-24")return mins>=1440&&r.physical==="stationary";
 if(rule.anchor==="night-or-24")
  return r.physical==="stationary"&&(mins>=1440||nightEventsV2([
    {start:r.start,end:r.end,kind:"rest",rest:r.physical,profile:{zone} as TimelineRun["profile"],review:false,clock:false}
   ],r.start,r.end,zone).length>0);
 return false;
}
/** Anchors are at the END of actual Rest breaks; every previously opened period
 * stays active to its natural deadline. Fallback uses ANY rest ending when no
 * qualifying major break was available over that counting duration. */
export function anchorsFor(runs:readonly TimelineRun[],rule:WindowRule,zone:string){
 const rest=restEpisodesV2(runs).filter(r=>r.known&&r.end-r.start>=15*MINUTE);
 const qualified=rest.filter(r=>qualifiesAnchor(r,rule,zone));
 const ends:number[]=[];
 for(const r of rest){
  const isQual=qualified.includes(r);
  const hasQualBefore=qualified.some(q=>q.end<=r.end&&q.end>r.end-rule.periodMinutes*MINUTE);
  if(isQual||!hasQualBefore)ends.push(r.end);
 }
 return [...new Set(ends)].sort((a,b)=>a-b);
}
