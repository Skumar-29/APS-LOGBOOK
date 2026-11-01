import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {useState} from "react";
import type {Workspace,Profile} from "../domain/model";
import type {RuleReport} from "../domain/rules";
import {drivingStatistics} from "../domain/driving-statistics";
import {fatigueGuidance} from "../domain/fatigue-guidance";
import {restExtensionOpportunity} from "../domain/rest-advisor";
import {displayCivil,minutesLabel,civil,displayClock} from "../domain/time";
import {Action,download} from "../components/UI";
import {SmartPlanner} from "./SmartPlanner";

type Props={s:Workspace;report:RuleReport;p:Profile;date:string;onNow:()=>void};
function companyText(s:Workspace,report:RuleReport,p:Profile,date:string){
  const r=drivingStatistics(s,report,p);
  const formatted=(v:number|null)=>v===null?"Needs review":minutesLabel(v);
  const lines=[
    "APS LOGBOOK - SHIFT AVAILABILITY",
    "Driver: "+(p.name||"Not entered"),
    "Hours option: "+p.scheme+(p.twoUp?" (two-up)":" (solo)"),
    "Base: "+p.base+" ("+p.zone+")",
    "Assessment: "+report.assessedThrough,
    "Diary date: "+date,
    "Next Work eligibility: "+r.eligibilityText,
    "Work before next limit: "+formatted(r.canWorkMinutes),
    "24-hour Work remaining: "+formatted(r.work24Remaining),
    "7-day long/night remaining: "+formatted(r.longNightRemaining),
    "14-day Work remaining: "+formatted(r.work14Remaining),
    "Next restricting break: "+(r.nextBreakDue||"Not established"),
    "Latest 7-hour Rest start: "+(r.nextSevenHourRestStart||"Not established"),
    "Next major Rest: "+r.next24RestMessage,
    "Night rests remaining: "+r.nightRestsRemaining,
    "Consecutive-night pair: "+(r.consecutivePairMet?"Recorded":"Check requirement"),
    ...(r.historicalReview?["IMPORTANT: HISTORY / REST CLASSIFICATION NEEDS REVIEW."]:[]),
    "",
    "Planning information only; not permission to drive. Check NHVR requirements and actual conditions."
  ];
  return lines.join("\n");
}
async function pdfFromText(text:string){
  const doc=await PDFDocument.create();
  const page=doc.addPage([595.28,841.89]);
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({x:0,y:785,width:595,height:57,color:rgb(.12,.35,.30)});
  page.drawText("APS Logbook - Shift Availability",{x:32,y:806,size:18,font:bold,color:rgb(1,1,1)});
  let y=765;
  const lines=text.split("\n").slice(1);
  for(const line of lines){
    const safe=line.replace(/[^\x20-\x7E]/g,"-");
    const parts=safe.length>83?safe.match(/.{1,83}/g)||[safe]:[safe];
    for(const part of parts){
      const emphasize=/^(IMPORTANT:|Next Work eligibility|Work before next limit|24-hour Work remaining|7-day long\/night remaining|14-day Work remaining)/.test(part);
      page.drawText(part,{x:32,y,size:emphasize?11:10,font:emphasize?bold:font,color:rgb(.12,.18,.19),maxWidth:531});
      y-=emphasize?20:17;
      if(y<72)break;
    }
    if(y<72)break;
  }
  page.drawText("Calculated from saved or planned diary entries. Verify rest types and applicable NHVR rules.",
    {x:32,y:40,size:9,font,color:rgb(.35,.38,.40)});
  return doc.save();
}
export function QuickStats({s,report,p,date,onNow}:Props){
  const d=report.days.find(x=>x.date===date);
  const r=drivingStatistics(s,report,p);
  const f=fatigueGuidance(report,p);
  const rest=restExtensionOpportunity(s,date);
  const [message,setMessage]=useState("");
  const clock=(time:string|null)=>time?displayCivil(time):"Check details";
  const remaining=(n:number|null)=>n===null?"Review":minutesLabel(n);
  const share=()=>{
    const body=companyText(s,report,p,date);
    if(navigator.share){
      void navigator.share({title:"APS Logbook - Shift Availability",text:body}).catch((e:unknown)=>{
        if(e instanceof Error&&e.name==="AbortError")return;
        setMessage("Sharing was unavailable. Use Save PDF or copy this report.");
      });
    } else if(navigator.clipboard){
      void navigator.clipboard.writeText(body).then(()=>setMessage("Availability summary copied.")).catch(()=>setMessage("Use Save PDF to share."));
    } else {
      download(new Blob([body],{type:"text/plain"}),"APS-Availability-"+date+".txt");
      setMessage("Text summary saved.");
    }
  };
  const pdf=async()=>{
    const blob=new Blob([new Uint8Array(await pdfFromText(companyText(s,report,p,date)))],{type:"application/pdf"});
    download(blob,"APS-Availability-"+date+".pdf");
  };
  return <section className="card quick-stats" aria-label="Quick driving availability and rest deadlines">
    <div className="row wrap"><h2>At a glance</h2><Action onClick={onNow}>As of now</Action></div>
    <p className="small">Assessed {displayCivil(report.assessedThrough)} · {p.base} time {date!==civil(Date.now(),p.zone).date?"· Selected diary date":""}</p>
    <div className="quick-stats-grid">
      <div><small>Work today</small><strong>{d?minutesLabel(d.work):"—"}</strong></div>
      <div><small>Rest today</small><strong>{d?minutesLabel(d.rest):"—"}</strong></div>
      <div><small>24h Work left</small><strong>{remaining(r.work24Remaining)}</strong></div>
      <div><small>Next Work limit</small><strong>{remaining(r.canWorkMinutes)}</strong></div>
      <div><small>Long/night left</small><strong>{remaining(r.longNightRemaining)}</strong></div>
      <div><small>14d Work left</small><strong>{remaining(r.work14Remaining)}</strong></div>
    </div>
    <h3>Next required breaks</h3>
    <div className="quick-break-list">
      <div><span>Next short/Work limit</span><strong>{clock(r.nextBreakDue)}</strong></div>
      <div><span>7h stationary Rest</span><strong>{r.nextSevenHourRestStart?"Start by "+clock(r.nextSevenHourRestStart):"Check deadline"}</strong></div>
      <div><span>24h major Rest</span><strong>{r.work84Remaining!==null?remaining(r.work84Remaining)+" until 84h threshold":"Review"}</strong></div>
      <div><span>Night rests</span><strong>{f.nightRests}/4 · {f.pairMet?"pair met":"pair to plan"}</strong></div>
    </div>
    {rest&&(rest.majorExtraMinutes>0||rest.nightExtraMinutes!==null&&rest.nightExtraMinutes>0)&&
      <p className="quick-rest-tip"><strong>Rest opportunity:</strong>
        {rest.majorExtraMinutes>0?" "+minutesLabel(rest.majorExtraMinutes)+" more completes 7h.":""}
        {rest.nightExtraMinutes!==null&&rest.nightExtraMinutes>0?" "+minutesLabel(rest.nightExtraMinutes)+" more qualifies a night rest.":""}
      </p>}
    {r.historicalReview&&<p className="small warning-review">Review history and stationary Rest types before scheduling or relying on remaining allowances.</p>}
    <div className="row wrap quick-share">
      <Action primary onClick={share}>Share availability</Action>
      <Action onClick={pdf}>Save PDF</Action>
    </div>
    {message&&<p className="small" role="status">{message}</p>}
    <SmartPlanner date={date}/>
    <p className="small">Remaining allowances are separate limits. The smallest applicable limit controls; they cannot be added together.</p>
  </section>;
}
