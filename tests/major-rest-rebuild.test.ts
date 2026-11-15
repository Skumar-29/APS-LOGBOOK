import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';

const zone='Australia/Sydney';
const at=(date:string,time='00:00')=>instantFor(date,time,zone)[0];
function fixture(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Mandatory major rest regression',licence:'TEST',base:'NSW',zone,operation:'HVNL',scheme:'BFM',twoUp:false,certificate:'TEST',certificateExpiry:'2027-12-31'});
 for(const date of ['2026-11-20','2026-11-21']){const d=ensureDay(s,date);d.restDefault='stationary';}
 // Mandatory 24h counting period begins after 7h stationary rest ending at 21:00.
 editRange(s,'2026-11-20',84,96,'work');
 editRange(s,'2026-11-21',24,48,'work');
 editRange(s,'2026-11-21',49,62,'work');
 return s;
}
describe('NHVR BFM 7h continuous-rest enforcement',()=>{
 it('does not misclassify a planned 6h+5h30m split as a normal compliant 7h rest',()=>{
  const s=fixture();
  const r=analyse(s,'2026-11-21T24:00',3,{now:at('2026-11-22')});
  const w=r.workWindows.find(w=>w.start==='2026-11-20 21:00');
  expect(w).toBeDefined();
  expect(w?.work).toBeLessThanOrEqual(14*60);
  expect(w?.status).toBe('Rest due');
  expect(r.findings.some(f=>f.code==='rest-1440'&&f.severity==='breach')).toBe(true);
 });
 it('shows selected Work in the final protected seven-hour interval as red',()=>{
  const s=fixture();
  // Fill a work quarter after the last permissible start of a qualifying rest.
  editRange(s,'2026-11-21',56,57,'work');
  const r=analyse(s,'2026-11-21T24:00',3,{now:at('2026-11-22')});
  expect(r.breachSlots['2026-11-21:56']).toContain('7h continuous stationary rest needed');
 });
 it('allows a genuine seven-hour stationary rest and does not raise the same finding',()=>{
  const s=fixture();
  // Stationary rest from 14:00 to 21:00, then Work after the window completes.
  editRange(s,'2026-11-21',49,56,'work');
  const r=analyse(s,'2026-11-21T24:00',3,{now:at('2026-11-22')});
  const w=r.workWindows.find(w=>w.start==='2026-11-20 21:00');
  expect(w?.status).not.toBe('Rest due');
 });
});
