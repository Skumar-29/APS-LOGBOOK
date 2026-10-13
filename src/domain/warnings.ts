import type {Check,RuleReport} from './rules';
import {displayCivil} from './time';
export function zoneLabel(zone?:string) {
  return zone==='Australia/Brisbane'?'QLD':zone==='Australia/Sydney'?'NSW':zone==='Australia/Melbourne'?'VIC':zone==='Australia/Adelaide'?'SA':zone==='Australia/Perth'?'WA':zone==='Australia/Darwin'?'NT':zone==='Australia/Hobart'?'TAS':zone||'base';
}
export function statusClass(status:Check['status']) {
  return status==='Exceeded'||status==='Rest due'?'bad':status==='Needs review'?'review':status==='Open period'?'open':'';
}
/** Keep the most recent instance of each warning and identify its actual date. */
export function warningLines(report:RuleReport,date?:string) {
  const selected=new Map<string,string>();
  const findings=report.findings.filter(f=>!date||f.date===date).sort((a,b)=>(a.instant??0)-(b.instant??0));
  for(const f of findings) {
    const prefix=f.severity==='review'?'Review: ':f.severity==='due'?'Now: ':'';
    selected.set(f.message,`${prefix}${f.message} · ${displayCivil(f.at)} ${zoneLabel(f.zone)}`);
  }
  if(!date)for(const issue of report.issues)if(!report.findings.some(f=>f.message===issue))selected.set(issue,issue);
  return [...selected.values()];
}
