import {describe,it,expect} from 'vitest';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {emptyState,ensureDay,clone,type Workspace} from '../src/domain/model';
import {editRange,diaryCsv} from '../src/domain/diary';
import {dateAdd,totals} from '../src/domain/time';
import {analyse} from '../src/domain/rules';
import {newForm,allClear,validateForm,signForm,reviseForm} from '../src/domain/forms';
import {newInvoice,blankMisc,tripLoad,validateInvoice,calculateInvoice} from '../src/domain/invoices';
import {exportBackup,inspectBackup} from '../src/domain/backup';

const configs=[
 {name:'solo-standard',scheme:'Standard',twoUp:false,start:'2026-07-01'},
 {name:'solo-bfm',scheme:'BFM',twoUp:false,start:'2026-08-01'},
 {name:'two-up-standard',scheme:'Standard',twoUp:true,start:'2026-09-01'},
 {name:'two-up-bfm',scheme:'BFM',twoUp:true,start:'2026-09-01'},
] as const;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
function fixture(c:typeof configs[number]){
 const s=emptyState(); s.onboarded=true;
 Object.assign(s.profile,{name:'Scenario Driver',licence:'SIM123',base:'QLD',zone:'Australia/Brisbane',operation:'HVNL',scheme:c.scheme,twoUp:c.twoUp,coDriver:c.twoUp?'Scenario Co-driver':'',coLicence:c.twoUp?'SIM456':'',coScheme:c.scheme,certificate:'TEST-BFM',certificateExpiry:'2027-12-31',signature:png});
 s.settings.diaryRestDefault='stationary';s.settings.restSelectionMode=c.twoUp?'confirm':'suggested';
 s.books.push({id:'sim-book',number:'SIM-ONLY',firstDate:c.start,firstPage:'1',closed:false});
 for(let n=-28;n<30;n++){const d=ensureDay(s,dateAdd(c.start,n));d.restDefault='stationary';}
 let odo=100000;
 for(let n=0;n<30;n++){
  const date=dateAdd(c.start,n),d=s.days[date],dow=new Date(date+'T12:00:00Z').getUTCDay();
  d.vehicle='SIM01';
  s.pages.push({id:'sim-page-'+n,bookId:'sim-book',number:String(n+1),date,status:'Active',reason:''});
  if(dow===0||dow===6)continue;
  editRange(s,date,24,40,'work');editRange(s,date,42,58,'work');
  d.changes[24]={slot:24,location:'Rocklea',odometer:String(odo),restType:'stationary',note:'TEST ONLY - departure',vehicle:'SIM01'};
  d.changes[40]={slot:40,location:'Rest stop',odometer:String(odo+300),restType:c.twoUp?'sleeper-moving':'stationary',note:'TEST ONLY - break',vehicle:'SIM01'};
  d.changes[42]={slot:42,location:'Rest stop',odometer:String(odo+300),restType:'stationary',note:'TEST ONLY - restart',vehicle:'SIM01'};
  d.changes[58]={slot:58,location:'Laverton North',odometer:String(odo+600),restType:'stationary',note:'TEST ONLY - finish',vehicle:'SIM01'};
  odo+=600;
 }
 return s;
}
const results:any[]=[];
describe('three-month driver simulation plus both two-up schemes',()=>{
 for(const c of configs){
  it(c.name+': every day, forms, invoices and backup',async()=>{
   const s=fixture(c);let working=0,expectedCents=0;
   for(let n=0;n<30;n++){
    const date=dateAdd(c.start,n),d=s.days[date];
    const r=analyse(s,date+'T24:00',28);
    expect(r.findings.filter(f=>f.severity==='breach'),date).toEqual([]);
    expect(Object.keys(r.breachSlots),date).toEqual([]);
    expect(totals(d.slots).work).toBe([0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())?0:480);
    if(totals(d.slots).work===0)continue;
    working++;
    const f=newForm(s);Object.assign(f.values,{date,depart:'06:00',arrive:date+'T14:30',from:'Rocklea',to:'Laverton North',pm:'SIM01',t1:'SIMT1',odo:d.changes[24].odometer});
    expect(()=>validateForm(f)).toThrow();
    allClear(f,'checks');allClear(f,'declarations');validateForm(f);signForm(f,s);s.forms.push(f);
    const next=newForm(s,f);expect(next.checks.pm).toEqual({});expect(next.declarations).toEqual({});expect(next.signature).toBe('');
    const inv=newInvoice(s);inv.invoiceNo='SIM-'+c.name+'-'+n;inv.billTo='Simulation Transport';inv.dateFrom=inv.dateTo=date;
    const load=tripLoad(s,date+':24',date+':58');load.rate='0.55';inv.loads=[load];
    inv.misc=[{...blankMisc(),date,item:'Waiting',quantity:'0.5',rate:'40'}];
    const calc=validateInvoice(inv);expect(calc.main).toBe(330);expect(calc.misc).toBe(20);expect(calc.total).toBe(350);expectedCents+=35000;s.invoices.push(inv);
   }
   expect(s.forms).toHaveLength(working);expect(s.invoices).toHaveLength(working);
   expect(s.invoices.reduce((sum,i)=>sum+Math.round(calculateInvoice(i).total*100),0)).toBe(expectedCents);
   const backup=await exportBackup(s);const restored=(await inspectBackup(backup)).state;
   expect(restored.days).toEqual(s.days);expect(restored.forms).toEqual(s.forms);expect(restored.invoices).toEqual(s.invoices);expect(restored.pages).toEqual(s.pages);
   const csv=diaryCsv(s,c.start,dateAdd(c.start,29));expect(csv).toContain('Rocklea');expect(csv).toContain(c.scheme);
   mkdirSync('simulation-output',{recursive:true});writeFileSync('simulation-output/'+c.name+'.json',JSON.stringify(s));writeFileSync('simulation-output/'+c.name+'-backup.json',backup);writeFileSync('simulation-output/'+c.name+'.csv',csv);
   results.push({scenario:c.name,start:c.start,end:dateAdd(c.start,29),days:30,workingDays:working,workHours:working*8,forms:s.forms.length,invoices:s.invoices.length,total:expectedCents/100});
  },120000);
  it(c.name+': extra blocks find work breaches and correction clears them',()=>{
   const s=fixture(c),date=dateAdd(c.start,15);editRange(s,date,0,96,'rest');
   const cap=c.scheme==='BFM'?56:48;
   // Short breaks satisfy Standard/BFM short periods; exceed the daily cap only.
   editRange(s,date,24,40,'work');editRange(s,date,42,58,'work');editRange(s,date,60,76,'work');
   if(cap===56)editRange(s,date,77,85,'work');
   let r=analyse(s,date+'T21:15');expect(r.findings.filter(f=>f.code==='work-1440')).toEqual([]);
   const extra=cap===56?85:76;editRange(s,date,extra,extra+1,'work');
   r=analyse(s,date+'T22:00');expect(r.findings.some(f=>f.code==='work-1440'&&f.severity==='breach')).toBe(true);expect(r.breachSlots[date+':'+extra]).toBeTruthy();
   editRange(s,date,extra,extra+1,'rest');r=analyse(s,date+'T22:00');expect(r.findings.filter(f=>f.code==='work-1440')).toEqual([]);
  },120000);
  it(c.name+': sustained overwork flags weekly/fortnightly limits',()=>{
   const s=fixture(c);
   for(let n=0;n<30;n++){const date=dateAdd(c.start,n);editRange(s,date,0,96,'rest');editRange(s,date,24,40,'work');editRange(s,date,41,57,'work');editRange(s,date,58,74,'work');}
   const r=analyse(s,dateAdd(c.start,29)+'T24:00',28);
   expect(r.findings.some(f=>f.code==='work-20160'&&f.severity==='breach')).toBe(true);
   if(c.scheme==='Standard'||c.twoUp)expect(r.findings.some(f=>f.code==='work-10080'&&f.severity==='breach')).toBe(true);
   else expect(r.findings.some(f=>f.code.includes('84')&&f.severity==='breach')).toBe(true);
  },120000);
 }
 it('short-period cap: exact limit allowed, next block red, undo clears it',()=>{
  for(const c of configs.filter(c=>!(c.scheme==='BFM'&&c.twoUp))){
   const s=fixture(c),date=dateAdd(c.start,15),cap=c.scheme==='BFM'?24:21;
   editRange(s,date,0,96,'rest');editRange(s,date,24,24+cap,'work');let r=analyse(s,date+(c.scheme==='BFM'?'T12:00':'T11:15'));expect(r.breachSlots[date+':'+(23+cap)]).toBeUndefined();
   editRange(s,date,24+cap,25+cap,'work');r=analyse(s,date+(c.scheme==='BFM'?'T12:15':'T11:30'));expect(r.breachSlots[date+':'+(24+cap)]).toBeTruthy();
   editRange(s,date,24+cap,25+cap,'rest');r=analyse(s,date+(c.scheme==='BFM'?'T12:15':'T11:30'));expect(r.breachSlots[date+':'+(24+cap)]).toBeUndefined();
  }
 });
 it('vehicle fault survives all-clear and blocks contradictory signing; signed original stays unchanged',()=>{
  const s=fixture(configs[0]),f=newForm(s);Object.assign(f.values,{date:'2026-07-01',depart:'06:00',arrive:'2026-07-01T14:30',from:'Rocklea',to:'Laverton North',pm:'SIM01'});allClear(f,'checks');allClear(f,'declarations');f.checks.pm[0]='issue';allClear(f,'checks');expect(f.checks.pm[0]).toBe('issue');expect(()=>validateForm(f)).toThrow();
  f.values.comments='Test fault: repaired and re-inspected';f.declarations[6]='Yes';f.declarations[10]='No';signForm(f,s);s.forms.push(f);const original=clone(f),revision=reviseForm(s,f.id);expect(s.forms.find(x=>x.id===revision)?.status).toBe('Draft');expect(s.forms[0]).toEqual(original);
 });
 it('invoices reject reversed odometers and dates outside period; manual amounts survive calculation',()=>{
  const s=fixture(configs[0]),i=newInvoice(s);i.billTo='Simulation';i.dateFrom=i.dateTo='2026-07-01';i.loads=[tripLoad(s,'2026-07-01:24','2026-07-01:58')];i.loads[0].rate='0.55';i.loads[0].manualAmount=true;i.loads[0].amount='123.45';expect(validateInvoice(i).total).toBe(123.45);i.loads[0].odoFinish='1';expect(()=>validateInvoice(i)).toThrow();i.loads[0].odoFinish='100600';i.loads[0].loadDate='2026-07-02';expect(()=>validateInvoice(i)).toThrow();
 });
 it('one continuous three-calendar-month workspace preserves historical profiles, forms and invoices',async()=>{
  const months=configs.slice(0,3).map(c=>JSON.parse(readFileSync('simulation-output/'+c.name+'.json','utf8')) as Workspace);
  const s=months[0],driverId=s.profile.id;
  for(const source of months.slice(1)){
   for(const [date,day]of Object.entries(source.days))if(date>=source.books[0].firstDate){day.profile.id=driverId;s.days[date]=day;}
   source.forms.forEach(f=>{f.driverId=driverId;s.forms.push(f);});s.invoices.push(...source.invoices);
  }
  const standard=clone(months[0].profile),bfm=clone(months[1].profile),two=clone(months[2].profile);
  standard.effectiveFrom='2026-07-01';bfm.id=two.id=driverId;bfm.effectiveFrom='2026-08-01';two.effectiveFrom='2026-09-01';s.profileHistory=[standard,bfm];s.profile=two;
  for(const date of ['2026-07-31','2026-08-31'])ensureDay(s,date).restDefault='stationary';
  s.pages=[];
  for(let n=0;n<92;n++){
   const date=dateAdd('2026-07-01',n);s.pages.push({id:'continuous-'+n,bookId:'sim-book',number:String(n+1),date,status:'Active',reason:''});
   const r=analyse(s,date+'T24:00',2);expect(r.findings.filter(f=>f.severity==='breach'),date).toEqual([]);
   expect(s.days[date].profile.scheme).toBe(date<'2026-08-01'?'Standard':date<'2026-09-01'?'BFM':'Standard');expect(s.days[date].profile.twoUp).toBe(date>='2026-09-01');
  }
  expect(s.forms).toHaveLength(64);expect(s.invoices).toHaveLength(64);const backup=await exportBackup(s);expect((await inspectBackup(backup)).state.days).toEqual(s.days);
  writeFileSync('simulation-output/continuous-three-calendar-months-backup.json',backup);
 },120000);
 it('two-up moving sleeper rest cannot replace 52/82-hour stationary rest',()=>{
  for(const c of configs.filter(c=>c.twoUp)){
   const s=fixture(c);
   for(let n=0;n<30;n++){const d=s.days[dateAdd(c.start,n)];d.restDefault='sleeper-moving';for(const change of Object.values(d.changes))change.restType='sleeper-moving';}
   const r=analyse(s,dateAdd(c.start,29)+'T24:00',28);
   expect(r.findings.some(f=>f.code==='rest-'+(c.scheme==='BFM'?4920:3120)&&f.severity==='breach')).toBe(true);
  }
 },120000);
 it('BFM overnight work over 36 long/night hours is detected',()=>{
  const s=fixture(configs[1]);for(let n=0;n<30;n++)editRange(s,dateAdd(configs[1].start,n),0,96,'rest');
  for(let n=2;n<10;n++){const date=dateAdd(configs[1].start,n);editRange(s,date,88,96,'work');editRange(s,dateAdd(date,1),0,16,'work');editRange(s,dateAdd(date,1),17,25,'work');}
  const r=analyse(s,dateAdd(configs[1].start,11)+'T24:00',14);expect(r.findings.some(f=>f.code==='long-night'&&f.severity==='breach')).toBe(true);
 },120000);
 it('uncertain rest remains a review requirement rather than confirmed qualification',()=>{
  const s=fixture(configs[2]);for(let n=0;n<30;n++){const d=s.days[dateAdd(configs[2].start,n)];d.restDefault='unknown';for(const change of Object.values(d.changes))change.restType='unknown';}
  const r=analyse(s,'2026-09-30T24:00',28);expect(r.findings.some(f=>f.severity==='review')).toBe(true);expect(r.nextBreak).toBeNull();
 },120000);
 it('rejects impossible departure and arrival times before signing',()=>{
  const s=fixture(configs[0]),f=newForm(s);Object.assign(f.values,{date:'2026-07-01',depart:'06:00',arrive:'2026-07-01T14:30',from:'Rocklea',to:'Laverton North',pm:'SIM01'});allClear(f,'checks');allClear(f,'declarations');
  f.values.depart='99:99';expect(()=>validateForm(f)).toThrow();f.values.depart='06:00';f.values.arrive='2026-07-01T99:99';expect(()=>validateForm(f)).toThrow();f.values.arrive='2026-02-30T14:30';expect(()=>validateForm(f)).toThrow();
 });
 it('writes verified month summary',()=>{mkdirSync('simulation-output',{recursive:true});writeFileSync('simulation-output/summary.json',JSON.stringify(results,null,2));expect(results).toHaveLength(4);});
});
