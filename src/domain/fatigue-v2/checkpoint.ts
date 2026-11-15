import {counted,incomplete,type TimelineRun} from "../timeline";
import {MINUTE} from "../time";

export interface ResetSegment {
 from:number;to:number;confirmed:boolean;work:number;exact:boolean;
}
/** Conservative, independent 84h checkpoint proof.
 * A missing/uncertain interval is permitted to BE a 24h stationary Rest for
 * the purpose of bounding an excess, but it is NEVER certified as one.
 * Historical segments remain available after a later valid 24h reset.
 */
export function checkpointSegments(runs:readonly TimelineRun[],through:number):ResetSegment[] {
 const possible:Array<{start:number;end:number;confirmed:boolean}>=[];
 let candidate:{start:number;end:number;confirmedStart:number|null}|null=null;
 const close=()=>{
  if(candidate&&candidate.end-candidate.start>=1440*MINUTE)
   possible.push({
    start:candidate.start,end:candidate.end,
    confirmed:candidate.confirmedStart!==null&&candidate.end-candidate.confirmedStart>=1440*MINUTE
   });
  candidate=null;
 };
 for(const r of runs){
  if(r.start>=through)break;
  const end=Math.min(through,r.end);
  const uncertain=r.kind===null||r.review||r.clock;
  const eligible=uncertain || r.kind==="rest"&&r.rest!=="sleeper-moving";
  if(!eligible){close();continue;}
  if(!candidate||candidate.end!==r.start){
   close();candidate={start:r.start,end,confirmedStart:null};
  }else candidate.end=end;
  const proven=r.kind==="rest"&&r.rest==="stationary"&&!r.review&&!r.clock;
  if(proven)candidate.confirmedStart??=r.start;
  else candidate.confirmedStart=null;
 }
 close();
 const anchor=runs[0]?.start??through;
 const possibleAnchors=[{start:anchor,end:anchor,confirmed:false},...possible];
 const proofRuns=runs.filter(r=>r.kind!=="work"||!r.review&&!r.clock);
 return possibleAnchors.map((item,i)=>{
  const from=item.end,to=possibleAnchors[i+1]?.start??through;
  return {from,to,confirmed:item.confirmed,
   work:counted(proofRuns,from,to,"work"),
   exact:item.confirmed&&!incomplete(runs,from,to)};
 }).filter(s=>s.to>=s.from);
}
