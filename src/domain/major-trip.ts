import type {Workspace} from './model';
import {analyse,selectCheckSummaries,selectWorkWindow} from './rules';
import {civil,instantFor,MINUTE} from './time';
import {operatingRules} from './catalogue';

export interface MajorTripPreset {
 id:string;name:string;workHours:number;restHours:number;
}
export interface MajorTripEstimate {
 name:string;mode:'one-way'|'return';
 start:number;eta:number;totalWork:number;totalRest:number;elapsedMinutes:number;
 workRemaining24:number|null;workRemaining14:number|null;
 longNightRemaining7:number|null;workRemaining84:number|null;
 status:'Needs review'|'Not enough estimated rest'|'Indicatively schedulable';
 notes:string[];revision:number;
}
/** Aggregate trip estimate. This is NOT a modelled sequence of mandatory Rest
 * breaks: never treat input Work/Rest totals as NHVR-compliant without a
 * specific timetable. Preserves the driver's records without modification. */
export function estimateMajorTrip(
 s:Workspace, preset:Pick<MajorTripPreset,'name'|'workHours'|'restHours'>,
 mode:'one-way'|'return',date:string,time:string,liveNow=Date.now(),
):MajorTripEstimate {
 const p=s.days[date]?.profile||s.profile;
 if(!/^([01]\\d|2[0-3]):(00|15|30|45)$/.test(time))throw Error('Select a 15-minute departure time.');
 if(!Number.isFinite(preset.workHours)||!Number.isFinite(preset.restHours)||
  preset.workHours<=0||preset.restHours<0||preset.workHours>168||preset.restHours>168||
  preset.workHours*4%1!==0||preset.restHours*4%1!==0)
  throw Error('Enter Work and Rest as quarter-hour totals between 0 and 168 hours.');
 const start=instantFor(date,time,p.zone)[0];
 if(start===undefined)throw Error('Check departure date and base time zone.');
 const factor=mode==='return'?2:1,totalWork=preset.workHours*60*factor,
  totalRest=preset.restHours*60*factor,elapsedMinutes=totalWork+totalRest;
 const eta=start+elapsedMinutes*MINUTE,notes:string[]=[];
 if(operatingRules(p)!=='HVNL'||p.scheme==='AFM'||p.scheme==='ACH')
  notes.push('Certificate-specific or jurisdiction-specific hours need separate checking.');
 const report=analyse(s,date+'T'+time,28,{now:start,liveThrough:Math.min(start,liveNow)});
 const checks=selectCheckSummaries(report.checks,report.assessedThrough,p.zone);
 const daily=selectWorkWindow(report.workWindows,date);
 const fortnight=checks.find(c=>c.label==='14 days');
 const workRemaining14=fortnight?.limit!==null&&fortnight?.limit!==undefined
   ?Math.max(0,fortnight.limit-fortnight.work):null;
 const workRemaining24=daily?.limit!==null&&daily?.limit!==undefined
   ?Math.max(0,daily.limit-daily.work):null;
 const workRemaining84=p.scheme==='BFM'&&!p.twoUp&&report.checkpoint84
   ?Math.max(0,5040-report.checkpoint84.work):null;
 const longNightRemaining7=p.scheme==='BFM'&&!p.twoUp
   ?Math.max(0,2160-report.longNight):null;
 const minMajor=p.scheme==='BFM'&&p.twoUp?0:p.twoUp?300:420;
 let status:MajorTripEstimate['status']='Indicatively schedulable';
 if(elapsedMinutes>=1440&&minMajor>0&&totalRest<minMajor){
  status='Not enough estimated rest';
  notes.push('The entered Rest total is shorter than one qualifying major Rest break.');
 }
 if(workRemaining84!==null&&totalWork>workRemaining84)
  notes.push('A 24-hour stationary Rest checkpoint may become due before this trip can finish.');
 if(workRemaining14!==null&&totalWork>workRemaining14)
  notes.push('The trip exceeds the currently displayed 14-day Work balance; older Work may expire or a different schedule may be needed.');
 if(longNightRemaining7!==null)
  notes.push('Night Work depends on exactly when driving occurs; it cannot be calculated from aggregate hours alone.');
 if(p.twoUp)notes.push('Each two-up driver needs an independently compliant diary and permitted sleeper-berth Rest.');
 notes.push('Work/Rest totals do not specify the timing of short breaks, major stationary Rest or overlapping windows.');
 const unknown=report.issues.length>0||daily?.review||!fortnight||fortnight.status==='Needs review';
 if(status==='Indicatively schedulable'&&unknown)status='Needs review';
 if(status==='Needs review')notes.unshift('Complete the relevant history and specify actual break timing before accepting the job.');
 return {name:preset.name,mode,start,eta,totalWork,totalRest,elapsedMinutes,
  workRemaining24,workRemaining14,longNightRemaining7,workRemaining84,status,notes,revision:s.revision};
}
