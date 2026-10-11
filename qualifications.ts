import type { RestType } from "./model";
import { civil, dateAdd, instantFor, MINUTE } from "./time";
import { countRest, type TimelineRun } from "./timeline";

export interface NightEvent {start:number;end:number;day:string;}
/** Select disjoint qualifying rests; the same time cannot supply two night breaks. */
export function nightEvents(runs: TimelineRun[], a:number, b:number, zone:string): NightEvent[] {
  const candidates:NightEvent[]=[];
  for(const r of runs) {
    if(r.kind!=="rest" || r.rest!=="stationary" || r.review || r.clock) continue;
    const start=Math.max(a,r.start), end=Math.min(b,r.end);
    if(end-start < 420*MINUTE) continue;
    for(let date=dateAdd(civil(start,zone).date,-1);date<=civil(end,zone).date;date=dateAdd(date,1)) {
      const x=instantFor(date,"22:00",zone)[0], y=instantFor(dateAdd(date,1),"08:00",zone)[0];
      const from=Math.max(start,x);
      if(Math.min(end,y)-from >= 420*MINUTE) candidates.push({start:from,end:from+420*MINUTE,day:date});
    }
    // 24 continuous stationary hours qualify independently of the 22:00–08:00 band.
    for(let from=start;from+1440*MINUTE<=end;from+=1440*MINUTE)
      candidates.push({start:from,end:from+1440*MINUTE,day:civil(from,zone).date});
  }
  candidates.sort((x,y)=>x.end-y.end || x.start-y.start);
  const events:NightEvent[]=[];
  for(const e of candidates) if(!events.length || e.start>=events.at(-1)!.end) events.push(e);
  return events;
}
export function hasPair(events:NightEvent[]) {
  const days=new Set(events.map(e=>e.day));
  return [...days].some(d=>days.has(dateAdd(d,1)));
}
export function restLabel(start:number,end:number,type:RestType,zone:string) {
  const minutes=countRest((end-start)/MINUTE);
  const night=type==="stationary" && (minutes>=1440 || minutes>=420&&nightEvents([{start,end,kind:"rest",rest:type,profile:{} as TimelineRun["profile"],review:false,clock:false}],start,end,zone).length>0);
  return {minutes,type,night,label:type==="unknown" ? "Rest · confirm type" : type==="sleeper-moving" ? "Moving sleeper rest"
    : minutes>=1440 ? "24-hour rest" : night ? "Night rest" : minutes>=420 ? "Major stationary rest" : "Rest break"};
}
