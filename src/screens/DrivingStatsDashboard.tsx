import type {Workspace,Profile} from "../domain/model";
import type {RuleReport} from "../domain/rules";
import {drivingStatistics} from "../domain/driving-statistics";
import {displayCivil,minutesLabel,instantFor} from "../domain/time";
import {Action,Field,Fold} from "../components/UI";
import {zoneLabel} from "../domain/warnings";

function Metric({label,value,detail}:{label:string;value:string;detail?:string}){
  return <div className="driver-stats-row">
    <span>{label}</span><strong>{value}</strong>
    {detail&&<small>{detail}</small>}
  </div>;
}
const hours=(value:number|null)=>value===null?"Review":minutesLabel(value);
export function DrivingStatsDashboard({s,report,p,asOf,onAsOf,onNow}:{
  s:Workspace;report:RuleReport;p:Profile;asOf:string;
  onAsOf:(v:string)=>void;onNow:()=>void;
}){
  const model=drivingStatistics(s,report,p);
  const assessed=instantFor(report.assessedThrough.slice(0,10),report.assessedThrough.slice(11,16),p.zone).at(-1);
  const future=assessed!==undefined && assessed>Date.now();
  return <section className="card driver-stats-dashboard" aria-label="Driving eligibility and rolling fatigue statistics">
    <div className="row wrap">
      <h2>Driving eligibility</h2>
      <Action onClick={onNow}>Calculate as of now</Action>
    </div>
    <div className="row wrap driver-asof">
      <Field label="As of (base time)" value={asOf} onChange={onAsOf}/>
      <span className="small">Assessed {displayCivil(report.assessedThrough)} · {zoneLabel(p.zone)} time</span>
    </div>
    {future && <p className="driver-history-review">Future planning scenario: selected Work/Rest blocks are not confirmation that the activities have already happened.</p>}
    <h3>When can I work?</h3>
    <p className={"driver-work-status "+(model.eligibleNow===null?"review":model.eligibleNow?"ok":"bad")}>
      {model.eligibilityText}
    </p>
    <Metric label="Can work for (before next applicable limit)" value={hours(model.canWorkMinutes)}
      detail="Estimate at the selected assessment time, not guaranteed legal permission to drive"/>
    <Metric label="Reason / controlling requirement" value={model.controllingReason}/>
    <Metric label="Next limiting break or Work deadline" value={model.nextBreakDue?displayCivil(model.nextBreakDue):"Not established"}
      detail="Only shown when the controlling Work allowance has been established"/>
    <h3>Last day · 24-hour rules</h3>
    <Metric label="Work in active 24-hour period" value={hours(model.work24Used)}/>
    <Metric label="Remaining Work · 24 hours" value={hours(model.work24Remaining)}/>
    <Metric label="Latest start for seven-hour stationary Rest"
      value={model.nextSevenHourRestStart?displayCivil(model.nextSevenHourRestStart):"Not established"}/>
    <Metric label="Seven-hour Rest period deadline"
      value={model.nextSevenHourRestEnd?displayCivil(model.nextSevenHourRestEnd):"Not established"}/>
    <h3>Last week · major Rest and long/night Work</h3>
    {p.scheme==="Standard" && <>
      <Metric label="Work used · active 7-day period" value={hours(model.work7Used)}/>
      <Metric label="Remaining Work · 7-day limit" value={hours(model.work7Remaining)}/>
    </>}
    {p.scheme==="BFM"&&!p.twoUp && <>
      <Metric label="Work since qualifying 24-hour Rest" value={(report.checkpoint84&&!report.checkpoint84.exact&&model.work84Used!==null?"≥ ":"")+hours(model.work84Used)}
        detail={report.checkpoint84&&!report.checkpoint84.exact?"Recorded lower bound; earlier 24h stationary Rest is unconfirmed":undefined}/>
      <Metric label="Remaining before 84-hour Work threshold" value={hours(model.work84Remaining)}/>
      <Metric label="Long/night Work used · 7-day rule" value={hours(model.longNightUsed)}/>
      <Metric label="Long/night Work remaining · 36h cap" value={hours(model.longNightRemaining)}/>
    </>}
    <Metric label="Next required 24-hour Rest" value={model.next24RestMessage}/>
    <h3>Last 14 days · Work and night rests</h3>
    <Metric label="Work used · active 14-day period" value={hours(model.work14Used)}/>
    <Metric label="Remaining Work · 14-day limit" value={hours(model.work14Remaining)}/>
    <Metric label="Current 14-day period ends"
      value={model.current14DayEnds?displayCivil(model.current14DayEnds):"Not established"}/>
    <Metric label="Hours to be released" value={model.nextHoursReleased}/>
    <Metric label="Next 14-day period" value={model.next14DayPeriod}/>
    {(p.scheme==="Standard"||p.scheme==="BFM") && <Metric label="Night rests completed" value={model.nightRests+" / 4"}/> }
    {(p.scheme==="Standard"||p.scheme==="BFM") && <Metric label="Next night-rest requirement" value={model.nightRestDue}/> }
    {(p.scheme==="Standard"||p.scheme==="BFM") && <Metric label="Consecutive night-rest requirement" value={model.consecutiveNightRestDue}/> }
    <h3>Last finished Work</h3>
    <p className="small">{displayCivil(model.lastFinishedWork)}</p>
    {model.historicalReview && <p className="driver-history-review" role="status">
      <strong>History needs review.</strong> The app cannot confirm when it is safe to resume Work until missing or uncertain records are resolved.
    </p>}
    <Fold title="How these calculations work">
      <p className="small">Calculations share APS Logbook's NHVR fatigue engine. A 24-hour stationary break does not automatically restart every rolling period. Rest timing, activity type, historical records, and your hours option affect the result.</p>
      <p className="small">Where the engine cannot prove a future rest deadline, release time or eligibility, it shows Not established or Review instead of an invented time.</p>
      <p className="small">These are planning and checking aids, not an NHVR-approved Electronic Work Diary or legal clearance to drive.</p>
    </Fold>
  </section>;
}
