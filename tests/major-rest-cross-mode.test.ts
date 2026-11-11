import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {analyse} from "../src/domain/rules";
import {protectedRest} from "../src/domain/protected-rest";
const zone="Australia/Brisbane";
const moment=(local:string)=>Date.parse(local+"+10:00");
function example(scheme:"Standard"|"BFM",twoUp=false) {
  const s=emptyState();
  Object.assign(s.profile,{scheme,twoUp,base:"QLD",zone,operation:"HVNL",
    coDriver:twoUp?"Co-driver":"",coLicence:twoUp?"TEST":"",certificate:"TEST",certificateExpiry:"2027-12-31"});
  s.settings.diaryRestDefault="stationary";
  ensureDay(s,"2026-11-20");
  ensureDay(s,"2026-11-21");
  editRange(s,"2026-11-20",80,84,"work");
  return s;
}
describe("mandatory major Rest is a Work-breach decision, not a separate conflict type",()=>{
  it.each(["Standard","BFM"] as const)("%s Solo marks Work that blocks the last possible 7h",scheme=>{
    const s=example(scheme);
    editRange(s,"2026-11-21",0,32,"work");
    editRange(s,"2026-11-21",56,60,"work");
    const r=analyse(s,"2026-11-21T24:00",3,{now:moment("2026-11-22T00:00")});
    const window=r.workWindows.find(w=>w.start==="2026-11-20 20:00");
    expect(window?.status).toBe("Rest due");
    expect(window?.rest).toBeGreaterThan(0);
    for(const slot of [56,57,58,59])
      expect(r.breachSlots["2026-11-21:"+slot]).toContain("7h continuous stationary rest needed");
    expect(r.restSlots["2026-11-21:60"]).toBeUndefined();
  });
  it("Standard Two-up demands its 5h Rest even without a 24h Work excess",()=>{
    const s=example("Standard",true);
    editRange(s,"2026-11-21",0,24,"work");
    editRange(s,"2026-11-21",40,48,"work");
    editRange(s,"2026-11-21",60,64,"work");
    const r=analyse(s,"2026-11-21T24:00",3,{now:moment("2026-11-22T00:00")});
    expect(r.workWindows.find(w=>w.start==="2026-11-20 20:00")?.status).toBe("Rest due");
    expect(r.breachSlots["2026-11-21:60"]).toContain("5h continuous qualifying rest needed");
  });
  it("BFM Two-up does not invent a 7h or 5h major Rest in its 24h rule",()=>{
    const s=example("BFM",true);
    editRange(s,"2026-11-21",0,24,"work");
    editRange(s,"2026-11-21",40,48,"work");
    editRange(s,"2026-11-21",60,64,"work");
    const r=analyse(s,"2026-11-21T24:00",3,{now:moment("2026-11-22T00:00")});
    expect(r.workWindows.every(w=>w.requiredRest===0)).toBe(true);
    expect(Object.values(r.breachSlots).flat().some(x=>/7h continuous|5h continuous/.test(x))).toBe(false);
  });
  it("protects a saved future BFM Solo page beyond 28 days of today's date",()=>{
    const s=example("BFM");
    const previous=ensureDay(s,"2026-12-15"),next=ensureDay(s,"2026-12-16");
    previous.restDefault="stationary";next.restDefault="stationary";
    editRange(s,"2026-12-15",80,84,"work");
    editRange(s,"2026-12-16",0,32,"work");
    const r=analyse(s,"2026-12-16T24:00",3,{now:moment("2026-12-17T00:00")});
    const rest=protectedRest(s,"2026-12-16",r.workWindows,moment("2026-11-11T12:00"));
    expect(rest?.slots[52]).toBe("reserve");
  });
});