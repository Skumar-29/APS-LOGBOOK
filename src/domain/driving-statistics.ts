import type {Workspace,Profile} from "./model";
import type {RuleReport,Check,WorkWindow} from "./rules";
import {selectCheckSummaries} from "./rules";
import {fatigueGuidance} from "./fatigue-guidance";
import {operatingRules,BFM_84_LIMIT} from "./catalogue";
import {buildTimeline,atBase} from "./timeline";
import {restEpisodes} from "./qualifications";
import {instantFor,MINUTE} from "./time";

export interface DrivingStatistics {
  eligibleNow:boolean|null;
  eligibilityText:string;
  canWorkMinutes:number|null;
  controllingReason:string;
  nextBreakDue:string|null;
  work24Used:number|null;
  work24Remaining:number|null;
  work7Used:number|null;
  work7Remaining:number|null;
  work84Used:number|null;
  work84Remaining:number|null;
  work14Used:number|null;
  work14Remaining:number|null;
  longNightUsed:number|null;
  longNightRemaining:number|null;
  nextSevenHourRestStart:string|null;
  nextSevenHourRestEnd:string|null;
  next24RestMessage:string;
  current14DayEnds:string|null;
  nightRestDue:string;
  consecutiveNightRestDue:string;
  nightRests:number;
  nightRestsRemaining:number;
  consecutivePairMet:boolean;
  nextHoursReleased:string;
  next14DayPeriod:string;
  lastFinishedWork:string;
  historicalReview:boolean;
  warnings:string[];
}

const stamp=(s:string,zone:string)=>
  instantFor(s.slice(0,10),s.slice(11,16),zone).at(-1)??NaN;
const format=(at:number,zone:string)=>Number.isFinite(at)?atBase(at,zone):null;
function active(checks:Check[],label:string,zone:string,through:number){
  return checks.filter(c=>c.label===label&&c.zone===zone&&stamp(c.start,zone)<=through&&
    stamp(c.end,zone)>through).sort((a,b)=>a.remaining-b.remaining)[0]||null;
}
function limitFor(check:Check|null){
  return check && check.limit!==null && check.status!=="Needs review" ?
    {used:check.work,left:Math.max(0,check.limit-check.work)} : null;
}
/** Read-only, evidence-based dashboard derived from the same timeline and RuleReport.
 * A 'not established' field must never be silently filled with a new allowance.
 */
