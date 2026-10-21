import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {buildTimeline} from "../src/domain/timeline";

function fixture(twoUp:boolean) {
 const s=emptyState();
 Object.assign(s.profile,{name:"Test",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",twoUp,coDriver:twoUp?"Partner":""});
 const d=ensureDay(s,"2026-10-19");
 d.restDefault="sleeper-moving"; // Simulate previously saved blanket defaults.
 editRange(s,"2026-10-19",0,8,"rest");
 return s;
}
describe("sleeper berth qualification",()=>{
 it("never counts legacy moving-sleeper default as qualifying rest on solo pages",()=>{
  const s=fixture(false);
  const t=buildTimeline(s,"2026-10-19T24:00",Date.parse("2026-10-19T14:00:00Z"));
  expect(t.runs.filter(r=>r.kind==="rest").every(r=>r.rest!=="sleeper-moving")).toBe(true);
  expect(t.runs.some(r=>r.kind==="rest"&&r.rest==="unknown")).toBe(true);
  expect(s.days["2026-10-19"].restDefault).toBe("sleeper-moving");
 });
 it("keeps explicitly recorded moving sleeper for two-up periods",()=>{
  const s=fixture(true);
  const t=buildTimeline(s,"2026-10-19T24:00",Date.parse("2026-10-19T14:00:00Z"));
  expect(t.runs.some(r=>r.kind==="rest"&&r.rest==="sleeper-moving"&&r.profile.twoUp)).toBe(true);
 });
 it("does not rewrite old rest when two-up is switched off",()=>{
  const s=fixture(true);
  s.days["2026-10-19"].profile.twoUp=false;
  const t=buildTimeline(s,"2026-10-19T24:00",Date.parse("2026-10-19T14:00:00Z"));
  expect(t.runs.filter(r=>r.kind==="rest").every(r=>r.rest!=="sleeper-moving")).toBe(true);
  expect(s.days["2026-10-19"].restDefault).toBe("sleeper-moving");
 });
});
