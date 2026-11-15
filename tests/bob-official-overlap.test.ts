import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
const zone='Australia/Sydney';
const at=(d:string,t:string)=>instantFor(d,t,zone)[0];
function bob(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{base:'NSW',zone,scheme:'Standard',twoUp:false,
  operation:'HVNL',name:'Bob official example',licence:'TEST'});
 for(const date of ['2026-11-08','2026-11-09','2026-11-10'])
  ensureDay(s,date).restDefault='stationary';
 for(const [a,b] of [[24,45],[46,55],[61,79]])
  editRange(s,'2026-11-09',a,b,'work');
 return s;
}
describe('NHVR written diary Bob example — overlapping 24h periods',()=>{
 it('does not allow a 02:45 Tuesday restart when Monday 06:00 period exhausted 12h',()=>{
  const s=bob();
  editRange(s,'2026-11-10',11,12,'work'); // Tue 02:45–03:00
  const r=analyse(s,'2026-11-10T03:00',3,{now:at('2026-11-10','03:00')});
  const old=r.workWindows.find(w=>w.start==='2026-11-09 06:00');
  expect(old?.work).toBe(12*60+15);
  expect(old?.status).toBe('Exceeded');
  expect(r.breachSlots['2026-11-10:11']).toContain('24h work limit exceeded');
 });
 it('does not carry the previous 24h ban past 06:00 Tuesday without further Work in that old period',()=>{
  const s=bob();
  editRange(s,'2026-11-10',24,25,'work'); // Tue 06:00–06:15
  const r=analyse(s,'2026-11-10T06:15',3,{now:at('2026-11-10','06:15')});
  expect(r.breachSlots['2026-11-10:24']||[]).not.toContain('24h work limit exceeded');
  expect(r.workWindows.find(w=>w.start==='2026-11-10 06:00')).toBeDefined();
 });
});
