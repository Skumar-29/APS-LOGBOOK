import type { Workspace } from "./model";
import { analyse, selectWorkWindow, type RuleReport, type WorkWindow } from "./rules";
import { atBase, boundary, buildTimeline } from "./timeline";
import {tableFor} from './catalogue';
import { civil, MINUTE } from "./time";

export interface DiaryPlan {
  report: RuleReport;
  window: WorkWindow | null;
  breakDue: string | null;
  continuousUntil: string | null;
  warning: string | null;
  review: boolean;
  shortBreakUntil?:string|null;
  reviewReasons?:string[];
}
export function hasFutureWork(s:Workspace,date:string,now:number) {
  const d=s.days[date],last=d?.slots.lastIndexOf("work") ?? -1;
  return !!d && last>=0 && boundary(date,last+1,d.profile.zone)>now;
}
/** Explicit forecast: future grid facts are assumptions, never completed records.
 * Freeze a running timer at the real clock; it must not override planned breaks.
 */
export function planDiary(s:Workspace,date:string,now:number,actual:RuleReport,range=2):DiaryPlan|null {
  if(!hasFutureWork(s,date,now))return null;
  const d=s.days[date],end=boundary(date,96,d.profile.zone),asOf=date+"T24:00";
  const report=analyse(s,asOf,range,{now:end,liveThrough:now});
  const timeline=buildTimeline(s,asOf,end,now);
  const first=timeline.runs.find(r=>r.kind==="work"&&r.end>now&&r.start<end);
  let continuousUntil:string|null=null,shortBreakUntil:string|null=null;
  if(first) {
    const start=Math.max(now,first.start),c=civil(start,first.profile.zone);
    const prefix=start===now?actual:analyse(s,c.date+"T"+c.time,1,{now:start,liveThrough:now});
    if(prefix.nextBreak!==null) continuousUntil=atBase(start+prefix.nextBreak*MINUTE,first.profile.zone);
    else {
      const limit=tableFor(first.profile).find(r=>r.minutes<1440&&r.limit!==null)?.limit;
      if(limit!==null&&limit!==undefined)shortBreakUntil=atBase(Math.max(start,(first.countStart??first.start)+limit*MINUTE),first.profile.zone);
    }
  }
  const future=report.findings.filter(f=>f.at>=atBase(now,d.profile.zone)&&
    (f.severity==="breach"||f.code==="work-history")).sort((a,b)=>(a.instant??0)-(b.instant??0));
  const firstExcess=future.find(f=>f.severity==="breach"&&/^work-|^rest-\d+$|^long-night$/.test(f.code));
  const relevantStart=first?atBase(Math.max(now,first.start),first.profile.zone):atBase(now,d.profile.zone);
  const relevantWindows=report.workWindows.filter(w=>w.end>relevantStart);
  return {report,window:selectWorkWindow(relevantWindows,date) || null,breakDue:firstExcess?.at || null,
    continuousUntil,shortBreakUntil,warning:future[0]?.message || null,
    reviewReasons:report.issues.filter(x=>/history|earlier|Confirm|clock|certificate|rule change|AFM|ACH/i.test(x)),
    review:report.issues.some(x=>/history|earlier|Confirm|clock|certificate|rule change|AFM|ACH/i.test(x))};
}
