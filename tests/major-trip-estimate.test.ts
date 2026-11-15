import {describe,it,expect} from 'vitest';
import {emptyState,clone,ensureDay} from '../src/domain/model';
import {estimateMajorTrip} from '../src/domain/major-trip';
import {instantFor} from '../src/domain/time';
const zone='Australia/Melbourne';
function fixture(){
 const s=emptyState();s.onboarded=true;
 Object.assign(s.profile,{base:'VIC',zone,operation:'HVNL',scheme:'BFM',twoUp:false,
  name:'Major trip test',licence:'TEST',certificate:'TEST',certificateExpiry:'2027-12-31'});
 ensureDay(s,'2026-11-15').restDefault='stationary';
 return s;
}
describe('Major Work/Rest trip estimate',()=>{
 it('calculates MEL-BNE one-way and return manually entered durations and ETA without altering the diary',()=>{
  const s=fixture(),before=clone(s);
  const trip={name:'MEL to BNE',workHours:20,restHours:12};
  const now=instantFor('2026-11-15','08:00',zone)[0];
  const one=estimateMajorTrip(s,trip,'one-way','2026-11-15','20:00',now);
  const two=estimateMajorTrip(s,trip,'return','2026-11-15','20:00',now);
  expect([one.totalWork,one.totalRest,one.elapsedMinutes]).toEqual([1200,720,1920]);
  expect([two.totalWork,two.totalRest,two.elapsedMinutes]).toEqual([2400,1440,3840]);
  expect(one.eta-one.start).toBe(32*3600000);
  expect(two.eta-two.start).toBe(64*3600000);
  expect(one.notes.join(' ')).toContain('timing');
  expect(s).toEqual(before);
 });
 it('does not approve a multiday Solo trip with fewer than 7h total Rest',()=>{
  const s=fixture(),now=instantFor('2026-11-15','08:00',zone)[0];
  const result=estimateMajorTrip(s,{name:'Short rest',workHours:22,restHours:3},'one-way','2026-11-15','20:00',now);
  expect(result.status).toBe('Not enough estimated rest');
 });
 it('rejects invalid quarter-hour estimates and departure times',()=>{
  const s=fixture();const trip={name:'Bad',workHours:20.1,restHours:12};
  expect(()=>estimateMajorTrip(s,trip,'one-way','2026-11-15','20:00')).toThrow(/quarter-hour/);
  expect(()=>estimateMajorTrip(s,{...trip,workHours:20},'one-way','2026-11-15','20:07')).toThrow(/15-minute/);
 });
});
