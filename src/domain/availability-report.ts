import type {Workspace,Profile} from "./model";
import type {RuleReport} from "./rules";
import {drivingStatistics} from "./driving-statistics";
import {buildTimeline,atBase,counted,incomplete} from "./timeline";
import {restEpisodes} from "./qualifications";
import {dateAdd,instantFor,MINUTE,minutesLabel,displayCivil,civil} from "./time";
import {restRequirement,tableFor} from "./catalogue";

export type AvailabilityStatus = "Review required"|"No immediate limit identified"|"Rest required";
export interface AvailabilityMetric {label:string;used:string;limit:string;remaining:string;}
export interface AvailabilityRest {label:string;last:string;next:string;}
export interface EmployerAvailability {
  driver:string;scheme:string;base:string;zone:string;assessed:string;assessmentKind:string;
  status:AvailabilityStatus;start:string;workToBreak:string;nextBreak:string;breakBasis:string;
  metrics:AvailabilityMetric[];rests:AvailabilityRest[];
  midnightNight:string;nightRests:string;nightPair:string;two24:string;nightRelease:string;
  reviewReasons:string[];review:boolean;note:string;
}
const stamp=(value:string,zone:string)=>instantFor(value.slice(0,10),value.slice(11,16),zone).at(-1)??NaN;
const show=(value:string|null)=>value?displayCivil(value):"Not established";
const hours=(n:number|null)=>n===null?"Needs review":minutesLabel(n);
const number=(n:number|null,unverified:boolean)=>n===null?"Needs review":(unverified?"At least ":"")+hours(n);
const windowWork=(start:number,end:number,s:ReturnType<typeof buildTimeline>)=>start>=end?0:counted(s.runs,start,end,"work");
const nightWork=(start:number,end:number,zone:string,t:ReturnType<typeof buildTimeline>)=>{
  let total=0;
  for(let day=dateAdd(civil(start,zone).date,-1);day<=civil(end,zone).date;day=dateAdd(day,1)){
    const a=instantFor(day,"00:00",zone)[0],b=instantFor(day,"06:00",zone)[0];
    if(Number.isFinite(a)&&Number.isFinite(b))total+=windowWork(Math.max(start,a),Math.min(end,b),t);
  }
  return total;
};
function lastRest(t:ReturnType<typeof buildTimeline>,minutes:number,through:number,zone:string){
  const eligible=restEpisodes(t.runs).filter(r=>r.kind==="rest"&&r.rest==="stationary"&&!r.review&&!r.clock&&
    r.end-r.start>=minutes*MINUTE&&r.end<=through);
  const r=eligible.at(-1);
  return r?show(atBase(r.start,zone))+" - "+show(atBase(r.end,zone))+(r.end===through?" (at assessment)":""):"Not established";
}
function counted24(t:ReturnType<typeof buildTimeline>,start:number,end:number){
  return restEpisodes(t.runs).filter(r=>r.kind==="rest"&&r.rest==="stationary"&&!r.review&&!r.clock)
    .reduce((n,r)=>n+Math.floor(Math.max(0,Math.min(r.end,end)-Math.max(r.start,start))/(1440*MINUTE)),0);
}
/** Employer view is read-only. Never promote missing or unclassified Rest to a qualifying break.
 * A "next" timestamp is shown only when the rule engine has actually established one.
 */
