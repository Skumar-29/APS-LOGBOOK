import { assessmentTime, overlappingRestart, restartDay } from "./fixtures/bfm-overlapping-restart";
import { describe, it, expect } from "vitest";
import { emptyState,ensureDay } from "../src/domain/model";
import { editRange } from "../src/domain/diary";
import { analyse } from "../src/domain/rules";
import { protectedRest } from "../src/domain/protected-rest";

const when=(s:string)=>Date.parse(s);
function example(){
  const s=emptyState();
  Object.assign(s.profile,{base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
  const previous=ensureDay(s,"2026-10-21");previous.restDefault="stationary";
  const current=ensureDay(s,"2026-10-22");current.restDefault="stationary";
  // An actual preceding stationary major Rest anchors 24h at 21:30 Oct 21.
  editRange(s,"2026-10-21",86,89,"work"); // 21:30–22:15
  // Five hours of Rest ends 03:15; 03:15–18:30 was entered as Work.
  editRange(s,"2026-10-22",13,74,"work");
  const report=analyse(s,"2026-10-22T24:00",3,{now:when("2026-10-22T14:00:00Z")});
  return {s,report};
}
describe("Proactive 7-hour stationary Rest protection",()=>{
  it("protects 14:30–21:30 if an established window started at 21:30 the prior night",()=>{
    const {s,report}=example();
    const result=protectedRest(s,"2026-10-22",report.workWindows,when("2026-10-22T02:00:00Z")); // noon QLD
    expect(result).not.toBeNull();
    expect(result?.latestStart).toBe(when("2026-10-22T04:30:00Z"));
    expect(result?.deadline).toBe(when("2026-10-22T11:30:00Z"));
    expect(result?.slots[57]).toBeUndefined();
    expect(result?.slots[58]).toBe("conflict"); // 14:30 selected as Work
    expect(result?.slots[73]).toBe("conflict");
    expect(result?.slots[74]).toBe("reserve"); // 18:30 Rest
    expect(result?.slots[85]).toBe("reserve"); // 21:15 Rest
    expect(result?.slots[86]).toBeUndefined();
  });
  it("does not demand another 7h if a confirmed stationary 7h already occurred",()=>{
    const {s}=example();
    editRange(s,"2026-10-22",13,43,"rest");
    const report=analyse(s,"2026-10-22T24:00",3,{now:when("2026-10-22T14:00:00Z")});
    expect(protectedRest(s,"2026-10-22",report.workWindows,when("2026-10-22T02:00:00Z"))).toBeNull();
  });
  it("never credits missing history, unestablished periods, two-up or solo moving sleeper",()=>{
    const {s,report}=example();
    const doubtful=report.workWindows.map(w=>({...w,review:true}));
    expect(protectedRest(s,"2026-10-22",doubtful,when("2026-10-22T02:00:00Z"))).toBeNull();
    s.days["2026-10-22"].profile.twoUp=true;
    expect(protectedRest(s,"2026-10-22",report.workWindows,when("2026-10-22T02:00:00Z"))).toBeNull();
    s.days["2026-10-22"].profile.twoUp=false;
    s.days["2026-10-22"].restDefault="sleeper-moving";
    const revised=analyse(s,"2026-10-22T24:00",3,{now:when("2026-10-22T14:00:00Z")});
    // Invalid solo moving-sleeper metadata makes the rest type uncertain;
    // suppress predictive clearance until the actual stationary rest is confirmed.
    expect(protectedRest(s,"2026-10-22",revised.workWindows,when("2026-10-22T02:00:00Z"))).toBeNull();
  });
});

describe("Overlapping BFM restart options from the November diary", () => {
  const assess = (s: ReturnType<typeof overlappingRestart>) =>
    analyse(s, restartDay + "T24:00", 2, {
      now: when("2026-11-09T14:00:00Z"),
      liveThrough: assessmentTime,
    });

  it.each([
    [68, 72, "17:00"],
    [76, 80, "19:00"],
  ] as const)("credits planned stationary rest before restart at slot %s", (start, finish, clock) => {
    const s = overlappingRestart();
    editRange(s, restartDay, start, finish, "work");
    editRange(s, restartDay, 80, 96, "work");
    const report = assess(s);
    expect(report.workWindows).toEqual(expect.arrayContaining([
      expect.objectContaining({start: "2026-11-08 20:00", end: restartDay + " 20:00", work: 840}),
      expect.objectContaining({start: restartDay + " " + clock, work: 300}),
    ]));
    const protection = protectedRest(s, restartDay, report.workWindows, assessmentTime);
    for (let slot = start; slot < finish; slot++) {
      expect(protection?.slots[slot]).toBeUndefined();
      expect(report.breachSlots[restartDay + ":" + slot]).toBeUndefined();
    }
  });

  it("marks extra Work before 8 pm after the one remaining hour is used", () => {
    const s = overlappingRestart();
    editRange(s, restartDay, 68, 96, "work");
    const report = assess(s);
    for (let slot = 72; slot < 80; slot++) {
      expect(report.breachSlots[restartDay + ":" + slot]).toContain("24h work limit exceeded");
    }
    expect(report.breachSlots[restartDay + ":80"]).toBeUndefined();
  });

  it("retains projected rest protection when a restart interrupts rest at 6h 45m", () => {
    const s = overlappingRestart();
    editRange(s, restartDay, 67, 96, "work");
    const report = assess(s);
    expect(protectedRest(s, restartDay, report.workWindows, assessmentTime)?.slots[67]).toBe("conflict");
  });
});
