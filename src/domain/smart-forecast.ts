import {analyse, type RuleReport} from "./rules";
import {clone,ensureDay,type Workspace} from "./model";
import {civil,instantFor,MINUTE,QUARTER} from "./time";

import {operatingRules,tableFor} from "./catalogue";

export interface WorkOption {
  start:number;
  finish:number;
  requestedMinutes:number;
  /** First newly breached selected Work block; null if no new red blocks. */
  firstConflict:number|null;
  continuousMinutes:number;
  restBeforeMinutes:number;
  evidence:"modelled"|"review"|"conflict";
  reason:string;
}
export interface WorkForecast {
  requestedMinutes:number;
  startFrom:number;
  options:WorkOption[];
  recommended:WorkOption|null;
  warning:string;
  assessedRevision:number;
}
const offsetMinutes=[0,30,60,90,120,150,180,240,300,360,420,480];
const reportReview=(r:RuleReport)=>r.issues.some(x=>/histor|earlier|rest type|clock|certificate|accreditation|rule change|operating|co-driver|24h rest|split rest|AFM|ACH/i.test(x));
/** Pure hypothetical overlay. Never writes paper pages, audits, invoices or records.
 * Only the existing NHVR rule engine judges proposed Work, with all prior windows
 * intact. A candidate with missing historical evidence is never called 'safe'.
 */
function simulate(s:Workspace,from:number,length:number,realNow:number,zone:string):{report:RuleReport;bad:number|null;overlap:boolean}{
  const c=clone(s),to=from+length*MINUTE;
  let overlap=false;
  for(let at=from;at<to;at+=QUARTER){
    const local=civil(at,zone);
    const slot=local.slot;
    if(!Number.isInteger(slot)||slot<0||slot>=96)throw Error("Clock transition needs manual review");
    const already=!!c.days[local.date];
    const d=ensureDay(c,local.date);
    if(!already)d.restDefault="unknown"; // Do not manufacture stationary rest in missing future history.
    if(d.slots[slot]==="work")overlap=true;
    d.slots[slot]="work";
  }
  const end=civil(to,zone);
  const report=analyse(c,end.date+"T"+end.time,21,{now:to,liveThrough:realNow});
  let bad:number|null=null;
  for(let at=from;at<to;at+=QUARTER){
    const p=civil(at,zone),key=p.date+":"+p.slot;
    if((report.breachSlots[key]||[]).length){bad=at;break;}
  }
  const confirmedBreach=report.findings.filter(f=>f.severity==="breach"&&
    (f.instant??-1)>=from && (f.instant??-1)<to).sort((a,b)=>(a.instant??0)-(b.instant??0))[0];
  if(confirmedBreach?.instant!==undefined)bad=bad===null?confirmedBreach.instant:Math.min(bad,confirmedBreach.instant);
  return {report,bad,overlap};
}
export function forecastWork(s:Workspace,date:string,time:string,jobMinutes:number,realNow=Date.now()):WorkForecast {
  const profile=s.days[date]?.profile||s.profile;
  if(!Number.isInteger(jobMinutes)||jobMinutes<15||jobMinutes>720||jobMinutes%15)
    throw Error("Choose a job between 15 minutes and 12 hours, in 15-minute steps.");
  const from=instantFor(date,time,profile.zone)[0];
  if(from===undefined)throw Error("Select a valid local start time; check daylight saving changes.");
  if(operatingRules(profile)!=="HVNL"||!tableFor(profile).length)
    return {requestedMinutes:jobMinutes,startFrom:from,options:[],recommended:null,warning:"Certificate-specific or non-HVNL hours need manual assessment.",assessedRevision:s.revision};
  if(profile.twoUp && (!profile.coDriver?.trim()||!profile.coLicence?.trim()))
    return {requestedMinutes:jobMinutes,startFrom:from,options:[],recommended:null,warning:"Confirm both two-up drivers before forecasting.",assessedRevision:s.revision};
  if(from < realNow-QUARTER)
    return {requestedMinutes:jobMinutes,startFrom:from,options:[],recommended:null,warning:"Choose a current or future time to plan the next job.",assessedRevision:s.revision};
  const options:WorkOption[]=[];
  const startDate=civil(from,profile.zone).date;
  const horizon=instantFor(startDate,"00:00",profile.zone)[0];
  if(horizon===undefined)throw Error("Check driver base time.");
  for(const delay of offsetMinutes) {
    const start=from+delay*MINUTE;
    // Keep forecasts within the next 28 days and do not cross an ambiguous clock.
    if(start>realNow+28*86400000)break;
    try{
      const result=simulate(s,start,jobMinutes,realNow,profile.zone);
      const reviewed=reportReview(result.report)||result.overlap;
      // First red Work block gives the continuous Work limit in this proposal.
      const continuous=Math.max(0,Math.min(jobMinutes,
        result.bad===null?jobMinutes:Math.floor((result.bad-start)/QUARTER)*15));
      const evidence=result.bad!==null?"conflict":reviewed?"review":"modelled";
      options.push({start,finish:start+jobMinutes*MINUTE,requestedMinutes:jobMinutes,
        firstConflict:result.bad,continuousMinutes:continuous,
        restBeforeMinutes:delay,evidence,
        reason:result.bad!==null?"Proposed Work reaches a fatigue breach.":reviewed?
          "History, rest classification or existing future Work needs review.":
          "No new breach detected in the proposed Work blocks; other real-world conditions still apply."});
    }catch(e){
      options.push({start,finish:start+jobMinutes*MINUTE,requestedMinutes:jobMinutes,
        firstConflict:null,continuousMinutes:0,restBeforeMinutes:delay,evidence:"review",
        reason:e instanceof Error?e.message:"Unable to assess this schedule."});
    }
  }
  // Prefer the earliest verified full-job schedule; otherwise an indicative
  // option that can finish, otherwise explain why the proposed job is limited.
  const verified=options.find(x=>x.evidence==="modelled"&&x.continuousMinutes===jobMinutes);
  const indicative=options.find(x=>x.evidence==="review"&&x.continuousMinutes===jobMinutes);
  const recommended=verified||indicative||null;
  return {requestedMinutes:jobMinutes,startFrom:from,options,
    recommended,warning:verified?"Compare alternatives and check actual fitness for duty.":
      indicative?"Potential schedule only. Resolve history and rest types before relying on it.":
      "No verified full-length option found in the next eight hours. Consider a shorter job or a longer qualifying Rest.",
    assessedRevision:s.revision};
}
export const optionClock=(at:number,zone:string)=>civil(at,zone).date+" "+civil(at,zone).time;