export function employerAvailability(s:Workspace,r:RuleReport,p:Profile,now=Date.now()):EmployerAvailability{
  const d=drivingStatistics(s,r,p),zone=p.zone,through=stamp(r.assessedThrough,zone);
  if(!Number.isFinite(through))throw Error("Invalid shift assessment time.");
  const t=buildTimeline(s,r.assessedThrough,through,Math.min(now,through));
  const a7=through-7*24*60*MINUTE,a14=through-14*24*60*MINUTE;
  const missing7=incomplete(t.runs,a7,through);
  const review=d.historicalReview;
  const bfmSolo=p.scheme==="BFM"&&!p.twoUp;
  const activeAsOf=Math.abs(now-through)<=2*MINUTE;
  const assessmentKind=activeAsOf?"Current assessment":through>now?"Future assessment - not current eligibility":"Historical assessment - not current eligibility";
  const status:AvailabilityStatus=review||!activeAsOf||d.eligibleNow===null?"Review required":
    d.eligibleNow?"No immediate limit identified":"Rest required";
  const current=status==="No immediate limit identified";
  const restRequired=status==="Rest required";
  const controlling=tableFor(p).find(rule=>rule.label===r.controlling?.label);
  const nextRestBasis=controlling?restRequirement(controlling,p):"Check the controlling rest requirement";
  const active14=r.checks.filter(c=>c.label==="14 days"&&c.zone===zone&&
      stamp(c.start,zone)<=through&&stamp(c.end,zone)>through&&c.status!=="Needs review")
      .sort((a,b)=>a.remaining-b.remaining)[0];
  const start14=active14?stamp(active14.start,zone):a14;
  const twentyFour=counted24(t,start14,through);
  const metrics:AvailabilityMetric[]=[
    {label:"24h total Work",used:number(d.work24Used,review),limit:p.scheme==="BFM"?"14h":p.scheme==="Standard"?"12h":"Certificate",remaining:review?"Needs review":hours(d.work24Remaining)},
    {label:"7d total Work (recorded)",used:number(windowWork(a7,through,t),missing7),limit:bfmSolo?"No total-Work cap":"See hours option",remaining:bfmSolo?"Not applicable":hours(d.work7Remaining)},
    {label:"7d BFM long/night",used:bfmSolo?number(d.longNightUsed,review):"Not applicable",limit:bfmSolo?"36h":"Not applicable",remaining:bfmSolo?(review?"Needs review":hours(d.longNightRemaining)):"Not applicable"},
    {label:"14d total Work",used:number(d.work14Used,review),limit:p.scheme==="BFM"&&!p.twoUp?"144h":"See hours option",remaining:review?"Needs review":hours(d.work14Remaining)},
    {label:"84h major-Rest threshold",used:bfmSolo?number(d.work84Used,!r.checkpoint84?.exact):"Not applicable",limit:bfmSolo?"84h":"Not applicable",remaining:bfmSolo?(review||d.work84Remaining===null?"Needs review":hours(d.work84Remaining)):"Not applicable"}
  ];
  const next24=bfmSolo ? (!review&&d.work84Remaining!==null ?
    (d.work84Remaining===0?"24h stationary Rest required at 84h threshold":"After up to "+hours(d.work84Remaining)+" further Work (date not established)") :
    "24h Rest deadline needs history/shift review") :
    "Check the applicable hours option";
  const rests:AvailabilityRest[]=[
    {label:"7h continuous stationary",last:lastRest(t,420,through,zone),
      next:!review&&d.nextSevenHourRestStart?"Start by "+show(d.nextSevenHourRestStart)+"; finish by "+show(d.nextSevenHourRestEnd):
        "Next deadline not established"},
    {label:"24h continuous stationary",last:lastRest(t,1440,through,zone),next:next24},
    {label:"48h continuous stationary",last:lastRest(t,2880,through,zone),
      next:"No routine BFM due date; relevant when changing hours options"}
  ];
  const nightUsed=nightWork(a7,through,zone,t);
  const comments=[
    ...d.warnings,...r.issues.filter(x=>/history|rest|clock|rule change|certificate|accreditation/i.test(x))
  ].filter((x,i,a)=>a.indexOf(x)===i).slice(0,3);
  if(!activeAsOf)comments.unshift(assessmentKind);
  return {
    driver:p.name||"Not entered",scheme:p.scheme+(p.twoUp?" (two-up)":" (solo)"),
    base:p.base,zone,assessed:r.assessedThrough,assessmentKind,status,
    start:current?show(r.assessedThrough):restRequired?"Rest required; next start unverified":"Not verified",
    workToBreak:current?hours(d.canWorkMinutes):restRequired?"0h 00m":"Needs review",
    nextBreak:current&&d.nextBreakDue?show(d.nextBreakDue):restRequired?"Rest required now":"Not established",
    breakBasis:current?"Next restricting requirement: "+nextRestBasis+"; assumes Work begins at assessment":
      restRequired?"Rest needed before further Work; verify the restart time":
      "Do not roster from an unverified or historical assessment",
    metrics,rests,
    midnightNight:number(nightUsed,missing7)+" (past 168h; separate from BFM 36h cap)",
    nightRests:bfmSolo?(review?"Observed "+d.nightRests+"; verify / 4":d.nightRests+" of 4 qualifying"):"See hours option",
    nightPair:review?"Needs review":d.consecutivePairMet?"Recorded":"Not established",
    two24:bfmSolo?(active14?"Observed "+twentyFour+" of 2 x 24h within current 14d period; timing must be checked":
      "14d counting period not established; verify 2 x 24h rests"):"See hours option",
    nightRelease:"Not established without verified counting windows and future schedule",
    reviewReasons:comments,review:status==="Review required",
    note:"Work/Rest planning only - not authorisation to drive. Confirm actual conditions, rest type, BFM accreditation and NHVR rules."
  };
}
