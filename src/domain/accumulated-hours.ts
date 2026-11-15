import type {Workspace,Profile} from "./model";
import type {RuleReport} from "./rules";
import {tableFor,operatingRules,LONG_NIGHT_LIMIT} from "./catalogue";
import {buildTimeline,counted,incomplete} from "./timeline";
import {dateAdd,instantFor} from "./time";

export interface AccumulatedHoursRow {
  date:string;
  work:number;
  accumulated:number;
  remaining:number|null;
  hasHistory:boolean;
  longNightUsed:number|null;
  longNightLeft:number|null;
}
export interface AccumulatedHoursTable {
  mode:string;
  limit:number|null;
  rows:AccumulatedHoursRow[];
  isBfmSolo:boolean;
}
/** Compact 14-calendar-day lookback for the Stats screen.
 * The legal 14-day anchored limit and all other requirements continue
 * to be calculated by analyse(), not by this informational table.
 * Unknown earlier history never becomes a false Work allowance.
 */
export function accumulatedHoursTable(s:Workspace,report:RuleReport,p:Profile):AccumulatedHoursTable {
 const isBfmSolo=p.scheme==="BFM"&&!p.twoUp;
 const rule=tableFor(p).find(r=>r.minutes===20160);
 const limit=operatingRules(p)==="HVNL"?rule?.limit??null:null;
 const mode=p.scheme+" "+(p.twoUp?"Two-up":"Solo");
 const cutoff=instantFor(report.assessedThrough.slice(0,10),report.assessedThrough.slice(11,16),p.zone).at(-1);
 if(cutoff===undefined) return {mode,limit,rows:[],isBfmSolo};
 const timeline=buildTimeline(s,report.assessedThrough.replace(" ","T"),cutoff,cutoff);
 const days=report.days.slice(-14);
 const last=days.at(-1)?.date;
 const rows=days.map(d=>{
  const end=instantFor(dateAdd(d.date,1),"00:00",p.zone)[0];
  const dayStart=instantFor(d.date,"00:00",p.zone)[0];
  const start=instantFor(dateAdd(d.date,-13),"00:00",p.zone)[0];
  const through=Math.min(end,cutoff);
  const work=through>dayStart?counted(timeline.runs,dayStart,through,"work"):0;
  const accumulated=through>start?counted(timeline.runs,start,through,"work"):0;
  const hasHistory=through>start&&!incomplete(timeline.runs,start,through)
    &&timeline.runs.length>0&&timeline.runs[0].start<=start;
  const remaining=limit===null?null:accumulated>limit?0:hasHistory?limit-accumulated:null;
  // 7-day long/night accounting depends on overlapping NHVR windows.
  // This report only proves the selected assessment's value; never invent
  // historical values for earlier days from simple midnight totals.
  const currentLn=isBfmSolo && d.date===last;
  const longNightUsed=currentLn?report.longNight:null;
  const longNightLeft=currentLn?Math.max(0,LONG_NIGHT_LIMIT-report.longNight):null;
  return {date:d.date,work,accumulated,remaining,hasHistory,longNightUsed,longNightLeft};
 });
 return {mode,limit,rows,isBfmSolo};
}
