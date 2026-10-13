import { useState } from "react";
import { useStore } from "../context";
import { clone, profileOn, ruleProfileAt, type Profile } from "../domain/model";
import { useReport } from "./useReport";
import { civil, dateAdd, displayDate } from "../domain/time";
import { dayRuleRange, ruleChangeInstant, saveRuleChange } from "../domain/ruleChanges";
import { Action, Check, Field, Fold } from "./UI";

export function RuleChanges() {
  const {s,mutate}=useStore(), clock=civil(Date.now(),s.profile.zone);
  const current=ruleProfileAt(s,Date.now(),s.days[clock.date]?.profile||profileOn(s,clock.date));
  const {report,error,retry}=useReport(clock.date+"T24:00",14);
  const [mode,setMode]=useState("day"),[date,setDate]=useState(clock.date),[lastDay,setLastDay]=useState(clock.date);
  const [start,setStart]=useState(clock.date+"T"+clock.time),[end,setEnd]=useState(dateAdd(clock.date,1)+"T"+clock.time),[limited,setLimited]=useState(false);
  const [scheme,setScheme]=useState<"Standard"|"BFM">(current.scheme==="BFM"?"BFM":"Standard");
  const [company,setCompany]=useState(current.operator),[certificate,setCertificate]=useState(current.certificate),[expiry,setExpiry]=useState(current.certificateExpiry);
  const [saved,setSaved]=useState("");
  async function save() {
    const from=mode==="day"?dayRuleRange(date,s.profile.zone).from:ruleChangeInstant(start,s.profile.zone);
    const to=mode==="day"?dayRuleRange(lastDay,s.profile.zone).to:limited?ruleChangeInstant(end,s.profile.zone):null;
    const p:Profile={...clone(s.profile),scheme,operator:company,certificate,certificateExpiry:expiry};
    await mutate(w=>{saveRuleChange(w,from,to,p);});
    setSaved(`Saved · ${scheme}. Earlier work still counts.`);
  }
  return <section className="card">
    <h2>Hours option for a day or trip</h2>
    <p className="small">Now: {current.scheme} · {current.twoUp?"Two-up":"Solo"}</p>
    <div className="fields">
      <Field label="Hours option" value={scheme} options={["Standard","BFM"]} onChange={v=>{setScheme(v as "Standard"|"BFM");setSaved("");}} />
      <Field label="Apply from" value={mode} options={[["day","Whole day(s)"],["time","Date and time"]]} onChange={setMode} />
      {mode==="day"?<>
        <Field label="First day" type="date" value={date} onChange={v=>{setDate(v);if(lastDay<v)setLastDay(v);}} />
        <Field label="Last day" type="date" value={lastDay} onChange={setLastDay} />
      </>:<Field label="Start in base time" type="datetime-local" value={start} onChange={setStart} />}
      <Field label="Company for this period" value={company} onChange={v=>{setCompany(v);if(v!==s.profile.operator){setCertificate("");setExpiry("");}setSaved("");}} />
      {scheme==="BFM"&&<>
        <Field label="BFM accreditation for this period" value={certificate} onChange={setCertificate} />
        <Field label="Accreditation expiry" type="date" value={expiry} onChange={setExpiry} />
      </>}
    </div>
    {mode==="time"&&<><Check label="Set an end time" value={limited} onChange={setLimited} />{limited&&<Field label="End in base time" type="datetime-local" value={end} onChange={setEnd} />}</>}
    <p className="small">At the end, return to your usual option. Saving a change does not grant new work hours.</p>
    <Action primary onClick={save}>Save hours option</Action>
    {saved&&<p role="status">{saved}</p>}
    {saved&&<p className="small">{error?error:!report?"Checking previous hours…":report.nextBreak===null||report.nextBreak===0||report.issues.length?"Check hours before switching":"Hours recalculated"}</p>}
    {saved&&error&&<Action onClick={retry}>Retry hours check</Action>}
    <Fold title="Recorded hours-option changes">
      {(s.ruleChanges||[]).filter(c=>c.driverId===s.profile.id).slice().reverse().map(c=><p className="small" key={c.id}>
        {c.profile.scheme} · {displayDate(civil(c.from,c.profile.zone).date)} {civil(c.from,c.profile.zone).time} → {c.to===null?"until changed":`${displayDate(civil(c.to,c.profile.zone).date)} ${civil(c.to,c.profile.zone).time}`}
      </p>)}
    </Fold>
  </section>;
}
