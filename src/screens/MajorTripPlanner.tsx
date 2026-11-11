import {useState} from "react";
import {useStore} from "../context";
import {audit,uid,type TripTemplate} from "../domain/model";
import {assessTrip,type PlannedTrip} from "../domain/trip-feasibility";
import {civil,minutesLabel,displayDate} from "../domain/time";
import {Action,Field,Modal} from "../components/UI";

export function MajorTripPlanner({date}:{date:string}) {
  const {s,mutate}=useStore();
  const zone=(s.days[date]?.profile||s.profile).zone,local=civil(Date.now(),zone);
  const templates=s.tripTemplates||[];
  const [selected,setSelected]=useState("");
  const [name,setName]=useState("");
  const [work,setWork]=useState("20");
  const [rest,setRest]=useState("12");
  const [round,setRound]=useState(false);
  const [startDate,setStartDate]=useState(date<local.date?local.date:date);
  const [startTime,setStartTime]=useState("20:00");
  const [result,setResult]=useState<PlannedTrip|null>(null);
  const [error,setError]=useState("");
  const [deleting,setDeleting]=useState(false);
  const saved=templates.find(t=>t.id===selected);
  const choose=(id:string)=>{
    setSelected(id);setResult(null);setError("");
    const item=templates.find(t=>t.id===id);
    if(item){setName(item.name);setWork(String(item.workMinutes/60));setRest(String(item.restMinutes/60));}
  };
  const minutes=(v:string)=>{
    const n=Number(v)*60;
    if(!Number.isFinite(n)||n<0||Math.round(n)!==n||n%15!==0)throw Error("Use Work and Rest estimates in 15-minute steps.");
    return n;
  };
  const save=async()=>{
    const w=minutes(work),r=minutes(rest);
    if(!name.trim()||w<=0||w>14*24*60||r>14*24*60)throw Error("Enter a trip name and reasonable Work/Rest estimates.");
    const id=selected||uid(),template:TripTemplate={id,name:name.trim(),workMinutes:w,restMinutes:r};
    await mutate(state=>{
      state.tripTemplates ||= [];
      const index=state.tripTemplates.findIndex(t=>t.id===id);
      const before=index>=0?{...state.tripTemplates[index]}:undefined;
      if(index>=0)state.tripTemplates[index]=template;else state.tripTemplates.push(template);
      audit(state,"Save trip estimate",id,before,template);
    });
    setSelected(id);setResult(null);setError("");
  };
  const remove=async()=>{
    if(!selected)return;
    await mutate(state=>{
      const before=state.tripTemplates?.find(t=>t.id===selected);
      state.tripTemplates=(state.tripTemplates||[]).filter(t=>t.id!==selected);
      audit(state,"Delete trip estimate",selected,before,undefined);
    });
    setSelected("");setName("");setWork("20");setRest("12");setResult(null);setDeleting(false);
  };
  const check=()=>{
    try{setResult(assessTrip(s,startDate,startTime,minutes(work),minutes(rest),round));setError("");}
    catch(e){setResult(null);setError(e instanceof Error?e.message:"Unable to assess trip.");}
  };
  const clock=(stamp:number)=>{const x=civil(stamp,zone);return displayDate(x.date)+" · "+x.time;};
  const outdated=result!==null&&result.revision!==s.revision;
  return <details className="smart-planner major-trip-planner" aria-label="Plan major trip">
    <summary><strong>Plan major trip</strong><span>One way / Return</span></summary>
    <div className="smart-planner-body">
      <div className="fields major-trip-fields">
        <Field label="Saved trip" value={selected} options={[["","New trip"],...templates.map(t=>[t.id,t.name] as [string,string])]} onChange={choose}/>
        <Field label="Trip name" value={name} placeholder="Melbourne – Brisbane" onChange={v=>{setName(v);setResult(null);}}/>
        <Field label="Work hours (one way)" value={work} type="number" min="0.25" step="0.25" onChange={v=>{setWork(v);setResult(null);}}/>
        <Field label="Rest hours (one way)" value={rest} type="number" min="0" step="0.25" onChange={v=>{setRest(v);setResult(null);}}/>
      </div>
      <div className="row wrap major-trip-save">
        <Action onClick={save}>Save trip estimate</Action>
        {saved&&<Action danger onClick={()=>setDeleting(true)}>Delete saved trip</Action>}
      </div>
      <div className="major-trip-mode" role="group" aria-label="Trip direction">
        <button aria-pressed={!round} onClick={()=>{setRound(false);setResult(null);}}>One way</button>
        <button aria-pressed={round} onClick={()=>{setRound(true);setResult(null);}}>Return trip</button>
      </div>
      <div className="major-trip-estimates">
        <span><small>Estimated Work</small><strong>{minutesLabel(Number(work)*60*(round?2:1)||0)}</strong></span>
        <span><small>Estimated Rest</small><strong>{minutesLabel(Number(rest)*60*(round?2:1)||0)}</strong></span>
      </div>
      <div className="fields major-trip-fields">
        <Field label="Start date" value={startDate} type="date" onChange={v=>{setStartDate(v);setResult(null);}}/>
        <Field label="Start time (base)" value={startTime} type="time" step="900" onChange={v=>{setStartTime(v);setResult(null);}}/>
      </div>
      <Action primary onClick={check}>Check trip availability</Action>
      {error&&<p role="alert" className="warning-review">{error}</p>}
      {result&&<div className="major-trip-result" role="status">
        <strong className={result.status==="Possible — verify"?"major-trip-ok":"major-trip-review"}>{result.status}</strong>
        {outdated&&<p className="warning-review">Diary changed. Recalculate before using this plan.</p>}
        <div className="major-trip-result-summary">
          <span>Start <b>{clock(result.startedAt)}</b></span>
          <span>Estimated finish <b>{clock(result.finishedAt)}</b></span>
          <span>Work / Rest <b>{minutesLabel(result.workMinutes)} / {minutesLabel(result.restMinutes)}</b></span>
          {result.longNightUsed!==null&&<span>Long/night used at finish <b>{minutesLabel(result.longNightUsed)} / 36h</b></span>}
        </div>
        <p className="small">{result.reason}</p>
        {result.schedule.length>0&&<details className="major-trip-details"><summary>Proposed Work and major Rest intervals</summary>
          {result.schedule.filter(x=>x.kind==="work"||x.major).map((x,i)=><p className="small" key={i}>
            {x.kind==="work"?"Work":"Major stationary Rest"} · {clock(x.start)} – {clock(x.end)}
          </p>)}
          <p className="small">Short rest breaks between Work stages are included. Confirm all actual duties and stationary Rest.</p>
        </details>}
      </div>}
    </div>
    {deleting&&<Modal title="Delete saved trip?" onClose={()=>setDeleting(false)}>
      <p>Delete the saved estimate for {saved?.name}? Diary records and past trips will not be changed.</p>
      <div className="row wrap"><Action onClick={()=>setDeleting(false)}>Cancel</Action><Action danger onClick={remove}>Delete trip</Action></div>
    </Modal>}
  </details>;
}
