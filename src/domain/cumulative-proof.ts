import type {TimelineRun} from './timeline';
import {counted,incomplete} from './timeline';
import {MINUTE} from './time';

/** Bounds for the 84h checkpoint when older history or Rest type is unconfirmed.
 * A missing/uncertain interval can be stationary Rest. Merge it with adjacent
 * stationary/unknown Rest before deciding whether a 24h reset was possible.
 * This never promotes an unconfirmed interval to a qualifying actual break.
 */
export function checkpointProof(runs:TimelineRun[],through:number){
 const possible:Array<{start:number;end:number;confirmed:boolean}>=[];
 let candidate:{start:number;end:number;confirmedStart:number|null}|null=null;
 const close=()=>{
  if(candidate&&candidate.end-candidate.start>=1440*MINUTE)
   possible.push({start:candidate.start,end:candidate.end,confirmed:candidate.confirmedStart!==null&&candidate.end-candidate.confirmedStart>=1440*MINUTE});
  candidate=null;
 };
 for(const r of runs){
  const uncertain=r.kind===null||r.review||r.clock;
  const eligible=uncertain||r.kind==='rest'&&r.rest!=='sleeper-moving';
  if(!eligible){close();continue;}
  if(!candidate||candidate.end!==r.start){close();candidate={start:r.start,end:r.end,confirmedStart:null};}
  else candidate.end=r.end;
  const confirmed=r.kind==='rest'&&r.rest==='stationary'&&!r.review&&!r.clock;
  if(confirmed)candidate.confirmedStart??=r.start;else candidate.confirmedStart=null;
 }
 close();
 const starts=[{start:runs[0]?.start??through,end:runs[0]?.start??through,confirmed:false},...possible];
 const segments=starts.map((r,i)=>({from:r.end,to:starts[i+1]?.start??through,confirmedAnchor:r.confirmed})).filter(x=>x.to>=x.from);
 const current=segments.at(-1)!;
 const proofRuns=runs.filter(r=>r.kind!=='work'||!r.review&&!r.clock);
 return {segments,current:{...current,work:counted(proofRuns,current.from,through,'work'),
  exact:current.confirmedAnchor&&!incomplete(runs,current.from,through)&&!runs.some(r=>r.clock&&r.end>current.from&&r.start<through)}};
}
