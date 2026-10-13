import {describe,it,expect} from "vitest";
import {clone,emptyState,ensureDay,recordProfile} from "../src/domain/model";
import {editRange,diaryCsv} from "../src/domain/diary";
import {analyse} from "../src/domain/rules";
import {planDiary} from "../src/domain/planning";
import {instantFor,dateAdd} from "../src/domain/time";
const zone="Australia/Brisbane",at=(v:string)=>instantFor(v.slice(0,10),v.slice(11,16),zone)[0];
function fixture(scheme:"Standard"|"BFM"="BFM",history=true,twoUp=false){
  const s=emptyState();Object.assign(s.profile,{base:"QLD",zone,scheme,twoUp,coDriver:twoUp?"Synthetic co-driver":"",coLicence:twoUp?"TESTCO":"",certificate:"TEST",certificateExpiry:"2027-01-01"});s.settings.autoPages=false;s.settings.diaryRestDefault="stationary";
  if(history)for(let n=0;n<43;n++)ensureDay(s,dateAdd("2026-09-01",n));return s;
}
describe("future planning stays separate from completed hours",()=>{
  it("matches the old BFM recording: midnight page totals and the shared 20:00 window",()=>{
    const s=fixture();editRange(s,"2026-10-10",80,96,"work");
    for(const [a,b] of [[0,8],[10,30],[32,44]])editRange(s,"2026-10-11",a,b,"work");
    const now=at("2026-10-11T03:00"),actual=analyse(s,"2026-10-11T24:00",2,{now}),before=clone(s);
    let plan=planDiary(s,"2026-10-11",now,actual)!;
    expect(actual.days.at(-1)).toMatchObject({work:150,rest:30});
    expect(plan.report.days.at(-1)).toMatchObject({work:600,rest:840});
    expect(plan.window).toMatchObject({start:"2026-10-10 20:00",end:"2026-10-11 20:00",work:840,limit:840});
    expect(plan.report.breachSlots).toEqual({});expect(s).toEqual(before);
    expect(diaryCsv(s,"2026-10-11","2026-10-11",actual)).toContain('"150","30"');
    editRange(s,"2026-10-11",44,45,"work");plan=planDiary(s,"2026-10-11",now,analyse(s,"2026-10-11T24:00",2,{now}))!;
    expect(plan.report.breachSlots["2026-10-11:44"]).toContain("24h work limit exceeded");expect(plan.breakDue).toBe("2026-10-11 11:00");
  });
  it.each([["Standard",21],["BFM",24]] as const)("%s forecasts the continuous-work boundary without counting future hours as completed",(scheme,slot)=>{
    const s=fixture(scheme);editRange(s,"2026-10-11",0,39,"work");const now=at("2026-10-10T12:00"),actual=analyse(s,"2026-10-11T24:00",1,{now});
    const p=planDiary(s,"2026-10-11",now,actual)!;
    expect(actual.days[0].work).toBe(0);expect(p.report.days.at(-1)!.work).toBe(585);
    expect(p.report.breachSlots[`2026-10-11:${slot}`]).toContain("15m break overdue");
    expect(p.breakDue).toBe(scheme==="Standard"?"2026-10-11 05:15":"2026-10-11 06:00");
  });
  it("seven planned hours rest do not erase the earlier 24-hour cap",()=>{
    const s=fixture();for(const [a,b] of [[0,16],[18,34],[36,52],[80,88]])editRange(s,"2026-10-11",a,b,"work");
    const now=at("2026-10-11T03:00"),actual=analyse(s,"2026-10-11T24:00",1,{now});
    const p=planDiary(s,"2026-10-11",now,actual)!;
    expect(p.report.workWindows.some(w=>w.start==="2026-10-11 00:00"&&w.work===840)).toBe(true);
    expect(p.report.workWindows.some(w=>w.start==="2026-10-11 20:00"&&w.work===120)).toBe(true);
    editRange(s,"2026-10-11",88,89,"work");
    expect(planDiary(s,"2026-10-11",now,actual)!.report.breachSlots["2026-10-11:88"]).toContain("24h work limit exceeded");
  });
  it("twenty hours rest starts a new counting period after the old period expires",()=>{
    const s=fixture();for(const [a,b] of [[0,16],[18,34],[36,52]])editRange(s,"2026-10-10",a,b,"work");
    // End at 13:00, then 20 continuous stationary hours to 09:00 next day.
    editRange(s,"2026-10-11",36,44,"work");const now=at("2026-10-10T03:00"),actual=analyse(s,"2026-10-11T24:00",2,{now});
    expect(planDiary(s,"2026-10-11",now,actual)!.window).toMatchObject({start:"2026-10-11 09:00",work:120});
  });
  it("freezes a running work timer so it cannot swallow a planned break",()=>{
    const s=fixture("Standard");s.timer={id:"live",kind:"work",start:at("2026-10-11T06:00"),restType:"unknown",zone,profile:recordProfile(s.profile),vehicle:"TEST"};
    editRange(s,"2026-10-11",44,60,"work");const now=at("2026-10-11T10:00"),before=clone(s),actual=analyse(s,"2026-10-11T24:00",1,{now});
    const p=planDiary(s,"2026-10-11",now,actual)!;
    expect(actual.days[0].work).toBe(240);expect(p.report.days.at(-1)!.work).toBe(480);expect(s).toEqual(before);
    expect(p.report.days.at(-1)!.fragments.some(f=>f.kind==="rest"&&f.start===now&&f.end===at("2026-10-11T11:00"))).toBe(true);
  });
  it("uses the new window when the earlier window has expired before the next planned work",()=>{
    const s=fixture();editRange(s,"2026-10-10",80,96,"work");for(const [a,b] of [[0,8],[10,30],[32,44],[88,96]])editRange(s,"2026-10-11",a,b,"work");
    const now=at("2026-10-11T21:00"),actual=analyse(s,"2026-10-11T24:00",2,{now}),p=planDiary(s,"2026-10-11",now,actual)!;
    expect(p.report.workWindows.some(w=>w.start==="2026-10-10 20:00"&&w.work===840)).toBe(true);
    expect(p.window).toMatchObject({start:"2026-10-11 22:00",end:"2026-10-12 22:00",work:120,limit:840});
    expect(p.continuousUntil).toBe("2026-10-12 04:00");
  });
  it.each([["Standard",21],["BFM",56]] as const)("two-up %s uses its own projected work limits",(scheme,slot)=>{
    const s=fixture(scheme,true,true);editRange(s,"2026-10-11",0,60,"work");const now=at("2026-10-10T12:00"),actual=analyse(s,"2026-10-11T24:00",1,{now}),p=planDiary(s,"2026-10-11",now,actual)!;
    expect(p.report.breachSlots[`2026-10-11:${slot}`]).toContain(scheme==="Standard"?"15m break overdue":"24h work limit exceeded");
    expect(actual.days[0].work).toBe(0);
  });
  it("flags the 22-hour screenshot despite an unknown earlier anchor, without inventing a legal start",()=>{
    const s=fixture("Standard",false);editRange(s,"2026-10-11",0,96,"work");for(const slot of [21,31,42,43,65,74,86,87])editRange(s,"2026-10-11",slot,slot+1,"rest");
    const r=analyse(s,"2026-10-11T24:00",1,{now:at("2026-10-12T00:00")});
    expect(r.days[0]).toMatchObject({work:1320,rest:120});expect(Object.keys(r.breachSlots).length).toBeGreaterThan(0);
    expect(r.findings.some(f=>f.code==="work-history"&&f.severity==="review")).toBe(true);expect(r.nextBreak).toBeNull();
    expect(r.issues).toContain("7h continuous stationary rest needed");expect(r.issues.join(" ")).not.toContain("6h 30m more");
    const now=at("2026-10-10T12:00"),actual=analyse(s,"2026-10-11T24:00",1,{now}),p=planDiary(s,"2026-10-11",now,actual)!;
    expect(p.warning).toBe("Excess work · check earlier records");expect(p.review).toBe(true);expect(p.breakDue).toBeNull();
  });
});
