import { useState } from "react";
import { useStore } from "../context";
import { clone, profileOn, ruleProfileAt, type Profile, type RuleChange } from "../domain/model";
import { useReport } from "./useReport";
import { civil, dateAdd, displayDate } from "../domain/time";
import { dayRuleRange, ruleChangeInstant, saveRuleChange, removeRuleChange } from "../domain/ruleChanges";
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
  const [companyAddress,setCompanyAddress]=useState("");
  const [twoUp,setTwoUp]=useState(current.twoUp);
  const [coDriver,setCoDriver]=useState(current.coDriver);
  const [coLicence,setCoLicence]=useState(current.coLicence);
  const [coScheme,setCoScheme]=useState(current.coScheme);
  const [coBase,setCoBase]=useState(current.coBase);
  const [editing,setEditing]=useState<string|null>(null);
  async function save() {
    const from=mode==="day"?dayRuleRange(date,s.profile.zone).from:ruleChangeInstant(start,s.profile.zone);
    const to=mode==="day"?dayRuleRange(lastDay,s.profile.zone).to:limited?ruleChangeInstant(end,s.profile.zone):null;
    const p:Profile={...clone(s.profile),scheme,twoUp,coDriver:twoUp?coDriver:"",coLicence:twoUp?coLicence:"",coScheme,coBase:twoUp?coBase:"",operator:company,certificate,certificateExpiry:expiry};
    if(twoUp&&(!coDriver.trim()||!coLicence.trim())){setSaved("Enter the co-driver name and licence for Two-up.");return;}
    if(to!==null&&to<=from){setSaved("End must be after start.");return;}
    await mutate(w=>{
      if(editing) removeRuleChange(w,editing);
      const entry=saveRuleChange(w,from,to,p);
      entry.companyAddress=companyAddress.trim();
    });
    setEditing(null);
    setSaved(`Saved · ${scheme}. Earlier work still counts.`);
  }
  function edit(c:RuleChange) {
    setEditing(c.id);setScheme(c.profile.scheme==="BFM"?"BFM":"Standard");
    setCompany(c.profile.operator);setCompanyAddress(c.companyAddress||"");
    setTwoUp(c.profile.twoUp);setCoDriver(c.profile.coDriver);setCoLicence(c.profile.coLicence);setCoScheme(c.profile.coScheme);setCoBase(c.profile.coBase);
    setCertificate(c.profile.certificate);setExpiry(c.profile.certificateExpiry);
    const from=civil(c.from,s.profile.zone),to=c.to===null?null:civil(c.to,s.profile.zone);
    setMode("time");setStart(from.date+"T"+from.time);setLimited(c.to!==null);
    if(to)setEnd(to.date+"T"+to.time);
    setSaved("Editing selected change. Save to replace it.");
  }
  async function remove(id:string) {
    if(!window.confirm("Remove this temporary hours option? Diary records will be kept."))return;
    await mutate(w=>removeRuleChange(w,id));
    if(editing===id)setEditing(null);
    setSaved("Temporary hours option removed. Diary entries kept.");
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
      <Field label="Driving arrangement" value={twoUp?"Two-up":"Solo"} options={["Solo","Two-up"]} onChange={v=>setTwoUp(v==="Two-up")} />
      {twoUp&&<>
        <Field label="Co-driver name" value={coDriver} onChange={setCoDriver} />
        <Field label="Co-driver licence" value={coLicence} onChange={setCoLicence} />
        <Field label="Co-driver hours option" value={coScheme} options={["Standard","BFM"]} onChange={v=>setCoScheme(v as "Standard"|"BFM")} />
        <Field label="Co-driver base" value={coBase} onChange={setCoBase} />
      </>}
      <Field label="Company operating address (optional)" value={companyAddress} onChange={setCompanyAddress} wide />
      {scheme==="BFM"&&<>
        <Field label="BFM accreditation for this period" value={certificate} onChange={setCertificate} />
        <Field label="Accreditation expiry" type="date" value={expiry} onChange={setExpiry} />
      </>}
    </div>
    {mode==="time"&&<><Check label="Set an end time" value={limited} onChange={setLimited} />{limited&&<Field label="End in base time" type="datetime-local" value={end} onChange={setEnd} />}</>}
    <p className="small">At the end, return to your usual option. Saving a change does not grant new work hours.</p>
    <p className="small">Diary base: {s.profile.base} ({s.profile.zone}). Company location does not automatically change your legal diary base.</p>
    <Action primary onClick={save}>{editing?"Save edited option":"Save hours option"}</Action>
    {editing&&<Action onClick={()=>{setEditing(null);setSaved("");}}>Cancel editing</Action>}
    {saved&&<p role="status">{saved}</p>}
    {saved&&<p className="small">{error?error:!report?"Checking previous hours…":report.nextBreak===null||report.nextBreak===0||report.issues.length?"Check hours before switching":"Hours recalculated"}</p>}
    {saved&&error&&<Action onClick={retry}>Retry hours check</Action>}
    <Fold title="Recorded hours-option changes">
      {(s.ruleChanges||[]).filter(c=>c.driverId===s.profile.id).slice().reverse().map(c=><div className="small" key={c.id} style={{padding:"12px 0",borderBottom:"1px solid #ddd"}}>
        <div>{c.profile.scheme} · {c.profile.twoUp?"Two-up":"Solo"} · {displayDate(civil(c.from,c.profile.zone).date)} {civil(c.from,c.profile.zone).time} → {c.to===null?"until changed":`${displayDate(civil(c.to,c.profile.zone).date)} ${civil(c.to,c.profile.zone).time}`}</div>
        {c.profile.operator&&<div>{c.profile.operator}{c.companyAddress?` · ${c.companyAddress}`:""}</div>}
        <div style={{display:"flex",gap:8,marginTop:8}}><Action onClick={()=>edit(c)}>Edit</Action><Action onClick={()=>remove(c.id)}>Remove</Action></div>
      </div>)}
    </Fold>
  </section>;
}
