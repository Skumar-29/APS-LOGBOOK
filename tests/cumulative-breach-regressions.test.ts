import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {cumulativeLimits} from '../src/domain/cumulative-limits';
import {clone} from '../src/domain/model';
import {dateAdd,instantFor} from '../src/domain/time';
const zone='Australia/Melbourne';
const at=(date:string,time='00:00')=>instantFor(date,time,zone)[0];
function fixture(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Cumulative regression',licence:'TEST',base:'VIC',zone,scheme:'BFM',certificate:'TEST',certificateExpiry:'2027-12-31'});
 return s;
}
function fourteen(s:ReturnType<typeof fixture>,date:string){
 ensureDay(s,date);
 for(const [a,b] of [[27,51],[52,62],[63,73],[74,86]])editRange(s,date,a,b,'work');
}
describe('November cumulative breach comparison',()=>{
 it('flags the first 84-hour excess with no earlier 24-hour checkpoint',()=>{
  const s=fixture();
  for(let n=0;n<6;n++)fourteen(s,dateAdd('2026-11-06',n));
  editRange(s,'2026-11-12',27,28,'work');
  const r=analyse(s,'2026-11-12T07:00',14,{now:at('2026-11-12','07:00')});
  expect(r.workSince24).toBe(85*60-45);
  expect(r.breachSlots['2026-11-12:27']).toContain('84 hours work exceeded');
 });
 it('flags 144 hours in an established 14-day period despite incomplete older history',()=>{
  const s=fixture();
  for(let n=0;n<12;n++)fourteen(s,dateAdd('2026-11-06',n));
  const r=analyse(s,'2026-11-17T24:00',14,{now:at('2026-11-18')});
  expect(r.breachSlots['2026-11-17:43']).toContain('14 days work limit exceeded');
 });
 it('reports recorded 144-hour excess as a dated review when Rest types cannot establish a period',()=>{
  const s=fixture();
  for(let n=0;n<12;n++){fourteen(s,dateAdd('2026-11-06',n));s.days[dateAdd('2026-11-06',n)].restDefault='unknown';}
  const r=analyse(s,'2026-11-17T24:00',14,{now:at('2026-11-18')});
  expect(r.findings.some(f=>f.code==='work-review-20160'&&f.severity==='review')).toBe(true);
  expect(r.checks.some(c=>c.label==='14 days'&&c.work>8640&&c.reason.includes('recorded work exceeds'))).toBe(true);
  expect(r.nextBreak).toBeNull();
 });
 it('does not flag an 84-hour breach at exactly 84 hours',()=>{
  const s=fixture();for(let n=0;n<6;n++)fourteen(s,dateAdd('2026-11-06',n));
  const r=analyse(s,'2026-11-11T24:00',14,{now:at('2026-11-12')});
  expect(r.checkpoint84?.work).toBe(5040);expect(r.findings.some(f=>f.code==='work-84')).toBe(false);
 });
 it('retains red excess on subsequent days and preserves it after a later qualifying Rest',()=>{
  const s=fixture();for(let n=0;n<8;n++)fourteen(s,dateAdd('2026-11-06',n));
  ensureDay(s,'2026-11-14');ensureDay(s,'2026-11-15');
  const r=analyse(s,'2026-11-15T24:00',14,{now:at('2026-11-16')});
  expect(r.breachSlots['2026-11-12:27']).toContain('84 hours work exceeded');
  expect(r.breachSlots['2026-11-13:27']).toContain('84 hours work exceeded');
  expect(r.checkpoint84?.work).toBe(0);
 });
 it('does not invent an excess across a possible 24-hour Rest in missing history',()=>{
  const s=fixture();for(let n=0;n<4;n++)fourteen(s,dateAdd('2026-11-06',n));
  // 9 Nov 21:30 to 11 Nov 06:45 is long enough for a 24h Rest.
  for(let n=0;n<3;n++)fourteen(s,dateAdd('2026-11-11',n));
  const r=analyse(s,'2026-11-13T24:00',14,{now:at('2026-11-14')});
  expect(r.findings.some(f=>f.code==='work-84')).toBe(false);
  expect(r.checkpoint84?.work).toBe(42*60);
  expect(r.checkpoint84?.exact).toBe(false);
 });
 it('counts reviewed records as uncertain rather than confirmed excess',()=>{
  const s=fixture();for(let n=0;n<7;n++)fourteen(s,dateAdd('2026-11-06',n));
  s.days['2026-11-08'].review=true;
  const r=analyse(s,'2026-11-12T24:00',14,{now:at('2026-11-13')});
  expect(r.findings.some(f=>f.code==='work-84')).toBe(false);
 });
 it('detects the seventh-day 36h night cap despite missing older history',()=>{
  const s=fixture();for(let n=0;n<7;n++)editRange(s,dateAdd('2026-11-06',n),0,24,'work');
  const r=analyse(s,'2026-11-12T06:00',14,{now:at('2026-11-12','06:00')});
  expect(r.longNight).toBe(42*60);
  expect(r.breachSlots['2026-11-12:0']).toContain('36h long/night work exceeded');
  const row=cumulativeLimits(r,s.profile).find(c=>c.label==='7d long/night')!;
  expect(row.used).toBe(42*60);expect(row.status).toBe('Exceeded');
 });
 it('shows recorded 84h and 14d quantities without granting a new allowance',()=>{
  const s=fixture();for(let n=0;n<12;n++)fourteen(s,dateAdd('2026-11-06',n));
  const before=clone(s),r=analyse(s,'2026-11-17T24:00',14,{now:at('2026-11-18')});
  const rows=cumulativeLimits(r,s.profile);
  expect(rows.find(c=>c.label==='84h checkpoint')).toMatchObject({used:168*60,status:'Exceeded',lowerBound:true});
  expect(rows.find(c=>c.label==='14d Work')?.used).toBeGreaterThan(144*60);
  expect(rows.find(c=>c.label==='14d Work')?.status).toBe('Exceeded');
  expect(s).toEqual(before);expect(r.nextBreak).toBeNull();
 });
 it('keeps solo checkpoint and long/night limits out of two-up and Standard summaries',()=>{
  const s=fixture();fourteen(s,'2026-11-06');
  const r=analyse(s,'2026-11-06T24:00',14,{now:at('2026-11-07')});
  for(const p of [{...s.profile,twoUp:true},{...s.profile,scheme:'Standard' as const}])
   expect(cumulativeLimits(r,p).some(c=>c.label==='84h checkpoint'||c.label==='7d long/night')).toBe(false);
 });

});
