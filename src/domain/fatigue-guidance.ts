import type {Profile} from "./model";
import type {Check,RuleReport} from "./rules";
import {operatingRules,LONG_NIGHT_LIMIT} from "./catalogue";
import {selectCheckSummaries} from "./rules";

export interface FatigueGuidance {
  longNightUsed:number|null;
  longNightRemaining:number|null;
  work14Remaining:number|null;
  nightRests:number;
  nightRestsRemaining:number;
  pairMet:boolean;
  review:boolean;
  guidance:string[];
}

/** Read-only advice from exactly the same assessed rule report used by Diary/Stats.
 * Never resets a counter on midnight or after an arbitrary 24-hour rest.
 * This summary cannot grant permission to drive: any tighter rule still applies.
 */
export function fatigueGuidance(report:RuleReport,p:Profile):FatigueGuidance {
  const active=selectCheckSummaries(report.checks,report.assessedThrough,p.zone);
  const matching=(label:string):Check|null => {
    const c=active.find(c=>c.label===label&&c.zone===p.zone);
    if(!c || c.status==="Needs review" || c.end<=report.assessedThrough || c.limit===null) return null;
    return c;
  };
  const hvnl=operatingRules(p)==="HVNL" && (p.scheme==="Standard"||p.scheme==="BFM");
  const bfmSolo=hvnl&&p.scheme==="BFM"&&!p.twoUp;
  const longNightUsed=bfmSolo ? report.longNight : null;
  const longNightRemaining=longNightUsed===null?null:Math.max(0,LONG_NIGHT_LIMIT-longNightUsed);
  const c14=hvnl?matching("14 days"):null;
  const work14Remaining=c14?Math.max(0,(c14.limit||0)-c14.work):null;
  const nightRests=Math.max(0,report.nightRests);
  const nightRestsRemaining=hvnl?Math.max(0,4-nightRests):0;
  const pairMet=!!report.nightRestPair;
  const review=report.issues.some(x=>/incomplete history|Confirm rest type|rule change|accreditation|earlier records|operating rules|clock-change/i.test(x));
  const guidance:string[]=[];
  if(bfmSolo&&longNightRemaining!==null && longNightRemaining<=360){
    guidance.push(longNightRemaining===0?"36h long/night allowance reached — avoid further long/night Work until the counting window changes."
      : "Only "+Math.floor(longNightRemaining/60)+"h "+String(longNightRemaining%60).padStart(2,"0")+"m of BFM long/night allowance remains in the assessed window.");
  }
  if(hvnl && nightRestsRemaining>0) guidance.push(
    "Night rests: "+nightRests+"/4 in recent 14 days. Plan "+nightRestsRemaining+" more qualifying stationary night rest"+(nightRestsRemaining===1?"":"s")+".");
  if(hvnl && !pairMet && !(p.scheme==="BFM"&&p.twoUp))
    guidance.push("Consecutive-night pair not established — plan two qualifying night rests on consecutive nights.");
  if(review)guidance.push("History/rest types need review; allowances are indicative, not clearance to drive.");
  return {longNightUsed,longNightRemaining,work14Remaining,nightRests,nightRestsRemaining,pairMet,review,guidance};
}