export function drivingStatistics(s:Workspace,report:RuleReport,p:Profile):DrivingStatistics {
  const zone=p.zone,at=stamp(report.assessedThrough,zone),
    trustworthy=Number.isFinite(at)&&operatingRules(p)==="HVNL"&&
      (p.scheme==="Standard"||p.scheme==="BFM");
  const guidance=fatigueGuidance(report,p);
  const warnings=report.issues.filter(x=>/history|rest type|clock|scheme|rule change|accreditation|co-driver|operating rules|certificate|split rest/i.test(x));
  const historicalReview=!trustworthy||guidance.review||warnings.length>0;
  const checks=selectCheckSummaries(report.checks,report.assessedThrough,zone);
  const c24=active(checks,"1 day",zone,at),c14=active(checks,"14 days",zone,at);
  const c7=active(checks,"7 days",zone,at);
  const v24=limitFor(c24),v7=limitFor(c7),v14=limitFor(c14);
  const last24Known=!!report.majorRest && report.majorRest!=="Not established" &&
    !report.issues.some(x=>/24h rest history missing/.test(x));
  const bfmSolo=trustworthy&&p.scheme==="BFM"&&!p.twoUp;
  const allowance=trustworthy&&!historicalReview&&typeof report.nextBreak==="number"?report.nextBreak:null;
  const eligibleNow=allowance===null?null:allowance>0;
  const controllingReason=report.controlling
    ? report.controlling.label+(report.controlling.reason?" · "+report.controlling.reason:"")
    : "No controlling rule identified";
  const nextBreakDue=allowance!==null&&allowance>0&&allowance<1440 ?
    format(at+allowance*MINUTE,zone):null;
  const windows=report.workWindows.filter(w=>w.requiredRest===420&&w.established&&!w.review&&
    w.unknown===0&&w.zone===zone&&stamp(w.start,zone)<=at&&stamp(w.end,zone)>at);
  let latestStart:number|null=null,restEnd:number|null=null;
  if(trustworthy&&windows.length){
    const t=buildTimeline(s,report.assessedThrough,at,at);
    const stationary=restEpisodes(t.runs).filter(r=>r.rest==="stationary"&&!r.review&&!r.clock);
    for(const w of windows){
      const a=stamp(w.start,zone),b=stamp(w.end,zone);
      if(!Number.isFinite(a)||!Number.isFinite(b)||b-a!==1440*MINUTE)continue;
      const met=stationary.some(r=>Math.min(r.end,at,b)-Math.max(r.start,a)>=420*MINUTE);
      if(met)continue;
      if(restEnd===null||b<restEnd){restEnd=b;latestStart=b-420*MINUTE;}
    }
  }
  // NHVR requires required long rests to fit *inside* their relevant 7/14-day
  // counting period. The end of a period alone is not an independently safe
  // 'latest start' for those rests; do not invent that timestamp.
  const periodEnd=c14&&c14.status!=="Needs review"&&trustworthy?
    c14.end:null;
  const remainingNight=guidance.nightRestsRemaining;
  const pairRequired=p.twoUp&&p.scheme==="BFM" ? false : trustworthy;
  const next24RestMessage=bfmSolo ?
    report.checkpoint84 && report.checkpoint84.work>=BFM_84_LIMIT ? "24h stationary Rest required — 84h Work threshold reached" :
    !last24Known?"Review last qualifying 24h stationary Rest":
      report.workSince24>=BFM_84_LIMIT ?
        "24h stationary Rest required — 84h Work threshold reached":
        "24h stationary Rest: "+Math.max(0,Math.floor((BFM_84_LIMIT-report.workSince24)/60))+
        "h "+String((BFM_84_LIMIT-report.workSince24)%60).padStart(2,"0")+
        "m Work before the 84h threshold; check both 14-day Rest requirements"
    : trustworthy?"Check the required major Rest in the active 7/14-day period":
      "Hours option requires review";
  const nightRestDue=periodEnd && remainingNight>0 ?
    "Plan "+remainingNight+" qualifying night rest"+(remainingNight===1?"":"s")+" before "+periodEnd:
    remainingNight===0?"Recorded count met; check other active periods":"Night-rest deadline not established";
  const consecutiveNightRestDue=pairRequired&&!guidance.pairMet?
    periodEnd?"Consecutive-night pair needed before "+periodEnd:"Consecutive-night deadline not established":
    guidance.pairMet?"Qualifying consecutive-night pair recorded":pairRequired?"Needs review":"Not required for this hours option";
  return {
    eligibleNow,eligibilityText:eligibleNow===null?"Needs review":eligibleNow?"No immediate limit identified at selected time":"Rest required before further Work",
    canWorkMinutes:allowance,
    controllingReason:allowance===null?"Unverified history / rules — "+controllingReason:controllingReason,
    nextBreakDue,work24Used:v24?.used??null,work24Remaining:v24?.left??null,
    work7Used:v7?.used??null,work7Remaining:v7?.left??null,
    work84Used:bfmSolo?(report.checkpoint84?.work ?? (last24Known?report.workSince24:null)):null,
    work84Remaining:bfmSolo?(report.checkpoint84?.exact?Math.max(0,BFM_84_LIMIT-report.checkpoint84.work):report.checkpoint84&&report.checkpoint84.work>=BFM_84_LIMIT?0:last24Known&&!report.checkpoint84?Math.max(0,BFM_84_LIMIT-report.workSince24):null):null,
    work14Used:c14?.work??null,work14Remaining:v14?.left??null,
    longNightUsed:bfmSolo?guidance.longNightUsed:null,
    longNightRemaining:bfmSolo?guidance.longNightRemaining:null,
    nextSevenHourRestStart:latestStart===null?null:format(latestStart,zone),
    nextSevenHourRestEnd:restEnd===null?null:format(restEnd,zone),
    next24RestMessage,current14DayEnds:periodEnd,nightRestDue,consecutiveNightRestDue,
    nightRests:guidance.nightRests,nightRestsRemaining:remainingNight,
    consecutivePairMet:guidance.pairMet,
    nextHoursReleased:"Not established — requires confirmed future counting windows",
    next14DayPeriod:"Calculated after the next qualifying major/night Rest anchor",
    lastFinishedWork:report.lastWork,
    historicalReview,warnings
  };
}
