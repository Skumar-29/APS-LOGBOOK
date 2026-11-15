import {type Workspace,profileOn,ruleProfileAt} from "../model";
import {type TimelineRun,atBase,buildTimeline,boundary,elapsed,countWork,countRest,counted,summarizeDay} from "../timeline";
import {civil,dateAdd,instantFor,MINUTE,QUARTER,minutesLabel} from "../time";
import {restLabel} from "../qualifications";
import type {RestClassification} from "../rest";
import {evaluateNHVR} from "./evaluate";
import {policyFor} from "./registry";
import {restEpisodesV2,nightEventsV2,consecutiveNightPair} from "./rest-and-anchors";
import type {Check,Finding,RuleReport,WorkWindow} from "./contract";

export const RULE_VERSION="NHVR-WWD-2026-08-v2-alpha";
export const RULE_SOURCE="https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time";
const label=(n:number)=>n%1440===0?`${n/1440} day${n===1440?"":"s"}`:
  `${Math.floor(n/60)}h ${String(n%60).padStart(2,"0")}m`;
function legacyStatus(status:string,reason:string):Check["status"]{
 if(status==="review")return "Needs review";
 if(status==="open")return "Open period";
 if(status==="ok")return "Within work cap";
 return /work cap|hours work|84h|long\\/night/i.test(reason)?"Exceeded":"Rest due";
}
function pushSlot(target:Record<string,string[]>,key:string,reason:string){
 target[key]||=[];if(!target[key].includes(reason))target[key].push(reason);
}
export function selectCheckSummaries(checks:Check[],cutoff:string,zone:string){
 const stamp=(s:string,z:string)=>instantFor(s.slice(0,10),s.slice(11,16),z).at(-1)??0;
 const through=stamp(cutoff,zone),groups=new Map<string,Check[]>();
 for(const c of checks){const list=groups.get(c.label)||[];list.push(c);groups.set(c.label,list);}
 const priority={"Exceeded":4,"Rest due":3,"Needs review":2,"Open period":1,"Within work cap":0};
 return [...groups.values()].map(g=>{
  const active=g.filter(c=>stamp(c.end,c.zone||zone)>through);
  if(!active.length)return g.sort((a,b)=>stamp(b.end,b.zone||zone)-stamp(a.end,a.zone||zone))[0];
  return active.sort((a,b)=>priority[b.status]-priority[a.status]||a.remaining-b.remaining||b.start.localeCompare(a.start))[0];
 });
}
export function windowTotals(_s:Workspace,window:WorkWindow){
 return {work:window.work,rest:window.rest,unknown:window.unknown,review:window.review};
}
export function selectWorkWindow(windows:WorkWindow[],date:string){
 return windows.filter(w=>w.start.slice(0,10)<=date&&w.end>date+" 00:00").sort((a,b)=>
  Number(b.status==="Exceeded")-Number(a.status==="Exceeded")||
  Number(b.status==="Rest due")-Number(a.status==="Rest due")||
  a.remaining-b.remaining||Number(b.established)-Number(a.established)||b.start.localeCompare(a.start))[0];
}
/** Public adapter for existing UI/stats/export consumers. There is ONE engine
 * behind this API (v2); no hidden fallback to the previous fatigue rules. */
