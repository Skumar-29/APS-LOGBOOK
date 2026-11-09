import {PDFDocument,StandardFonts,rgb,type PDFFont, type PDFPage, type RGB} from "pdf-lib";
import type {EmployerAvailability} from "../domain/availability-report";

/** Consistent one-page A4 employer summary; each value is sourced from the existing RuleReport. */
export async function employerAvailabilityPdf(d:EmployerAvailability):Promise<Uint8Array>{
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);
 pdf.setTitle("APS Logbook - Driver Shift Availability");pdf.setCreator("APS Logbook");
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const navy=rgb(.09,.17,.23),teal=rgb(.05,.48,.45),muted=rgb(.39,.47,.53),light=rgb(.95,.97,.98);
 const rule=rgb(.86,.90,.92),white=rgb(1,1,1),ink=rgb(.13,.22,.28);
 const danger=rgb(.64,.33,.12),warn=rgb(1,.965,.89),good=rgb(.89,.96,.94);
 const W=595.28,H=841.89,M=27;
 const safe=(v:string)=>v.replace(/[^\x20-\x7e]/g,"-").trim();
 const rect=(x:number,top:number,w:number,h:number,fill:RGB)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color:fill});
 const text=(value:string,x:number,top:number,size=9,font:PDFFont=regular,color:RGB=ink,maxWidth=500,maxLines=1)=>{
   const raw=safe(String(value)),words=raw.split(/\s+/),lines:string[]=[];let current="";
   for(const word of words){
     const candidate=current?current+" "+word:word;
     if(font.widthOfTextAtSize(candidate,size)<=maxWidth){current=candidate;continue;}
     if(current){lines.push(current);current="";}
     if(font.widthOfTextAtSize(word,size)<=maxWidth){current=word;continue;}
     let part="";
     for(const char of word){if(font.widthOfTextAtSize(part+char,size)>maxWidth&&part){lines.push(part);part="";}part+=char;}
     current=part;
   }
   if(current)lines.push(current);
   if(!lines.length)lines.push("");
   const out=lines.slice(0,maxLines);
   if(lines.length>maxLines){let last=out[maxLines-1];while(last&&font.widthOfTextAtSize(last+"...",size)>maxWidth)last=last.slice(0,-1);out[maxLines-1]=last+"...";}
   out.forEach((line,i)=>page.drawText(line,{x,y:H-top-size-i*(size+3),size,font,color}));
 };
 const hr=(top:number,x=M,w=W-2*M)=>rect(x,top,w,.8,rule);
 const section=(index:string,title:string,top:number,height:number)=>{
   rect(M,top,W-2*M,height,white);
   text(index,M+12,top+10,9,bold,teal);
   text(title,M+32,top+9,11.5,bold,navy,460);
 };
 // Letterhead
 rect(0,0,W,112,navy);rect(0,0,7,112,teal);
 text("APS",M,17,15.5,bold,white);text("LOGBOOK",M+38,17,15.5,bold,rgb(.51,.87,.82));
 text("DRIVER SHIFT AVAILABILITY",M,45,20,bold,white);
 text("Driver: "+d.driver,M,77,11,bold,white,280);
 text(d.scheme+"  |  Base: "+d.base+"  |  "+d.zone,M,95,8.4,regular,rgb(.79,.85,.88),520);
 rect(M,117,W-2*M,23,d.review?warn:good);
 text(d.review?"REVIEW REQUIRED - DO NOT ROSTER FROM THIS ASSESSMENT":"CONDITIONAL PLANNING SUMMARY - VERIFY ACTUAL CONDITIONS",M+10,122,8.6,bold,d.review?danger:teal,520);
 // Shift summary
 section("01","NEXT SHIFT - EMPLOYER VIEW",148,108);
 text("Status: "+d.status,M+315,158,8.8,bold,d.review?danger:teal,195);
 hr(179,M+12,W-2*M-24);
 const cw=(W-2*M-24)/3;
 const cols=[M+13,M+13+cw,M+13+2*cw];
 const titles=["EARLIEST START","WORK TO NEXT BREAK","NEXT BREAK / LIMIT"];
 const values=[d.start,d.workToBreak,d.nextBreak];
 cols.forEach((x,i)=>{text(titles[i],x,187,7.7,bold,muted,cw-12);text(values[i],x,203,i===1?14:11,bold,navy,cw-12,2);});
 text(d.breakBasis,M+13,240,7.5,regular,muted,W-2*M-26);
 // Limits
 section("02","WORK AND LONG/NIGHT BALANCES",265,180);
 const xs=[M+13,M+289,M+375,M+449], widths=[268,80,65,75];
 rect(M+12,292,W-2*M-24,19,light);
 ["PERIOD / MEASURE","USED","LIMIT","REMAIN"].forEach((label,i)=>text(label,xs[i]+(i?0:4),296,7.4,bold,muted,widths[i]));
 d.metrics.slice(0,5).forEach((r,i)=>{
   const y=317+i*23;
   text(r.label,xs[0]+3,y,8.4,i===2?bold:regular,ink,widths[0]-8);
   text(r.used,xs[1],y,8.0,regular,ink,widths[1],2);
   text(r.limit,xs[2],y,7.9,regular,muted,widths[2],2);
   text(r.remaining,xs[3],y,7.9,bold,r.remaining==="Needs review"?danger:teal,widths[3],2);
   if(i<4)hr(y+20,M+12,W-2*M-24);
 });
 text("BFM long/night = midnight-6 am Work plus qualifying Work over 12h in 24h; counted together.",M+13,433,7.2,regular,muted,510);
 // Rest history and forecast
 section("03","MAJOR REST HISTORY AND FORECAST",453,173);
 rect(M+12,478,249,20,light);rect(M+272,478,257,20,good);
 text("LAST QUALIFYING / RECORDED",M+21,483,7.7,bold,muted,228);
 text("NEXT / EXPECTED",M+281,483,7.7,bold,teal,236);
 d.rests.slice(0,3).forEach((r,i)=>{
   const y=502+i*40;
   text(r.label,M+18,y,8.5,bold,navy,225);
   text(r.last,M+18,y+12,7.8,regular,muted,225,2);
   text(r.next,M+281,y+9,8,regular,teal,224,3);
   if(i<2)hr(y+36,M+12,W-2*M-24);
 });
 text("48h has no routine BFM solo due date. Predicted rest must be based on verified Work and counting windows.",M+14,616,7.0,regular,muted,515);
 // Night compliance
 section("04","NIGHT WORK AND REST CHECKLIST",635,120);
 const ncols=[M+15,M+198,M+377];
 text("NIGHT WORK 00:00-06:00",ncols[0],665,7.7,bold,muted,168);
 text("NIGHT RESTS",ncols[1],665,7.7,bold,muted,168);
 text("CONSECUTIVE PAIR",ncols[2],665,7.7,bold,muted,145);
 text(d.midnightNight,ncols[0],680,9,bold,navy,168,2);
 text(d.nightRests,ncols[1],680,10,bold,navy,168,2);
 text(d.nightPair,ncols[2],680,10,bold,navy,145,2);
 hr(710,M+12,W-2*M-24);
 text("24h stationary Rests: "+d.two24,M+15,717,7.8,regular,ink,510,2);
 text("Long/night hours released: "+d.nightRelease,M+15,738,7,regular,muted,510);
 // Footer
 rect(M,765,W-2*M,59,light);
 text(d.review?"REVIEW BEFORE SHARING WITH EMPLOYER":"EMPLOYER NOTE",M+12,772,8.7,bold,d.review?danger:navy,500);
 const notes=d.reviewReasons.length?d.reviewReasons.join(" | "):d.note;
 text(notes,M+12,785,7.5,regular,ink,515,2);
 text("Assessed: "+showAssessment(d.assessed)+"  |  "+d.assessmentKind+"  |  "+d.base+" base time",M+12,811,7.2,regular,muted,515);
 text("APS Logbook | Planning only - not permission to drive",M,829,7,regular,muted,500);
 return new Uint8Array(await pdf.save());
}
function showAssessment(v:string){return v.replace("T"," ");}
