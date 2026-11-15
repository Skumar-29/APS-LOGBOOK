import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
const zone='Australia/Sydney';
describe('R-03: NHVR Standard Solo major-rest anchored versus sliding 24h',()=>{
 it('retains the NHVR Bob anchor and reports an independent 45-minute sliding discrepancy for review only',()=>{
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:'Bob R03',licence:'TEST',base:'NSW',zone,operation:'HVNL',scheme:'Standard',twoUp:false});
  for(const day of ['2026-11-08','2026-11-09','2026-11-10']){
   const d=ensureDay(s,day);d.restDefault='stationary';
  }
  // NHVR's Bob example: Monday noon break 90m; Work total exactly 12h.
  for(const [a,b] of [[24,45],[46,55],[61,79]])
   editRange(s,'2026-11-09',a,b,'work');
  // Tuesday: all short-period limits pass; original 6am anchor has 8h15m.
  for(const [a,b] of [[24,36],[38,50],[52,61]])
   editRange(s,'2026-11-10',a,b,'work');
  const r=analyse(s,'2026-11-10T24:00',3,{now:instantFor('2026-11-11','00:00',zone)[0]});
  const mon=r.workWindows.find(w=>w.start==='2026-11-09 06:00');
  const tue=r.workWindows.find(w=>w.start==='2026-11-10 06:00');
  expect(mon?.work).toBe(720);
  expect(mon?.status).not.toBe('Exceeded');
  expect(tue?.work).toBe(495);
  expect(tue?.status).not.toBe('Exceeded');
  expect(r.findings.some(f=>f.code==='cross-check-24'&&f.severity==='review')).toBe(true);
  expect(r.issues.join(' ')).toContain('R-03');
  expect(Object.values(r.breachSlots).flat().some(x=>x.includes('R-03'))).toBe(false);
 });
});
