import { describe, it, expect } from "vitest";
import { clone, emptyState, ensureDay, saveDatedDriverProfile, profileOn, type Workspace } from "../src/domain/model";
import { editRange } from "../src/domain/diary";
import { analyse } from "../src/domain/rules";
import { instantFor } from "../src/domain/time";
import { validateState } from "../src/domain/backup";

function fixture() {
  const s=emptyState();
  Object.assign(s.profile,{name:"Old Driver",licence:"OLD",base:"NSW",zone:"Australia/Sydney",scheme:"Standard",effectiveFrom:"2026-10-01"});
  s.onboarded=true;
  for(const date of ["2026-10-18","2026-10-19","2026-10-20","2026-10-21"]) ensureDay(s,date);
  editRange(s,"2026-10-18",0,48,"work");
  editRange(s,"2026-10-19",0,52,"work");
  editRange(s,"2026-10-20",40,52,"work");
  s.days["2026-10-21"].profile.scheme="AFM"; // An explicit day-level customisation must be kept.
  return s;
}
function nextProfile(s:Workspace) {
  return {...s.profile,name:"Updated Driver",licence:"NEW",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM" as const,certificate:"BFM-TEST",certificateExpiry:"2027-12-31"};
}
describe("Settings effective dates on existing diary pages",()=>{
  it("updates a previously recorded Standard/NSW day from its selected effective date without touching Work/Rest cells",()=>{
    const s=fixture(),before18=clone(s.days["2026-10-18"]),before19=clone(s.days["2026-10-19"]);
    const before20=clone(s.days["2026-10-20"]),before21=clone(s.days["2026-10-21"]);
    expect(saveDatedDriverProfile(s,nextProfile(s),"2026-10-19")).toBe(2);
    expect(s.days["2026-10-18"]).toEqual(before18);
    expect(s.days["2026-10-19"].profile).toMatchObject({name:"Updated Driver",licence:"NEW",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM"});
    expect(s.days["2026-10-20"].profile.scheme).toBe("BFM");
    expect(s.days["2026-10-21"]).toEqual(before21);
    expect(s.days["2026-10-19"].slots).toEqual(before19.slots);
    expect(s.days["2026-10-20"].slots).toEqual(before20.slots);
    expect(s.days["2026-10-19"].changes).toEqual(before19.changes);
    expect(profileOn(s,"2026-10-18").scheme).toBe("Standard");
    expect(profileOn(s,"2026-10-19").scheme).toBe("BFM");
    expect(s.profileHistory.some(p=>p.base==="NSW"&&p.scheme==="Standard")).toBe(true);
    expect(s.audit.some(a=>a.action==="Apply effective driver settings"&&a.recordId==="2026-10-19")).toBe(true);
    validateState(s);
    const now=instantFor("2026-10-20","00:00","Australia/Brisbane")[0];
    const report=analyse(s,"2026-10-19T24:00",1,{now});
    expect(report.days[0].fragments.some(f=>f.kind==="work"&&f.profile.scheme==="BFM"&&f.profile.zone==="Australia/Brisbane")).toBe(true);
    expect(report.workWindows.some(w=>w.limit===840 && w.zone==="Australia/Brisbane")).toBe(true);
  });
  it("preserves later explicit profile-history dates rather than propagating beyond the next change",()=>{
    const s=fixture();
    s.profileHistory.push({...clone(s.profile),effectiveFrom:"2026-10-20",scheme:"Standard"});
    s.days["2026-10-20"].profile=clone(profileOn(s,"2026-10-20"));
    const before20=clone(s.days["2026-10-20"]);
    expect(saveDatedDriverProfile(s,nextProfile(s),"2026-10-19")).toBe(1);
    expect(s.days["2026-10-19"].profile.scheme).toBe("BFM");
    expect(s.days["2026-10-20"]).toEqual(before20);
  });
  it("does not give a future-effective BFM profile to an unrecorded earlier Standard day",()=>{
    const s=emptyState();
    Object.assign(s.profile,{name:"Old",licence:"OLD",base:"NSW",zone:"Australia/Sydney",scheme:"Standard",effectiveFrom:"2026-10-19"});
    saveDatedDriverProfile(s,{...s.profile,scheme:"BFM",base:"QLD",zone:"Australia/Brisbane"},"2026-10-19");
    expect(profileOn(s,"2026-10-18")).toMatchObject({scheme:"Standard",base:"NSW"});
    expect(profileOn(s,"2026-10-19")).toMatchObject({scheme:"BFM",base:"QLD"});
    expect(ensureDay(s,"2026-10-18").profile.scheme).toBe("Standard");
  });
  it("does not silently reinterpret exact timer links when the saved base time zone changes",()=>{
    const s=fixture(),before=clone(s);
    s.days["2026-10-19"].timerMap={0:["test-timer"]};
    expect(()=>saveDatedDriverProfile(s,nextProfile(s),"2026-10-19")).toThrow(/timed records/);
    expect(s.days["2026-10-19"].profile.scheme).toBe("Standard");
    expect(s.profile).toEqual(before.profile);
    expect(s.profileHistory).toEqual(before.profileHistory);
  });
});
