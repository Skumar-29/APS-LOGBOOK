import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
import {screenshotComparison} from './fixtures/nov-dec-2026-screenshots';

const zone='Australia/Sydney';
function prepare(source:'aps'|'reference') {
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Screenshot 32-day audit',licence:'TEST',base:'NSW',zone,operation:'HVNL',scheme:'BFM',twoUp:false,certificate:'TEST',certificateExpiry:'2027-12-31'});
 for(const d of screenshotComparison) {
  const day=ensureDay(s,d.date);
  day.slots=d[source].map(x=>x==='W'?'work':'rest');
  day.restDefault='stationary';
  day.review=false;
 }
 return s;
}
function audit(s:ReturnType<typeof prepare>,date:string) {
 const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const until=next.toISOString().slice(0,10);
 return analyse(s,date+'T24:00',28,{now:instantFor(until,'00:00',zone)[0]});
}
describe('32-day November–December visual comparison reproduction',()=>{
 it('preserves all 64 screenshot transcriptions with identical work totals',()=>{
  expect(screenshotComparison).toHaveLength(32);
  expect(screenshotComparison[0].date).toBe('2026-11-15');
  expect(screenshotComparison.at(-1)?.date).toBe('2026-12-16');
  expect(screenshotComparison.reduce((sum,d)=>sum+d.referenceWork,0)).toBe(333*60);
  expect(screenshotComparison.reduce((sum,d)=>sum+d.apsWork,0)).toBe(333*60);
  expect(screenshotComparison.filter(d=>d.differingSlots>0)).toHaveLength(15);
 });
 it.each(['2026-11-21','2026-12-05'])('rejects the actual APS %s six-hour split despite the BFM 14h cap',date=>{
  const s=prepare('aps');
  const r=audit(s,date);
  const prior=date==='2026-11-21'?'2026-11-20 21:00':'2026-12-04 21:00';
  const w=r.workWindows.find(w=>w.start===prior);
  expect(w).toBeDefined();
  expect(w!.work).toBeLessThanOrEqual(840);
  expect(w!.status).toBe('Rest due');
  expect(r.findings.some(f=>f.code==='rest-1440'&&f.severity==='breach'&&f.start===prior)).toBe(true);
 });
 it.each(['2026-11-21','2026-12-05'])('recognises qualifying seven-hour rest in the comparison schedule %s',date=>{
  const s=prepare('reference');
  const r=audit(s,date);
  const prior=date==='2026-11-21'?'2026-11-20 21:00':'2026-12-04 21:00';
  const w=r.workWindows.find(w=>w.start===prior);
  expect(w).toBeDefined();
  expect(w!.status).not.toBe('Rest due');
 });
});
