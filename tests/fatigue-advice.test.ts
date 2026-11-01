import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {restTypeAt} from "../src/domain/rest";
import {buildTimeline} from "../src/domain/timeline";
import {analyse} from "../src/domain/rules";
import {fatigueGuidance} from "../src/domain/fatigue-guidance";
import {protectedRest} from "../src/domain/protected-rest";

const at=(iso:string)=>Date.parse(iso);
function scenario(){
 const s=emptyState();
 Object.assign(s.profile,{scheme:"BFM",base:"QLD",zone:"Australia/Brisbane",twoUp:false,
   certificate:"TEST-BFM",certificateExpiry:"2027-12-31"});
 const p=ensureDay(s,"2026-10-21");p.restDefault="stationary";
 const q=ensureDay(s,"2026-10-22");q.restDefault="stationary";
 editRange(s,"2026-10-21",86,89,"work");
 editRange(s,"2026-10-22",13,74,"work");
 return s;
}
describe("driver fatigue guidance",()=>{
 it("remaining long/night balance is calculated from assessed Work, not a daily reset",()=>{
  const s=scenario();
  const report=analyse(s,"2026-10-22T24:00",14,{now:at("2026-10-22T14:00:00Z")});
  const g=fatigueGuidance(report,s.days["2026-10-22"].profile);
  expect(g.longNightUsed).toBeGreaterThan(0);
  expect(g.longNightRemaining).toBe(2160-report.longNight);
  expect(g.nightRestsRemaining).toBe(Math.max(0,4-report.nightRests));
  expect(typeof g.pairMet).toBe("boolean");
  expect(g.work14Remaining===null||g.work14Remaining>=0).toBe(true);
 });
 it("does not apply the BFM solo 36-hour figure to Standard or two-up",()=>{
  const s=scenario();
  const report=analyse(s,"2026-10-22T24:00",14,{now:at("2026-10-22T14:00:00Z")});
  s.days["2026-10-22"].profile.twoUp=true;
  expect(fatigueGuidance(report,s.days["2026-10-22"].profile).longNightRemaining).toBeNull();
  s.days["2026-10-22"].profile.twoUp=false;
  s.days["2026-10-22"].profile.scheme="Standard";
  expect(fatigueGuidance(report,s.days["2026-10-22"].profile).longNightRemaining).toBeNull();
 });
 it("old solo moving sleeper remains recorded but does not qualify as major rest",()=>{
  const s=scenario();
  s.days["2026-10-22"].restDefault="sleeper-moving";
  s.days["2026-10-22"].changes[74]={slot:74,restType:"sleeper-moving",location:"",odometer:"",note:"",vehicle:""};
  const raw=s.days["2026-10-22"].changes[74].restType;
  const t=buildTimeline(s,"2026-10-22T24:00",at("2026-10-22T14:00:00Z"));
  expect(t.runs.filter(r=>r.kind==="rest"&&r.start>=at("2026-10-21T14:00:00Z")).every(r=>r.rest!=="sleeper-moving")).toBe(true);
  expect(restTypeAt(s,"2026-10-22",74)).toBe("unknown");
  expect(s.days["2026-10-22"].changes[74].restType).toBe(raw);
 });
 it("two-up moving sleeper is eligible only when co-driver is recorded",()=>{
  const s=scenario();s.days["2026-10-22"].profile.twoUp=true;
  s.days["2026-10-22"].restDefault="sleeper-moving";
  expect(restTypeAt(s,"2026-10-22",74)).toBe("unknown");
  s.days["2026-10-22"].profile.coDriver="Second Driver";
  expect(restTypeAt(s,"2026-10-22",74)).toBe("sleeper-moving");
 });
 it("future diary pages can show conservative yellow reserved Rest with a known prior 24h window",()=>{
  const s=scenario();
  const report=analyse(s,"2026-10-22T24:00",14,{now:at("2026-10-22T14:00:00Z")});
  const w=report.workWindows.find(w=>w.established&&!w.review&&w.requiredRest===420&&w.start==="2026-10-21 21:30");
  expect(w).toBeDefined();
  const future=protectedRest(s,"2026-10-22",[w!],at("2026-10-21T02:00:00Z")); // QLD Oct 21 noon
  expect(future?.latestStart).toBe(at("2026-10-22T04:30:00Z"));
  expect(future?.slots[58]).toBe("conflict");
  expect(future?.slots[74]).toBe("reserve");
 });
});
