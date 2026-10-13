import {emptyState,ensureDay} from '../../src/domain/model';
import {editRange} from '../../src/domain/diary';
const qld='Australia/Brisbane',nsw='Australia/Sydney';
export function screenshotFixture(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.diaryRestDefault='stationary';
 Object.assign(s.profile,{base:'QLD',zone:qld,name:'Synthetic audit',licence:'TEST',certificate:'TEST',certificateExpiry:'2027-01-01'});
 const ranges:Record<string,number[][]>={
 '2026-10-06':[[80,96]],'2026-10-07':[[0,96]],
 '2026-10-08':[[0,24],[26,46],[48,60]],'2026-10-09':[[0,24],[26,46],[48,60]],
 '2026-10-10':[[0,10],[24,48],[49,59],[60,64]],
 '2026-10-11':[[24,46],[48,70],[72,76]],'2026-10-12':[[24,46],[48,70],[72,76]],
 '2026-10-13':[[4,25],[26,35],[36,46],[48,69],[70,79],[80,88]],
 '2026-10-14':[[36,46],[48,69],[70,79],[80,88]]};
 for(const [date,rs] of Object.entries(ranges)){
  const d=ensureDay(s,date),standard=['2026-10-06','2026-10-13','2026-10-14'].includes(date);
  Object.assign(d.profile,{scheme:standard?'Standard':'BFM',base:standard?'NSW':'QLD',zone:standard?nsw:qld});
  for(const [a,b] of rs)editRange(s,date,a,b,'work');
 }
 for(const slot of [24,35,46,47,72,73,94,95])editRange(s,'2026-10-07',slot,slot+1,'rest');
 return s;
}
