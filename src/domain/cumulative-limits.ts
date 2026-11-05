import type {Profile} from './model';
import type {RuleReport} from './rules';
import {selectCheckSummaries} from './rules';
import {operatingRules,BFM_84_LIMIT,LONG_NIGHT_LIMIT} from './catalogue';
export interface CumulativeLimit {label:string;used:number|null;limit:number;lowerBound:boolean;status:'Exceeded'|'At limit'|'Recorded'|'Review';since?:string;end?:string;}
/** Display observed quantities separately from an unverified permission to work. */
export function cumulativeLimits(report:RuleReport,p:Profile):CumulativeLimit[]{
 if(operatingRules(p)!=='HVNL'||!['Standard','BFM'].includes(p.scheme))return [];
 const checks=selectCheckSummaries(report.checks,report.assessedThrough,p.zone);
 const c14=checks.find(c=>c.label==='14 days'&&c.zone===p.zone);
 const c7=checks.find(c=>c.label==='7 days'&&c.zone===p.zone);
 const rows:CumulativeLimit[]=[];
 const state=(used:number|null,limit:number,review=false):CumulativeLimit['status']=>review||used===null?'Review':used>limit?'Exceeded':used===limit?'At limit':'Recorded';
 if(p.scheme==='BFM'&&!p.twoUp){
  const c=report.checkpoint84;
  rows.push({label:'84h checkpoint',used:c?.work??null,limit:BFM_84_LIMIT,lowerBound:!c?.exact,since:c?.since,
   status:state(c?.work??null,BFM_84_LIMIT)});
  rows.push({label:'7d long/night',used:report.longNight,limit:LONG_NIGHT_LIMIT,lowerBound:false,
   status:state(report.longNight,LONG_NIGHT_LIMIT),since:report.longNightStart,end:report.longNightEnd});
 }else{
  rows.push({label:'7d Work',used:c7?.work??null,limit:c7?.limit??(p.twoUp?(p.scheme==='BFM'?4200:3600):4320),lowerBound:false,
   status:state(c7?.work??null,c7?.limit??4320,c7?.status==='Needs review'),since:c7?.start,end:c7?.end});
 }
 rows.push({label:'14d Work',used:c14?.work??null,limit:c14?.limit??(p.twoUp?(p.scheme==='BFM'?8400:7200):8640),lowerBound:false,
  status:state(c14?.work??null,c14?.limit??8640,c14?.status==='Needs review'),since:c14?.start,end:c14?.end});
 return rows;
}
