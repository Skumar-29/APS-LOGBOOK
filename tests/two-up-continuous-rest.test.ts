import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
const zone='Australia/Brisbane';
function create(scheme:'Standard'|'BFM'){
 const s=emptyState();s.onboarded=true;
 Object.assign(s.profile,{name:'Two-up rest test',licence:'TEST',base:'QLD',zone,
  operation:'HVNL',scheme,twoUp:true,coDriver:'SECOND',coLicence:'TEST2',
  certificate:'TEST',certificateExpiry:'2027-12-31'});
 return s;
}
const at=(date:string,time:string)=>instantFor(date,time,zone)[0];
describe('Missing continuous Rest highlights selected Work in each two-up mode',()=>{
 it('Standard Two-up: exactly 12h Work but no 5h continuous Rest breaches the 24h rest requirement',()=>{
  const s=create('Standard');
  ensureDay(s,'2026-11-19').restDefault='stationary';
  ensureDay(s,'2026-11-20').restDefault='stationary';
  for(const [a,b] of [[0,20],[36,56],[72,80]])editRange(s,'2026-11-20',a,b,'work');
  const r=analyse(s,'2026-11-20T24:00',2,{now:at('2026-11-21','00:00')});
  const w=r.workWindows.find(w=>w.start==='2026-11-20 00:00');
  expect(w?.work).toBe(720);
  expect(w?.status).toBe('Rest due');
  expect(r.breachSlots['2026-11-20:76'].some(x=>x.includes('5h continuous'))).toBe(true);
 });
 it('BFM Two-up: no 10h stationary Rest in 82h reports red Work before deadline',()=>{
  const s=create('BFM');
  ensureDay(s,'2026-11-16').restDefault='stationary';
  for(const date of ['2026-11-17','2026-11-18','2026-11-19','2026-11-20']){
   ensureDay(s,date).restDefault='stationary';
   for(const [a,b] of [[0,4],[36,40],[72,76]])editRange(s,date,a,b,'work');
  }
  const r=analyse(s,'2026-11-20T10:00',5,{now:at('2026-11-20','10:00')});
  const w=r.checks.find(c=>c.label==='82h 00m'&&c.start==='2026-11-17 00:00');
  expect(w?.status).toBe('Rest due');
  expect(r.breachSlots['2026-11-20:36']).toContain('10h continuous stationary rest needed');
 });
});
