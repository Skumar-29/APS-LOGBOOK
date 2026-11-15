import {civil,MINUTE,QUARTER} from "../time";
import {counted,incomplete,countWork, type TimelineRun} from "../timeline";
import {operatingRules} from "../catalogue";
import type {Profile} from "../model";
import {policyFor} from "./registry";
import {anchorsFor,continuousRest,restEpisodesV2,hasUncertainRest,nightEventsV2,restRequirementV2,stationaryTwentyFours} from "./rest-and-anchors";
import type {DriverRules,RuleDecision,WindowRule} from "./types";

export interface V2Violation {
 start:number;end:number;at:number;message:string;ruleId:string;
 mode:DriverRules["id"];certainty:"breach"|"review"|"due";
 /** Selected Work in this region is red; Rest is never painted as breached Work. */
 colourFrom:number;colourUntil:number;
}
export interface V2Evaluation {
 decisions:RuleDecision[];
 violations:V2Violation[];
 issues:string[];
 currentMode:DriverRules|null;
 active:Array<RuleDecision & {mode:DriverRules["id"]}>;
 longNightMinutes:number;
 checkpoint84:{since:number;work:number;exact:boolean}|null;
}
const workMinutes=(runs:TimelineRun[],a:number,b:number)=>counted(runs,a,b,"work");
const known=(runs:TimelineRun[],a:number,b:number)=>!incomplete(runs,a,b)
  && !runs.some(r=>r.start<b&&r.end>a&&r.kind==="rest"&&r.rest==="unknown");
const workPieces=(runs:TimelineRun[],a:number,b:number)=>runs.filter(r=>r.kind==="work"&&r.end>a&&r.start<b&& !r.review&&!r.clock);
const format=(min:number)=>min%60===0?`${min/60}h`:`${Math.floor(min/60)}h ${min%60}m`;
function firstExcess(runs:TimelineRun[],a:number,b:number,limit:number){
 let total=0;
 for(const r of workPieces(runs,a,b)){
  const from=Math.max(a,r.start),end=Math.min(b,r.end);
  for(let t=from;t<end;t+=QUARTER) {
   const amount=countWork(Math.min(QUARTER,end-t)/MINUTE);
   total+=amount;
   if(total>limit)return t;
  }
 }
 return b;
}
function possibleContinuousRest(runs:TimelineRun[],a:number,b:number,deadline:number,rule:WindowRule){
 const rest=rule.rest==="stationary-or-approved-moving-sleeper";
 const taken=continuousRest(runs,a,b,rest);
 // If Rest is already in progress when the recorded horizon ends, the same
 // physical episode may continue into the future. Do not promise it will.
 const trailing=restEpisodesV2(runs).filter(r=>r.known&&r.end===b
  && (r.physical==="stationary"||rest&&r.physical==="sleeper-moving")).at(-1);
 const continued=trailing?Math.max(0,b-Math.max(a,trailing.start))/MINUTE+(deadline-b)/MINUTE:0;
 return Math.max(taken,continued,(deadline-b)/MINUTE);
}
export function nightWorkPackets(runs:TimelineRun[],zone:string){
 const parts=new Set<number>();
 for(const r of runs)if(r.kind==="work"&&!r.review&&!r.clock)
  for(let time=r.start;time<r.end;time+=QUARTER){
   const at=civil(time,zone),hour=Number(at.time.slice(0,2));
   if(hour>=0&&hour<6)parts.add(time);
  }
 return parts;
}
function longNightWork(runs:TimelineRun[],zone:string,through:number){
 const night=nightWorkPackets(runs,zone);
 const workQuarter=[...new Set(runs.filter(r=>r.kind==="work"&&!r.review&&!r.clock)
   .flatMap(r=>{const list:number[]=[];for(let t=r.start;t<r.end;t+=QUARTER)list.push(t);return list;}))].sort((a,b)=>a-b);
 const daily:WindowRule={id:"daily-24",periodMinutes:1440,maxWorkMinutes:840,minimumRestMinutes:420,
   rest:"stationary",anchor:"major-7"};
 const anchors=anchorsFor(runs,daily,zone);
 for(const a of anchors){
  let used=0;
  for(const t of workQuarter)if(t>=a&&t<a+1440*MINUTE) {
    used+=15;
    if(used>720)night.add(t);
  }
 }
 // A time that is both midnight Work and long Work counts ONCE.
 return night;
}
function addViolation(dest:V2Violation[],a:number,end:number,at:number,reason:string,rule:string,
 mode:DriverRules,certainty:V2Violation["certainty"],colourFrom:number,colourUntil:number){
 const key=rule+":"+a+":"+reason;
 if(dest.some(v=>v.ruleId+":"+v.start+":"+v.message===key))return;
 dest.push({start:a,end,at,message:reason,ruleId:rule,mode:mode.id,certainty,colourFrom,colourUntil});
}
function ruleCheck(runs:TimelineRun[],rule:WindowRule,a:number,through:number,mode:DriverRules,zone:string){
 const deadline=a+rule.periodMinutes*MINUTE,b=Math.min(deadline,through);
 const work=workMinutes(runs,a,b);
 const rest=restRequirementV2(runs,a,b,rule,zone);
 const unknown=!known(runs,a,b)||rest.uncertain;
 const durationCompleted=b>=deadline;
 let status:RuleDecision["status"]="open",reason="",breachAt:number|undefined;
 if(rule.maxWorkMinutes!==null && work>rule.maxWorkMinutes&&!incomplete(runs,a,b)){
  status="breach";reason=`${format(rule.periodMinutes)} Work cap exceeded`;
  breachAt=firstExcess(runs,a,b,rule.maxWorkMinutes);
 } else if(durationCompleted&&!rest.satisfied){
  if(unknown){status="review";reason="Earlier records or Rest classification need checking";}
  else{status="breach";reason=`${format(rule.minimumRestMinutes)} required Rest not met`;}
 } else if(!durationCompleted&&rule.minimumRestMinutes>0&&!rest.satisfied
   && (rule.rest==="stationary"||rule.rest==="stationary-or-approved-moving-sleeper")
   && possibleContinuousRest(runs,a,b,deadline,rule)<rule.minimumRestMinutes){
  if(unknown){status="review";reason="Confirm Rest before accepting further Work";}
  else{status="breach";reason=`${format(rule.minimumRestMinutes)} continuous Rest is no longer possible`;}
 } else if(unknown) {status="review";reason="Incomplete history or unconfirmed Rest type";}
 else if(durationCompleted) status="ok";
 return {ruleId:rule.id,start:a,end:deadline,assessedThrough:b,workMinutes:work,
  restMinutes:rest.amount,maxWorkMinutes:rule.maxWorkMinutes,minimumRestMinutes:rule.minimumRestMinutes,
  status,reason,breachAt,uncertain:unknown} satisfies RuleDecision;
}
function phasesOf(runs:TimelineRun[],through:number){
 const result:Array<{start:number;end:number;profile:Profile;mode:DriverRules|null}>=[];
 for(const r of runs){
  const mode=policyFor(r.profile);
  const last=result.at(-1);
  if(last&&last.end===r.start&&last.profile.scheme===r.profile.scheme
    &&last.profile.twoUp===r.profile.twoUp&&last.profile.zone===r.profile.zone)
    last.end=r.end;
  else result.push({start:r.start,end:r.end,profile:r.profile,mode});
 }
 if(!result.length) return [];
 result[result.length-1].end=Math.max(result.at(-1)!.end,through);
 return result;
}
/** Central engine v2. Computes independent rules but never mutates the diary.
 * A new break can open another overlapping period; an older open period
 * always remains enforceable up to its original deadline.
 */
