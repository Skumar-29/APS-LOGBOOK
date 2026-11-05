import type {Profile} from '../domain/model';
import type {RuleReport} from '../domain/rules';
import {cumulativeLimits} from '../domain/cumulative-limits';
import {minutesLabel,displayCivil} from '../domain/time';
export function CumulativeLimits({report,profile}:{report:RuleReport;profile:Profile}){
 const rows=cumulativeLimits(report,profile);
 if(!rows.length)return null;
 return <section className="cumulative-limits" aria-label="Cumulative work and breach totals">
  {rows.map(row=><div key={row.label} className={'cumulative-limit '+(row.status==='Exceeded'?'bad':row.status==='Review'?'warning-review':'')}>
   <span>{row.label}</span>
   <strong>{row.used===null?'Review':(row.lowerBound?'≥ ':'')+minutesLabel(row.used)} / {row.limit/60}h</strong>
   <small>{row.status==='Review'&&row.used!==null&&row.used>row.limit?'Recorded excess · review period':row.status==='Recorded'?'Recorded':row.status}
    {row.status==='Exceeded'&&row.used!==null?' · +'+minutesLabel(row.used-row.limit):''}</small>
   {row.since&&<small className="cumulative-range">From {displayCivil(row.since)}</small>}
  </div>)}
 </section>;
}
