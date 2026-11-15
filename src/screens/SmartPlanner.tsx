import {useState} from "react";
import {useStore} from "../context";
import {forecastWork,type WorkForecast,optionClock} from "../domain/smart-forecast";
import {estimateMajorTrip,type MajorTripEstimate} from "../domain/major-trip";
import {uid} from "../domain/model";
import {civil,dateAdd,displayCivil,minutesLabel} from "../domain/time";
import {Action,Field} from "../components/UI";

/** Compact optional planner. Hypothetical simulations never mutate saved records. */
export function SmartPlanner({date}:{date:string}){
  const {s,mutate}=useStore(),zone=(s.days[date]?.profile||s.profile).zone;
  const localNow=civil(Date.now(),zone);
  const quarter=Math.ceil(localNow.slot);
  const baseDate=date<localNow.date?localNow.date:date;
  const initialDate=baseDate===localNow.date&&quarter>=96?dateAdd(baseDate,1):baseDate;
  const [startDate,setStartDate]=useState(initialDate);
  const [startTime,setStartTime]=useState(localNow.date===initialDate ?
    String(Math.floor(quarter/4)).padStart(2,"0")+":"+String((quarter%4)*15).padStart(2,"0"):
    initialDate===date?"08:00":"00:00");
  const [tripId,setTripId]=useState("");
  const [tripName,setTripName]=useState("Melbourne – Brisbane");
  const [tripWork,setTripWork]=useState("20");
  const [tripRest,setTripRest]=useState("12");
  const [tripMode,setTripMode]=useState<"one-way"|"return">("one-way");
  const [tripEstimate,setTripEstimate]=useState<MajorTripEstimate|null>(null);
  const [tripError,setTripError]=useState("");
  const trips=s.settings.majorTripPresets||[];
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
  const checkMajor=()=>{
    try {
      const e=estimateMajorTrip(s,{name:tripName.trim()||"Major trip",workHours:Number(tripWork),restHours:Number(tripRest)},tripMode,startDate,startTime);
      setTripEstimate(e);setTripError("");
    } catch(e){setTripEstimate(null);setTripError(e instanceof Error?e.message:String(e));}
  };
  const saveMajor=async()=>{
    const name=tripName.trim();
    if(!name){setTripError("Enter a trip name.");return;}
    const workHours=Number(tripWork),restHours=Number(tripRest);
    if(!(Number.isFinite(workHours)&&workHours>0&&workHours<=168&&workHours*4%1===0&&
      Number.isFinite(restHours)&&restHours>=0&&restHours<=168&&restHours*4%1===0)){
      setTripError("Enter quarter-hour Work and Rest estimates.");return;
    }
    const id=tripId||uid();
    await mutate(w=>{
      const entries=w.settings.majorTripPresets||[];
      w.settings.majorTripPresets=[...entries.filter(x=>x.id!==id),{id,name,workHours,restHours}];
    });
    setTripId(id);setTripError("");
  };
  const deleteMajor=async()=>{
    if(!tripId)return;
    await mutate(w=>{w.settings.majorTripPresets=(w.settings.majorTripPresets||[]).filter(x=>x.id!==tripId);});
    setTripId("");setTripEstimate(null);
  };
  const stale=result!==null&&result.assessedRevision!==s.revision;
  const good=result?.recommended?.evidence==="modelled";
  return <details className="smart-planner" aria-label="Plan the next job">
    <summary><strong>Plan next job</strong><span>Compare start times and Rest options</span></summary>
    <div className="smart-planner-body">
      <details className="major-trip-planner">
        <summary><strong>Major trips</strong> · One-way / return Work &amp; Rest estimate</summary>
        <div className="major-trip-body">
          <Field label="Saved major trip" value={tripId}
            options={[["","New trip"],...trips.map(x=>[x.id,x.name] as [string,string])]}
            onChange={id=>{
              setTripId(id);setTripEstimate(null);
              const p=trips.find(x=>x.id===id);
              if(p){setTripName(p.name);setTripWork(String(p.workHours));setTripRest(String(p.restHours));}
            }}/>
          <Field label="Trip name" value={tripName} onChange={v=>{setTripName(v);setTripEstimate(null);}}/>
          <div className="major-trip-fields">
            <Field label="Work hours · one way" type="number" min="0.25" step="0.25"
              value={tripWork} onChange={v=>{setTripWork(v);setTripEstimate(null);}}/>
            <Field label="Rest hours · one way" type="number" min="0" step="0.25"
              value={tripRest} onChange={v=>{setTripRest(v);setTripEstimate(null);}}/>
            <Field label="Trip type" value={tripMode}
              options={[["one-way","One way"],["return","Return trip"]]}
              onChange={v=>{setTripMode(v as "one-way"|"return");setTripEstimate(null);}}/>
          </div>
          <div className="row wrap major-trip-actions">
            <Action onClick={()=>void saveMajor()}>Save trip</Action>
            {tripId&&<Action onClick={()=>void deleteMajor()}>Remove saved trip</Action>}
            <Action primary onClick={checkMajor}>Check trip budget</Action>
          </div>
          <p className="small">Uses the departure date and time below. Rest must be scheduled in qualifying continuous breaks.</p>
          {tripError&&<p className="warning-review" role="alert">{tripError}</p>}
          {tripEstimate&&<div className="major-trip-result" role="status">
            <strong>{tripEstimate.name} · {tripEstimate.mode==="return"?"Return":"One way"}</strong>
            <div className="major-trip-fields">
              <span>Work <b>{minutesLabel(tripEstimate.totalWork)}</b></span>
              <span>Rest <b>{minutesLabel(tripEstimate.totalRest)}</b></span>
              <span>Elapsed <b>{minutesLabel(tripEstimate.elapsedMinutes)}</b></span>
            </div>
            <p>Depart {fmt(tripEstimate.start)} · Estimated finish <b>{fmt(tripEstimate.eta)}</b></p>
            <strong>{tripEstimate.status}</strong>
            <div className="major-trip-fields">
              <small>24h Work balance: {tripEstimate.workRemaining24===null?"Review":minutesLabel(tripEstimate.workRemaining24)}</small>
              <small>14d Work balance: {tripEstimate.workRemaining14===null?"Review":minutesLabel(tripEstimate.workRemaining14)}</small>
              {tripEstimate.workRemaining84!==null&&<small>84h Work balance: {minutesLabel(tripEstimate.workRemaining84)}</small>}
              {tripEstimate.longNightRemaining7!==null&&<small>7d long/night balance: {minutesLabel(tripEstimate.longNightRemaining7)}</small>}
            </div>
            {tripEstimate.notes.slice(0,4).map((tip,i)=><p className="small" key={i}>{tip}</p>)}
            {tripEstimate.revision!==s.revision&&<p className="warning-review">Diary has changed. Check the trip again.</p>}
          </div>}
        </div>
      </details>
      <div className="smart-planner-inputs">
        <Field label="Job date" type="date" value={startDate} onChange={v=>{setStartDate(v);setResult(null);}}/>
        <Field label="Earliest start" type="time" step="900" value={startTime} onChange={v=>{setStartTime(v);setResult(null);}}/>
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
                <small>Finish {fmt(result.recommended.finish)} · Start later by {minutesLabel(result.recommended.restBeforeMinutes)}</small>
              </div>}
          </div>
          <p className="small">{result.warning}</p>
          {result.options[0]?.evidence==="conflict"&&<p className="small">Starting earlier may require an interruption. Extending Rest could help you finish longer Work without that interruption.</p>}
        </>}
      </>}
    </div>
  </details>;
}
