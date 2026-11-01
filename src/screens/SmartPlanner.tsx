import {useState} from "react";
import {useStore} from "../context";
import {forecastWork,type WorkForecast,optionClock} from "../domain/smart-forecast";
import {civil,dateAdd,displayCivil,minutesLabel} from "../domain/time";
import {Action,Field} from "../components/UI";

/** Compact optional planner. Hypothetical simulations never mutate saved records. */
export function SmartPlanner({date}:{date:string}){
  const {s}=useStore(),zone=(s.days[date]?.profile||s.profile).zone;
  const localNow=civil(Date.now(),zone);
  const quarter=Math.ceil(localNow.slot);
  const baseDate=date<localNow.date?localNow.date:date;
  const initialDate=baseDate===localNow.date&&quarter>=96?dateAdd(baseDate,1):baseDate;
  const [startDate,setStartDate]=useState(initialDate);
  const [startTime,setStartTime]=useState(localNow.date===initialDate ?
    String(Math.floor(quarter/4)).padStart(2,"0")+":"+String((quarter%4)*15).padStart(2,"0"):
    initialDate===date?"08:00":"00:00");
  const [length,setLength]=useState("6");
  const [result,setResult]=useState<WorkForecast|null>(null);
  const [error,setError]=useState("");
  const fmt=(at:number)=>displayCivil(optionClock(at,zone));
  const run=()=>{
    try{
      const mins=Number(length)*60;
      const next=forecastWork(s,startDate,startTime,mins);
      setError("");setResult(next);
    }catch(e){setResult(null);setError(e instanceof Error?e.message:String(e));}
  };
  const stale=result!==null&&result.assessedRevision!==s.revision;
  const good=result?.recommended?.evidence==="modelled";
  return <details className="smart-planner" aria-label="Plan the next job">
    <summary><strong>Plan next job</strong><span>Compare start times and Rest options</span></summary>
    <div className="smart-planner-body">
      <div className="smart-planner-inputs">
        <Field label="Job date" type="date" value={startDate} onChange={v=>{setStartDate(v);setResult(null);}}/>
        <Field label="Earliest start" type="time" step={900} value={startTime} onChange={v=>{setStartTime(v);setResult(null);}}/>
        <Field label="Work needed" value={length} options={[["1","1 hour"],["2","2 hours"],["3","3 hours"],["4","4 hours"],["5","5 hours"],["6","6 hours"],["7","7 hours"],["8","8 hours"],["10","10 hours"],["12","12 hours"]]}
          onChange={v=>{setLength(v);setResult(null);}}/>
      </div>
      <div className="row wrap">
        <Action primary onClick={run}>Compare schedules</Action>
        <span className="small">Planning only · never edits the diary</span>
      </div>
      {error&&<p className="warning-review" role="alert">{error}</p>}
      {result&&<>
        {stale&&<p className="warning-review" role="status">Diary changed. Recalculate before using these options.</p>}
        {result.options.length===0?<p className="small warning-review">{result.warning}</p>:<>
          <div className="smart-plan-options">
            {result.options.slice(0,1).map((opt,i)=><div className="smart-plan-option" key={"start"+i}>
              <strong>Start at your selected time</strong>
              <span>{fmt(opt.start)}</span>
              <small>{opt.continuousMinutes===opt.requestedMinutes?"Full proposed job can fit in the model":
                 minutesLabel(opt.continuousMinutes)+" before a detected limit"}{opt.firstConflict!==null?" · Limit near "+fmt(opt.firstConflict):""}
                 {" · "}{opt.evidence==="review"?"Needs review":opt.evidence==="conflict"?"Projected conflict":"No new red Work blocks"}</small>
            </div>)}
            {result.recommended&&result.recommended.start!==result.options[0]?.start&&
              <div className="smart-plan-option preferred">
                <strong>{good?"Earliest modelled full-job option":"Possible option · review first"}</strong>
                <span>Start {fmt(result.recommended.start)}</span>
                <small>Finish {fmt(result.recommended.finish)} · Rest longer by {minutesLabel(result.recommended.restBeforeMinutes)}</small>
              </div>}
          </div>
          <p className="small">{result.warning}</p>
          {result.options[0]?.evidence==="conflict"&&<p className="small">Starting earlier may require an interruption. Extending Rest could help you finish longer Work without that interruption.</p>}
        </>}
      </>}
    </div>
  </details>;
}
