/** Shared immutable rule vocabulary. Mode tables remain separate and self-contained. */
export interface PeriodRule {
  minutes:number;limit:number|null;rest:number;
  type:"breaks"|"stationary"|"stationary-or-sleeper"|"weekly"|"nights";
  label:string;
}
export function row(minutes:number,limit:number|null,rest:number,type:PeriodRule["type"]):PeriodRule {
 return {minutes,limit,rest,type,label:minutes%1440===0?
  `${minutes/1440} day${minutes===1440?"":"s"}`:
  `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,"0")}m`};
}
