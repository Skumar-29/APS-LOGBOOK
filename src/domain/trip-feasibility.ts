import {analyse} from "./rules";
import {clone,ensureDay,type Workspace,type Profile} from "./model";
import {operatingRules,tableFor} from "./catalogue";
import {civil,instantFor,MINUTE,QUARTER} from "./time";

export type TripStatus="Possible — verify"|"Needs review"|"Estimate insufficient";
export interface PlannedTrip {
  status:TripStatus;
  startedAt:number;
  finishedAt:number;
  workMinutes:number;
  restMinutes:number;
  schedule:Array<{start:number;end:number;kind:"work"|"rest";major:boolean}>;
  reason:string;
  longNightUsed:number|null;
  nextMajorRest:string;
  revision:number;
}
const quarter=(n:number)=>Number.isFinite(n)&&n>=0&&n%15===0;
const attempts=[480,600,720,780];

/** A deliberately conservative, read-only search over simple duty/rest layouts.
 * Work/Rest totals alone do NOT certify a trip: each candidate is overlaid on
 * a CLONE and passed through the shared engine. Uncertain history cannot pass.
 * This is a scheduling aid, not an NHVR-approved compliance determination.
 */
export function assessTrip(s:Workspace,date:string,time:string,workMinutes:number,restMinutes:number,roundTrip=false,realNow=Date.now()):PlannedTrip {
  const p=s.days[date]?.profile||s.profile;
  const start=instantFor(date,time,p.zone)[0];
  if(start===undefined||!quarter(workMinutes)||!quarter(restMinutes)||workMinutes===0)
    throw Error("Enter valid quarter-hour Work/Rest estimates and a start time.");
  if(start<realNow-QUARTER)throw Error("Choose a current or future departure.");
  const neededWork=workMinutes*(roundTrip?2:1),availableRest=restMinutes*(roundTrip?2:1);
  if(neededWork>14*24*60||availableRest>14*24*60)
    throw Error("This estimate exceeds 14 days. Plan the trip in stages.");
  const finish=start+(neededWork+availableRest)*MINUTE;
  const fallback=(status:TripStatus,reason:string,segments:PlannedTrip["schedule"]=[],end=finish):PlannedTrip=>({
    status,startedAt:start,finishedAt:end,workMinutes:neededWork,restMinutes:availableRest,
    schedule:segments,reason,longNightUsed:null,nextMajorRest:"Review the relevant 7-day and 14-day rest periods",revision:s.revision
  });
  if(operatingRules(p)!=="HVNL"||!tableFor(p).length)
    return fallback("Needs review","AFM, ACH, exemptions and non-HVNL hours require their own certificate or rules assessment.");
  if(p.scheme==="BFM"&&(!p.certificate||!p.certificateExpiry||p.certificateExpiry<date))
    return fallback("Needs review","Confirm current BFM accreditation before forecasting.");
  if(p.twoUp&&(!p.coDriver?.trim()||!p.coLicence?.trim()))
    return fallback("Needs review","Record both Two-up drivers before assessing a journey.");
  // Four-hour work stages are separated by 15m breaks. Stages are divided by
  // the main stationary Rest, then surplus estimated Rest is assigned before
  // the second stage so overlapping 24-hour work caps are respected.
  const major=p.twoUp?(p.scheme==="BFM"?600:300):420;
  const stageCaps=attempts.filter(n=>n>0&&n<= (p.twoUp?840:p.scheme==="BFM"?840:720));
  const candidates:Array<{schedule:PlannedTrip["schedule"];report:ReturnType<typeof analyse>;overlap:boolean;unknown:boolean}>=[];
  for(const cap of stageCaps){
    const stages:number[]=[];
    for(let rem=neededWork;rem>0;rem-=Math.min(rem,cap))stages.push(Math.min(rem,cap));
    const smallBreaks=stages.reduce((n,v)=>n+(Math.ceil(v/240)-1)*15,0);
    const minimumRest=smallBreaks+Math.max(0,stages.length-1)*major;
    if(minimumRest>availableRest)continue;
    let excess=availableRest-minimumRest,at=start;
    const schedule:PlannedTrip["schedule"]=[];
    const push=(kind:"work"|"rest",minutes:number,majorRest=false)=>{
      if(minutes<=0)return;
      const prev=schedule.at(-1);
      if(prev&&prev.end===at&&prev.kind===kind&&prev.major===majorRest)prev.end+=minutes*MINUTE;
      else schedule.push({start:at,end:at+minutes*MINUTE,kind,major:majorRest});
      at+=minutes*MINUTE;
    };
    if(stages.length===1&&excess>0){push("rest",excess,true);excess=0;}
    for(let i=0;i<stages.length;i++){
      let remaining=stages[i];
      while(remaining>0){
        const length=Math.min(240,remaining);push("work",length);remaining-=length;
        if(remaining>0)push("rest",15);
      }
      if(i<stages.length-1){
        push("rest",major+(i===0?excess:0),true);
      }
    }
    if(at!==finish)continue;
    const overlay=clone(s);let overlap=false,unknown=false;
    for(const interval of schedule){
      for(let when=interval.start;when<interval.end;when+=QUARTER){
        const local=civil(when,p.zone),slot=local.slot;
        if(!Number.isInteger(slot)||slot<0||slot>=96){unknown=true;break;}
        const saved=overlay.days[local.date];
        if(saved?.profile.zone!==undefined&&saved.profile.zone!==p.zone){unknown=true;break;}
        if(saved?.slots[slot]==="work"||saved?.timerMap?.[slot]?.length)overlap=true;
        const d=ensureDay(overlay,local.date);
        d.restDefault="stationary";d.slots[slot]=interval.kind;
        if(interval.kind==="rest"&&(when===interval.start||slot===0))
          d.changes[slot]={slot,location:"",odometer:"",note:"",vehicle:d.vehicle,restType:"stationary"};
      }
      if(unknown)break;
    }
    if(unknown)continue;
    const endLocal=civil(at,p.zone);
    const report=analyse(overlay,endLocal.date+"T"+endLocal.time,14,{now:at,liveThrough:realNow});
    const bad=schedule.filter(x=>x.kind==="work").some(x=>{
      for(let time=x.start;time<x.end;time+=QUARTER){
        const t=civil(time,p.zone);
        if((report.breachSlots[t.date+":"+t.slot]||[]).length)return true;
      }
      return false;
    });
    if(!bad)candidates.push({schedule,report,overlap,unknown:false});
  }
  if(!candidates.length)return fallback("Estimate insufficient",
    "No compliant candidate was established within these estimated Rest hours. More rest, another departure, or an individual NHVR check may be required.");
  const good=candidates.find(c=>!c.overlap&&c.report.issues.length===0&&
    !c.report.findings.some(f=>f.severity==="breach"));
  const choice=good||candidates[0];
  const restPeriods=choice.schedule.filter(x=>x.kind==="rest"&&x.major);
  const longNight=p.scheme==="BFM"&&!p.twoUp?choice.report.longNight:null;
  return {
    status:good?"Possible — verify":"Needs review",startedAt:start,finishedAt:finish,
    workMinutes:neededWork,restMinutes:availableRest,schedule:choice.schedule,
    reason:good?
      "The proposed intervals show no detected breach in the available records. Confirm route time, fitness for duty, all rest classifications and any rest due after arrival.":
      "One proposed arrangement has no red Work blocks, but earlier records, rest classification or other requirements need review. This is not approval to drive.",
    longNightUsed:longNight,
    nextMajorRest:restPeriods.length?civil(restPeriods.at(-1)!.start,p.zone).date+" "+civil(restPeriods.at(-1)!.start,p.zone).time:
      "Confirm the next long Rest with the full counting-period history",
    revision:s.revision
  };
}
