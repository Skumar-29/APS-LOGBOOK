import type { Profile, RestType } from "./model";
import { civil, dateAdd, instantFor, MINUTE } from "./time";
import { countRest, type TimelineRun } from "./timeline";

export interface NightEvent {start:number;end:number;day:string;}
/** A change of hours option does not interrupt the actual continuous rest. */
export function restEpisodes(runs:TimelineRun[]) {
  const result:TimelineRun[]=[];
  for(const r of runs) {
    if(r.kind!=="rest") continue;
    const last=result.at(-1);
    if(last&&last.end===r.start&&last.rest===r.rest&&last.review===r.review&&last.clock===r.clock&&last.profile.zone===r.profile.zone) last.end=r.end;
    else result.push({...r});
  }
  return result;
}
/** Select disjoint qualifying rests; the same time cannot supply two night breaks. */
export function nightEvents(runs: TimelineRun[], a:number, b:number, zone:string): NightEvent[] {
  const candidates:NightEvent[]=[];
  for(const r of restEpisodes(runs)) {
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
export function restLabel(start:number,end:number,type:RestType,zone:string,p?:Pick<Profile,"scheme"|"twoUp">) {
  const minutes=countRest((end-start)/MINUTE);
  if(p&&(p.scheme==="AFM"||p.scheme==="ACH")) return {minutes,type,night:false,
    label:type==="unknown"?"Rest · confirm type":type==="stationary"?"Stationary rest · review":"Moving rest · review"};
  const major=p?.twoUp ? p.scheme==="BFM"?600:300 : 420;
  const night=type==="stationary" && (minutes>=1440 || minutes>=420&&nightEvents([{start,end,kind:"rest",rest:type,profile:{} as TimelineRun["profile"],review:false,clock:false}],start,end,zone).length>0);
  return {minutes,type,night,label:type==="unknown" ? "Rest · confirm type" : type==="sleeper-moving" ? p?.twoUp&&p.scheme==="Standard"&&minutes>=300?"Major sleeper rest":"Moving sleeper rest"
    : minutes>=1440 ? "24-hour rest" : night ? "Night rest" : minutes>=major ? "Major stationary rest" : "Rest break"};
}
