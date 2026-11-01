import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {drivingStatistics} from "../src/domain/driving-statistics";
import {analyse,type RuleReport,type Check} from "../src/domain/rules";
const dt="2026-11-01 12:00",z="Australia/Brisbane";
const row=(label:string,start:string,end:string,work:number,limit:number):Check=>({
 label,start,end,work,limit,rest:600,requiredRest:420,status:"Open period",
 remaining:limit-work,date:start.slice(0,10),reason:"",assessedThrough:dt,zone:z
});
function fixture(){
 const s=emptyState();Object.assign(s.profile,{base:"QLD",zone:z,scheme:"BFM",twoUp:false,
 certificate:"TEST",certificateExpiry:"2027-12-31"});
 ensureDay(s,"2026-11-01");
 const c24=row("1 day","2026-11-01 00:00","2026-11-02 00:00",120,840);
 const c14=row("14 days","2026-11-01 00:00","2026-11-15 00:00",500,8640);
 const mock:RuleReport={
  breachSlots:{},restSlots:{},workWindows:[],checks:[c24,c14],issues:[],findings:[],days:[],
  restClassifications:{},lastWork:"2026-10-31 10:00 — 2026-10-31 11:00 · 1h 00m",
  majorRest:"2026-10-31 00:00 · 24h 00m",nightRests:2,nightRestPair:false,
  longNight:300,workSince24:720,nextBreak:30,restartAt:null,controlling:c24,
  assessedThrough:dt,zone:z,source:"",version:"",revision:1
 };
 return {s,mock,c24,c14};
}
describe("Driving statistics dashboard evidence and deadlines",()=>{
 it("shows bounded Work availability, controls and active 14-day end without inventing release times",()=>{
  const {s,mock}=fixture();
  const d=drivingStatistics(s,mock,s.profile);
  expect(d.eligibleNow).toBe(true);
  expect(d.canWorkMinutes).toBe(30);
  expect(d.nextBreakDue).toBe("2026-11-01 12:30");
  expect(d.work24Used).toBe(120);
  expect(d.work24Remaining).toBe(720);
  expect(d.work14Used).toBe(500);
  expect(d.work14Remaining).toBe(8140);
  expect(d.current14DayEnds).toBe("2026-11-15 00:00");
  expect(d.longNightRemaining).toBe(1860);
  expect(d.work84Remaining).toBe(4320);
  expect(d.nightRestsRemaining).toBe(2);
  expect(d.consecutivePairMet).toBe(false);
  expect(d.nextHoursReleased).toContain("Not established");
  expect(d.next14DayPeriod).toContain("Calculated after");
 });
 it("never claims work is permissible with missing prior history",()=>{
  const {s,mock}=fixture();
  mock.issues=["Check earlier records · incomplete history"];
  const d=drivingStatistics(s,mock,s.profile);
  expect(d.eligibleNow).toBeNull();
  expect(d.canWorkMinutes).toBeNull();
  expect(d.eligibilityText).toBe("Needs review");
  expect(d.historicalReview).toBe(true);
 });
 it("does not invent a 14-day balance or deadline without an established window",()=>{
  const {s,mock,c24}=fixture();mock.checks=[c24];
  const d=drivingStatistics(s,mock,s.profile);
  expect(d.current14DayEnds).toBeNull();
  expect(d.work14Remaining).toBeNull();
  expect(d.nightRestDue).toContain("not established");
 });
 it("does not apply BFM 36-hour long/night and 84-hour counters to Standard or two-up",()=>{
  const {s,mock}=fixture();
  s.profile.scheme="Standard";
  const standard=drivingStatistics(s,mock,s.profile);
  expect(standard.longNightRemaining).toBeNull();
  expect(standard.work84Remaining).toBeNull();
  s.profile.scheme="BFM";s.profile.twoUp=true;
  const two=drivingStatistics(s,mock,s.profile);
  expect(two.longNightRemaining).toBeNull();
  expect(two.work84Remaining).toBeNull();
 });
 it("recognises incomplete rule history from the actual engine",()=>{
  const s=emptyState();
  Object.assign(s.profile,{base:"QLD",zone:z,scheme:"BFM"});
  ensureDay(s,"2026-11-01");
  const r=analyse(s,"2026-11-01T24:00",14,{now:Date.parse("2026-11-01T14:00:00Z")});
  const d=drivingStatistics(s,r,s.profile);
  expect(d.eligibleNow).toBeNull();
  expect(d.nextHoursReleased).toContain("Not established");
 });
});
