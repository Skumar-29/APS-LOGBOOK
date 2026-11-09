import {CumulativeLimits} from "../components/CumulativeLimits";
import {useState} from "react";
import type {Workspace,Profile} from "../domain/model";
import type {RuleReport} from "../domain/rules";
import {employerAvailability,type EmployerAvailability} from "../domain/availability-report";
import {employerAvailabilityPdf} from "../documents/availability-page";
import {restExtensionOpportunity} from "../domain/rest-advisor";
import {displayCivil,minutesLabel} from "../domain/time";
import {Action,download} from "../components/UI";
import {SmartPlanner} from "./SmartPlanner";

type Props={s:Workspace;report:RuleReport;p:Profile;date:string;onNow:()=>void};
function companyText(r:EmployerAvailability){
 const lines=[
  "APS LOGBOOK - DRIVER SHIFT AVAILABILITY",
  "Driver: "+r.driver,
  "Hours option: "+r.scheme+" | Base: "+r.base+" ("+r.zone+")",
  "Assessment: "+r.assessed+" | "+r.assessmentKind,
  "Eligibility: "+r.status,
  "Earliest start: "+r.start,
  "Work to next break: "+r.workToBreak,
  "Next restricting break: "+r.nextBreak,
  "Basis: "+r.breakBasis,
  "",
  "WORK AND LONG/NIGHT BALANCES",
  ...r.metrics.map(m=>m.label+": used "+m.used+" / limit "+m.limit+" / remaining "+m.remaining),
  "",
  "MAJOR REST HISTORY AND FORECAST",
  ...r.rests.flatMap(m=>[m.label+": last "+m.last,"Next: "+m.next]),
  "",
  "NIGHT COMPLIANCE",
  "Midnight-6am Work: "+r.midnightNight,
  "Night Rests: "+r.nightRests,
  "Consecutive pair: "+r.nightPair,
  "24h stationary Rests: "+r.two24,
  "Next long/night allowance release: "+r.nightRelease,
  ...r.reviewReasons.map(x=>"Review: "+x),
  "",
  r.note
 ];
 return lines.join("\n");
}
export function QuickStats({s,report,p,date,onNow}:Props){
 const r=employerAvailability(s,report,p);
 const rest=restExtensionOpportunity(s,date);
 const [message,setMessage]=useState("");
 const metrics=r.metrics;
 const available=(i:number)=>metrics[i]?.remaining||"Review";
 const exportFile=async()=>{
   const data=await employerAvailabilityPdf(employerAvailability(s,report,p));
   return new File([new Uint8Array(data)],"APS-Availability-"+date+".pdf",{type:"application/pdf"});
 };
 const savePdf=async()=>{
   try{const file=await exportFile();download(file,file.name);setMessage("One-page availability PDF saved.");}
   catch(e){setMessage(e instanceof Error?e.message:"PDF could not be saved.");}
 };
 const share=async()=>{
   try{
     const current=employerAvailability(s,report,p);
     const file=await exportFile();
     if(navigator.share && navigator.canShare?.({files:[file]})){
       await navigator.share({title:"APS Logbook - Shift Availability",text:"Shift availability assessment attached. "+current.status,files:[file]});
     }else if(navigator.share){
       await navigator.share({title:"APS Logbook - Shift Availability",text:companyText(current)});
       setMessage("Text shared. Use Save PDF to send the one-page document.");
     }else if(navigator.clipboard){
       await navigator.clipboard.writeText(companyText(current));setMessage("Report text copied. Save PDF to attach to your employer.");
     }else{download(file,file.name);setMessage("PDF saved to share with your employer.");}
   }catch(e){if(e instanceof Error&&e.name==="AbortError")return;
     setMessage("Sharing unavailable. Use Save PDF instead.");
   }
 };
 return <section className="card quick-stats" aria-label="Quick driving availability and rest deadlines">
   <div className="row wrap"><h2>Driver shift availability</h2><Action onClick={onNow}>As of now</Action></div>
   <p className="small">Assessed {displayCivil(report.assessedThrough)} · {p.base} time {r.assessmentKind!=="Current assessment"?"· "+r.assessmentKind:""}</p>
   <div className={r.review?"banner warning-review":"record-line"} role="status">
     <strong>{r.status}</strong>
     {r.review?<span>Confirm history and stationary Rest before rostering.</span>:null}
   </div>
   <div className="quick-stats-grid">
     <div><small>Earliest start</small><strong>{r.start}</strong></div>
     <div><small>Work to next break</small><strong>{r.workToBreak}</strong></div>
     <div><small>Next break</small><strong>{r.nextBreak}</strong></div>
     <div><small>24h Work left</small><strong>{available(0)}</strong></div>
     <div><small>Long/night 7d left</small><strong>{available(2)}</strong></div>
     <div><small>14d Work left</small><strong>{available(3)}</strong></div>
   </div>
   <CumulativeLimits report={report} profile={p}/>
   <h3>Next required breaks</h3>
   <div className="quick-break-list">
     {r.rests.map(item=><div key={item.label}><span>{item.label}<br/>Last: {item.last}</span><strong>{item.next}</strong></div>)}
     <div><span>Night work (12am-6am)</span><strong>{r.midnightNight}</strong></div>
     <div><span>Night rests / pair</span><strong>{r.nightRests} · {r.nightPair}</strong></div>
     <div><span>Two 24h rests in 14d</span><strong>{r.two24}</strong></div>
     <div><span>Long/night release</span><strong>{r.nightRelease}</strong></div>
   </div>
   {rest&&(rest.majorExtraMinutes>0||rest.nightExtraMinutes!==null&&rest.nightExtraMinutes>0)&&
     <p className="quick-rest-tip"><strong>Rest opportunity:</strong>
       {rest.majorExtraMinutes>0?" "+minutesLabel(rest.majorExtraMinutes)+" more completes 7h.":""}
       {rest.nightExtraMinutes!==null&&rest.nightExtraMinutes>0?" "+minutesLabel(rest.nightExtraMinutes)+" more qualifies a night rest.":""}
     </p>}
   {r.review&&<p className="small warning-review">{r.reviewReasons.length?r.reviewReasons.join(" · "):
     "History and stationary Rest types need review before scheduling."}</p>}
   <div className="row wrap quick-share">
     <Action primary onClick={()=>{void share();}}>Share availability</Action>
     <Action onClick={()=>{void savePdf();}}>Save one-page PDF</Action>
   </div>
   {message&&<p className="small" role="status">{message}</p>}
   <SmartPlanner key={date} date={date}/>
   <p className="small">{r.note}</p>
   <p className="small">The remaining balances are independent limits and cannot be added together. Seven-day total Work is informational under BFM solo; long/night Work has its own cap.</p>
 </section>;
}
