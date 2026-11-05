import {emptyState,ensureDay} from '../../src/domain/model';
import {editRange} from '../../src/domain/diary';
/** Synthetic VIC/BFM comparison, not a reconstruction of unseen diary history. */
export function novemberCumulative(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Cumulative regression',licence:'TEST',base:'VIC',zone:'Australia/Melbourne',scheme:'BFM',certificate:'TEST',certificateExpiry:'2027-12-31'});
 return s;
}
export function fourteenHours(s:ReturnType<typeof novemberCumulative>,date:string){
 ensureDay(s,date);
 for(const [a,b] of [[27,51],[52,62],[63,73],[74,86]])editRange(s,date,a,b,'work');
}