export function evaluateNHVR(runs:TimelineRun[],through:number,profile:Profile):V2Evaluation{
 const decisions:RuleDecision[]=[],violations:V2Violation[]=[],issues:string[]=[];
 const phases=phasesOf(runs,through);
 const active:Array<RuleDecision & {mode:DriverRules["id"]}>=[];
 const currentMode=policyFor(profile);
 if(!currentMode || operatingRules(profile)!=="HVNL"){
  issues.push("Certificate-specific or non-HVNL rules require their own verified schedule");
 }
 for(const phase of phases){
  const mode=phase.mode;
  if(!mode||operatingRules(phase.profile)!=="HVNL")continue;
  const relevant=runs.filter(r=>r.end>phase.start-28*1440*MINUTE&&r.start<=phase.end);
  for(const rule of mode.windows){
   const anchorTimes=anchorsFor(relevant,rule,phase.profile.zone);
   // Missing preceding Rest is an uncertainty, not a new legal clock reset.
   if(!anchorTimes.length && relevant.some(r=>r.kind==="work"))
    anchorTimes.push(relevant.find(r=>r.kind==="work")!.start);
   for(const a of [...new Set(anchorTimes)]){
    const deadline=a+rule.periodMinutes*MINUTE;
    if(a>=through||deadline<=phase.start||a>phase.end||deadline<=runs[0]?.start)continue;
    const b=Math.min(deadline,through);
    if(!runs.some(r=>r.kind==="work"&&r.start<b&&r.end>Math.max(a,phase.start)))continue;
    const result=ruleCheck(runs,rule,a,through,mode,phase.profile.zone);
    const mixed=runs.some(r=>r.start<b&&r.end>a&&r.kind!==null&&
      (r.profile.zone!==phase.profile.zone||r.profile.scheme!==phase.profile.scheme||r.profile.twoUp!==phase.profile.twoUp));
    const established=anchorsFor(relevant,rule,phase.profile.zone).includes(a);
    if(mixed||!established) {
      if(result.status!=="breach"){result.status="review";result.reason=mixed?"Review change of hours option":"Earlier qualifying Rest not established";}
      result.uncertain=true;
    }
    decisions.push(result);
    if(deadline>through&&a<=through) active.push({...result,mode:mode.id});
    if(result.status==="breach"||result.status==="review"&&result.reason.startsWith("Earlier")){
      const reason=result.reason;
      const mandatory=rule.minimumRestMinutes>=300
        &&(rule.rest==="stationary"||rule.rest==="stationary-or-approved-moving-sleeper");
      const redFrom=result.breachAt??(mandatory?Math.max(a,deadline-rule.minimumRestMinutes*MINUTE):Math.max(a,b-QUARTER));
      const colourUntil=result.breachAt!==undefined?b:Math.min(b,deadline);
      if(result.status==="breach")addViolation(violations,a,deadline,result.breachAt??Math.max(a,b-1),
        reason,rule.id,mode,"breach",redFrom,colourUntil);
    }
   }
  }
 }
 // BFM Solo: max 36h of long/night work in an applicable 7-day period.
 let longNightMinutes=0;
 for(const phase of phases.filter(p=>p.mode?.id==="bfm-solo")){
  const selected=longNightWork(runs,phase.profile.zone,through);
  const fallback=phase.start;
  const relevantAnchors=anchorsFor(runs,{id:"ln7",periodMinutes:10080,maxWorkMinutes:2160,
    minimumRestMinutes:0,rest:"none",anchor:"fallback-any-rest"},phase.profile.zone);
  for(const a of relevantAnchors.length?relevantAnchors:[fallback]){
   if(a>=through || a+10080*MINUTE<phase.start)continue;
   const covered=[...selected].filter(x=>x>=a&&x<Math.min(through,a+10080*MINUTE)).sort((x,y)=>x-y);
   if(a<=through&&a+10080*MINUTE>through)longNightMinutes=Math.max(longNightMinutes,covered.length*15);
   if(covered.length*15>2160){
    const excess=covered[144];
    addViolation(violations,a,a+10080*MINUTE,excess,"36h long/night Work exceeded","long-night-7",
      phase.mode!,"breach",excess,Math.min(through,a+10080*MINUTE));
   }
  }
 }
 // 84h Work checkpoint: the FIRST 24h stationary break must occur no later
 // than 84h Work, and the fortnight also needs a DISTINCT second 24h break.
 let checkpoint84:V2Evaluation["checkpoint84"]=null;
 if(profile.scheme==="BFM"&&!profile.twoUp){
  const stationary=stationaryTwentyFours(runs,runs[0]?.start??through,through);
  const since=stationary.at(-1)?.end??runs[0]?.start??through;
  const work=workMinutes(runs,since,through);
  const exact=!!stationary.length&&!incomplete(runs,since,through);
  checkpoint84={since,work,exact};
  if(work>5040){
   const capAt=firstExcess(runs,since,through,5040);
   addViolation(violations,since,through,capAt,"84h Work since qualifying 24h stationary Rest exceeded",
      "bfm-84",policyFor(profile)!,"breach",capAt,through);
  }
  if(!exact)issues.push("BFM 84h checkpoint needs earlier verified 24h stationary Rest history");
 }
 if(!runs.length||incomplete(runs,Math.max(through-20160*MINUTE,runs[0].start),through))
  issues.push("Earlier diary records incomplete");
 if(profile.scheme==="BFM"&&(!profile.certificate||!profile.certificateExpiry||
   profile.certificateExpiry<civil(through,profile.zone).date))
  issues.push("Confirm BFM accreditation");
 if(profile.twoUp&&(!profile.coDriver?.trim()||!profile.coLicence?.trim()))
  issues.push("Confirm Two-up co-driver and licence");
 // Switching from AFM/ACH/exemptions to another mode requires 48h Rest.
 // Do not issue permission without a verified continuous 48h reset.
 for(let i=1;i<phases.length;i++){
  const old=phases[i-1],next=phases[i];
  if((old.profile.scheme==="AFM"||old.profile.scheme==="ACH")&&old.profile.scheme!==next.profile.scheme){
   if(!restEpisodesV2(runs).some(r=>r.known&&r.end<=next.start&&
     r.end-r.start>=2880*MINUTE))
    issues.push("48h Rest reset required after AFM/ACH before switching options");
  }
 }
 return {decisions,violations,issues:[...new Set(issues)],currentMode,active,longNightMinutes,checkpoint84};
}