export function analyse(s:Workspace,asOf:string,range=14,options:{now?:number;liveThrough?:number}={}):RuleReport{
 const t=buildTimeline(s,asOf,options.now,options.liveThrough);
 const {runs,through,profile}=t;
 range=Math.min(28,Math.max(1,Math.floor(range)));
 const evaluation=evaluateNHVR(runs,through,profile);
 const breachSlots:Record<string,string[]>={},restSlots:Record<string,string[]>={};
 const findings:Finding[]=[];
 for(const v of evaluation.violations){
  const p=profile,at=atBase(v.at,p.zone);
  const finding={id:`${v.ruleId}:${v.start}:${v.end}:${v.mode}`,code:v.ruleId,message:v.message,
   severity:v.certainty==="breach"?"breach":"review",start:atBase(v.start,p.zone),
   end:atBase(v.end,p.zone),at,date:at.slice(0,10),zone:p.zone,instant:v.at} satisfies Finding;
  findings.push(finding);
  for(const r of runs){
   if(r.kind!=="work"||r.review||r.clock)continue;
   if(policyFor(r.profile)?.id!==v.mode)continue;
   const a=Math.max(r.start,v.colourFrom),b=Math.min(r.end,v.colourUntil);
   for(let now=a;now<b;now=Math.min(b,Math.floor(now/QUARTER)*QUARTER+QUARTER)){
    const local=civil(now,r.profile.zone);
    if(local.slot>=0&&local.slot<96)pushSlot(breachSlots,local.date+":"+Math.floor(local.slot),v.message);
   }
  }
 }
 const checks:Check[]=evaluation.decisions.map(d=>{
  const p=runs.find(r=>r.start<=d.start&&r.end>d.start)?.profile||profile;
  return {label:d.ruleId==="long-night-7"?"7 days long/night":label((d.end-d.start)/MINUTE),
   start:atBase(d.start,p.zone),end:atBase(d.end,p.zone),work:d.workMinutes,
   limit:d.maxWorkMinutes,rest:d.restMinutes,requiredRest:d.minimumRestMinutes,
   status:legacyStatus(d.status,d.reason),remaining:d.maxWorkMinutes===null?0:Math.max(0,d.maxWorkMinutes-d.workMinutes),
   date:civil(d.start,p.zone).date,reason:d.reason,
   assessedThrough:atBase(d.assessedThrough,p.zone),zone:p.zone,
   restSummary:d.reason||`${minutesLabel(d.restMinutes)} qualifying Rest`};
 });
 const workWindows:WorkWindow[]=evaluation.decisions.filter(d=>d.ruleId==="daily-24").map(d=>{
  const p=runs.find(r=>r.start<=d.start&&r.end>d.start)?.profile||profile;
  return {start:atBase(d.start,p.zone),end:atBase(d.end,p.zone),
   limit:d.maxWorkMinutes,established:!d.uncertain,assessedThrough:atBase(d.assessedThrough,p.zone),
   zone:p.zone,work:d.workMinutes,rest:counted(runs,d.start,d.assessedThrough,"rest"),
   requiredRest:d.minimumRestMinutes,remaining:d.maxWorkMinutes===null?0:Math.max(0,d.maxWorkMinutes-d.workMinutes),
   status:legacyStatus(d.status,d.reason),review:d.uncertain,
   unknown:elapsed(runs,d.start,d.assessedThrough,null)};
 });
 const days=[];
 for(let n=range-1;n>=0;n--){
  const date=dateAdd(t.requestedDate,-n);
  days.push(summarizeDay(t,date,s.days[date]?.profile||profileOn(s,date)));
 }
 const restClassifications:Record<string,RestClassification>={};
 const episodes=restEpisodesV2(runs);
 for(const day of days)for(let slot=0;slot<96;slot++){
  if(day.slots[slot]!=="rest")continue;
  const p=s.days[day.date]?.profile||profileOn(s,day.date);
  const when=boundary(day.date,slot,p.zone);
  const ep=episodes.find(e=>e.start<=when&&e.end>when);
  if(ep)restClassifications[day.date+":"+slot]=restLabel(ep.start,ep.end,ep.physical,p.zone,p);
 }
 const previousWork=runs.filter(r=>r.kind==="work"&&r.end<=through).at(-1);
 const majorLength=profile.twoUp?(profile.scheme==="BFM"?600:300):420;
 const major=episodes.filter(r=>r.known&&(r.physical==="stationary"||
   profile.twoUp&&profile.scheme==="Standard"&&r.physical==="sleeper-moving")&&
   r.end-r.start>=majorLength*MINUTE).at(-1);
 const nights=nightEventsV2(runs,through-20160*MINUTE,through,profile.zone);
 const lastStationary24=episodes.filter(r=>r.known&&r.physical==="stationary"&&r.end-r.start>=1440*MINUTE).at(-1);
 const workSince24=counted(runs,lastStationary24?.end??runs[0]?.start??through,through,"work");
 const currentBfm=profile.scheme==="BFM"&&!profile.twoUp;
 const issues=[...new Set([...evaluation.issues,...findings.filter(x=>x.severity!=="due").map(f=>f.message)])];
 // Unknown history, missing classifications and accreditation must never
 // be transformed into a green permission-to-drive forecast.
 const nextBreak:null=null,controlling:null=null,restartAt:null=null;
 return {breachSlots,restSlots,workWindows,checks,issues,findings,days,restClassifications,
  lastWork:previousWork?`${atBase(previousWork.start,previousWork.profile.zone)} — ${atBase(previousWork.end,previousWork.profile.zone)} · ${minutesLabel(countWork((previousWork.end-previousWork.start)/MINUTE))}`:
    "No completed work established",
  majorRest:major?`${atBase(major.start,profile.zone)} · ${minutesLabel(countRest((major.end-major.start)/MINUTE))}`:"Not established",
  nightRests:nights.length,nightRestPair:consecutiveNightPair(nights),
  longNight:evaluation.longNightMinutes,workSince24,nextBreak,restartAt,controlling,
  assessedThrough:atBase(through,profile.zone),source:RULE_SOURCE,version:RULE_VERSION,
  revision:s.revision,zone:profile.zone,
  checkpoint84:currentBfm&&evaluation.checkpoint84?{
    since:atBase(evaluation.checkpoint84.since,profile.zone),
    work:evaluation.checkpoint84.work,exact:evaluation.checkpoint84.exact}:undefined,
  longNightZone:profile.zone,
  longNightStart:atBase(through-10080*MINUTE,profile.zone),longNightEnd:atBase(through,profile.zone)};
}
