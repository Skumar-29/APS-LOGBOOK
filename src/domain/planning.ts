import type { Workspace } from "./model";
import { analyse, selectWorkWindow, type RuleReport, type WorkWindow } from "./rules";
import { atBase, boundary, buildTimeline } from "./timeline";
import { civil, MINUTE } from "./time";

export interface DiaryPlan {
  report: RuleReport;
  window: WorkWindow | null;
  breakDue: string | null;
  continuousUntil: string | null;
  warning: string | null;
  review: boolean;
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
  let continuousUntil:string|null=null;
  if(first) {
    const start=Math.max(now,first.start),c=civil(start,first.profile.zone);
    const prefix=start===now?actual:analyse(s,c.date+"T"+c.time,1,{now:start,liveThrough:now});
    if(prefix.nextBreak!==null) continuousUntil=atBase(start+prefix.nextBreak*MINUTE,first.profile.zone);
  }
  const future=report.findings.filter(f=>f.at>=atBase(now,d.profile.zone)&&
    (f.severity==="breach"||f.code==="work-history")).sort((a,b)=>a.at.localeCompare(b.at));
  const firstExcess=future.find(f=>f.severity==="breach"&&/^work-|^rest-\d+$|^long-night$/.test(f.code));
  return {report,window:selectWorkWindow(report.workWindows,date) || null,breakDue:firstExcess?.at || null,
    continuousUntil,warning:future[0]?.message || null,review:report.issues.some(x=>/history|earlier|Confirm|clock|certificate|rule change|AFM|ACH/i.test(x))};
}
