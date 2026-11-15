import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
const date='2026-11-12',zone='Australia/Sydney';
const at=(t:string)=>instantFor(date,t,zone)[0];
describe('R-01 partial Rest counting safeguard',()=>{
 it('keeps 12-minute recorded Rest factual but withholds affirmative availability until counted Work is resolved',()=>{
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:'Twelve-minute raw Rest',licence:'TEST',base:'NSW',zone,scheme:'Standard',twoUp:false,operation:'HVNL'});
  ensureDay(s,'2026-11-11').restDefault='stationary';
  const d=ensureDay(s,date);d.restDefault='stationary';
  editRange(s,date,24,46,'work');
  const core={zone,vehicle:'TEST',restType:'stationary' as const,profile:{...s.profile}};
  s.activities.push(
   {...core,id:'12m-rest',kind:'rest',start:at('08:45'),end:at('08:57')},
   {...core,id:'3m-work',kind:'work',start:at('08:57'),end:at('09:00')},
  );
  d.timerMap={'35':['12m-rest','3m-work']};
  const r=analyse(s,date+'T11:30',2,{now:at('11:30')});
  expect(r.issues.some(x=>x.includes('R-01'))).toBe(true);
  expect(r.findings.some(f=>f.code==='rounding-rest-review'&&f.severity==='review')).toBe(true);
  expect(r.nextBreak).toBeNull();
  expect(s.activities[0].end-s.activities[0].start).toBe(12*60000);
 });
});
