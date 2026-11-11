import {describe,it,expect} from "vitest";
import {screenshotDays,screenshotWorkspace} from "./fixtures/nov-dec-64-screenshots";
import {analyse} from "../src/domain/rules";
import {instantFor} from "../src/domain/time";
const zone="Australia/Sydney";
function restLongest(source:"APS"|"DiaryMate",dateA:string,dateB:string,fromSlot:number,toSlot:number) {
 const map=new Map(screenshotDays(source).map(d=>[d.date,d.slots]));
 const slots=[...map.get(dateA)!.slice(fromSlot),...map.get(dateB)!.slice(0,toSlot)];
 let best=0,run=0;for(const cell of slots){run=cell==="rest"?run+1:0;best=Math.max(best,run);}
 return best*15;
}
describe("64 screenshot audit regressions — not a claim that DiaryMate is legally authoritative",()=>{
 it("retains the two independent original 32-day schedules without conflating inputs",()=>{
   const aps=screenshotDays("APS"),mate=screenshotDays("DiaryMate");
   expect(aps).toHaveLength(32);expect(mate).toHaveLength(32);
   expect(aps[0].date).toBe("2026-11-15");expect(aps.at(-1)?.date).toBe("2026-12-16");
   const work=(data:typeof aps)=>data.reduce((n,d)=>n+d.slots.filter(s=>s==="work").length*15,0);
   expect(work(aps)).toBe(333*60);
   expect(work(mate)).toBe(333*60);
   expect(aps.filter((d,i)=>d.slots.some((slot,j)=>slot!==mate[i].slots[j]))).toHaveLength(15);
 });
 it.each([
   ["2026-11-20","2026-11-21"],
   ["2026-12-04","2026-12-05"]
 ] as const)("captures the actual difference in seven-hour rest for %s–%s",(a,b)=>{
   expect(restLongest("APS",a,b,84,84)).toBe(360);
   expect(restLongest("DiaryMate",a,b,84,84)).toBe(420);
 });
 it.each(["2026-11-21","2026-12-05"] as const)("APS schedule must not silently accept missing major Rest on %s",date=>{
   const s=screenshotWorkspace("APS");
   const next=date==="2026-11-21"?"2026-11-22":"2026-12-06";
   const r=analyse(s,date+"T24:00",4,{now:instantFor(next,"00:00",zone)[0]});
   const previous=date==="2026-11-21"?"2026-11-20 21:00":"2026-12-04 21:00";
   const w=r.workWindows.find(w=>w.start===previous);
   expect(w?.work).toBe(720);
   expect(w?.status).toBe("Rest due");
   expect(Object.keys(r.breachSlots).some(key=>key.startsWith(date+":") &&
     r.breachSlots[key].some(reason=>reason.includes("7h continuous")))).toBe(true);
 });
});
