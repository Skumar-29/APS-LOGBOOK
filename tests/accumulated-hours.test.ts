import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {analyse} from "../src/domain/rules";
import {accumulatedHoursTable} from "../src/domain/accumulated-hours";
import {dateAdd,instantFor} from "../src/domain/time";
type Mode="Standard"|"BFM";
const zone="Australia/Brisbane";
function filled(scheme:Mode,twoUp:boolean){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:"Cumulative Hours Test",licence:"TEST",base:"QLD",zone,
   scheme,twoUp,operation:"HVNL",coDriver:twoUp?"OTHER":""});
 for(let i=0;i<14;i++){
  const date=dateAdd("2026-11-02",i);
  ensureDay(s,date).restDefault="stationary";
  editRange(s,date,24,32,"work"); // 6am–8am, exactly 2h per day
 }
 return s;
}
function check(s:ReturnType<typeof filled>){
 const now=instantFor("2026-11-16","00:00",zone)[0];
 const report=analyse(s,"2026-11-15T24:00",14,{now});
 return accumulatedHoursTable(s,report,s.profile);
}
describe("Video-style 14-day accumulated driver hours",()=>{
 it.each([
  ["Standard",false,8640],
  ["Standard",true,7200],
  ["BFM",false,8640],
  ["BFM",true,8400]
 ] as const)("%s twoUp=%s has the mode-correct 14d limit and 14 dated rows",(scheme,twoUp,limit)=>{
  const result=check(filled(scheme,twoUp));
  expect(result.limit).toBe(limit);
  expect(result.rows).toHaveLength(14);
  expect(result.rows[0].date).toBe("2026-11-02");
  expect(result.rows[13].date).toBe("2026-11-15");
  expect(result.rows[13].work).toBe(120);
  expect(result.rows[13].accumulated).toBe(28*60);
  expect(result.rows[13].hasHistory).toBe(true);
  expect(result.rows[13].remaining).toBe(limit-28*60);
  expect(result.isBfmSolo).toBe(scheme==="BFM"&&!twoUp);
 });
 it("does not present a positive hours allowance when past diary history is unknown",()=>{
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:"Missing history",licence:"TEST",base:"QLD",zone,
    scheme:"Standard",twoUp:false,operation:"HVNL"});
  ensureDay(s,"2026-11-15").restDefault="stationary";
  editRange(s,"2026-11-15",24,32,"work");
  const result=checkSingle(s);
  const last=result.rows.at(-1)!;
  expect(last.accumulated).toBeGreaterThanOrEqual(120);
  expect(last.hasHistory).toBe(false);
  expect(last.remaining).toBeNull();
 });
});
function checkSingle(s:ReturnType<typeof emptyState>){
 const now=instantFor("2026-11-16","00:00",zone)[0];
 return accumulatedHoursTable(s,analyse(s,"2026-11-15T24:00",14,{now}),s.profile);
}
