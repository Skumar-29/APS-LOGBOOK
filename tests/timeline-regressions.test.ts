import { describe, it, expect } from "vitest";
import { emptyState, ensureDay, clone, recordProfile, upgradeWorkspace, type Workspace, type RestType } from "../src/domain/model";
import { editRange, finishTimer, switchTimer, diaryCsv } from "../src/domain/diary";
import { analyse } from "../src/domain/rules";
import { buildTimeline, countWork, countRest, assessedDay } from "../src/domain/timeline";
import { nightEvents, restLabel } from "../src/domain/qualifications";
import { instantFor, dateAdd, MINUTE } from "../src/domain/time";
import { diaryPage } from "../src/documents/diary-pages";
import {validateState} from "../src/domain/backup";

const at=(value:string)=>instantFor(value.slice(0,10),value.slice(11,16),"Australia/Brisbane")[0];
function fixture(scheme:"Standard"|"BFM"="Standard") {
  const s=emptyState();
  Object.assign(s.profile,{scheme,base:"QLD",zone:"Australia/Brisbane",certificate:"TEST",certificateExpiry:"2027-01-01"});
  s.settings.diaryRestDefault="stationary";s.settings.autoPages=false;
  for(let n=0;n<41;n++) ensureDay(s,dateAdd("2026-09-01",n));
  return s;
}
function timer(s:Workspace,kind:"work"|"rest",start:string,end?:string,restType:RestType="stationary") {
  s.timer={id:crypto.randomUUID(),kind,start:at(start),zone:s.profile.zone,vehicle:"TEST",restType,profile:recordProfile(s.profile)};
  if(end) finishTimer(s,at(end));
}
const report=(s:Workspace,cutoff:string,range=2)=>analyse(s,cutoff,range,{now:at(cutoff)});

describe("overnight and active timer regressions",()=>{
  it.each(["Standard","BFM"] as const)("keeps %s work across midnight and flags the first overdue block",scheme=>{
    const s=fixture(scheme);timer(s,"work","2026-10-10T20:15","2026-10-11T03:00");
    const r=report(s,"2026-10-11T03:00");
    expect(r.days.map(d=>d.work)).toEqual([225,180]);
    expect(r.days.reduce((n,d)=>n+d.work,0)).toBe(405);
    const first=scheme==="Standard"?6:9;
    expect(Object.keys(r.breachSlots).filter(k=>k.startsWith("2026-10-11:"))).toEqual(Array.from({length:12-first},(_,i)=>`2026-10-11:${first+i}`));
    expect(r.findings.find(f=>f.code===`work-${scheme==="Standard"?330:375}`)?.at).toBe(`2026-10-11 ${scheme==="Standard"?"01:30":"02:15"}`);
  });
  it("gives the active timer the same hours as a completed record without changing data",()=>{
    const s=fixture();timer(s,"work","2026-10-10T20:15");const before=clone(s);
    const active=report(s,"2026-10-11T03:00");expect(s).toEqual(before);
    finishTimer(s,at("2026-10-11T03:00"));const completed=report(s,"2026-10-11T03:00");
    expect(active.days.map(d=>d.work)).toEqual(completed.days.map(d=>d.work));
    expect(active.breachSlots).toEqual(completed.breachSlots);
  });
  it("still proves a short-period breach when earlier major-rest history is missing",()=>{
    const s=emptyState();Object.assign(s.profile,{base:"QLD",zone:"Australia/Brisbane"});
    s.settings.diaryRestDefault="stationary";editRange(s,"2026-10-10",81,12,"work",true);
    const r=report(s,"2026-10-11T03:00");
    expect(r.breachSlots["2026-10-11:6"]).toContain("15m break overdue");
    expect(r.nextBreak).toBeNull();expect(r.issues.join(" ")).toContain("incomplete history");
  });
  it("does not clear continuing overdue work when the original short period expires",()=>{
    const s=fixture();editRange(s,"2026-10-10",0,36,"work");
    const r=report(s,"2026-10-10T09:00");
    expect(r.breachSlots["2026-10-10:35"]).toContain("15m break overdue");expect(r.nextBreak).toBe(0);
  });
});

describe("exact intervals, rounding and corrections",()=>{
  it("counts 17 work minutes as 30, although the view touches three cells",()=>{
    const s=fixture();timer(s,"work","2026-10-10T10:14","2026-10-10T10:31");
    expect(s.days["2026-10-10"].slots.slice(40,43)).toEqual(["work","work","work"]);
    const r=report(s,"2026-10-10T10:31");expect(r.days.at(-1)?.work).toBe(30);
    expect(r.days.at(-1)?.fragments.find(f=>f.kind==="work")).toMatchObject({startSlot:40+14/15,endSlot:42+1/15,work:30});
    expect(diaryPage(assessedDay(s.days["2026-10-10"],r.days.at(-1)),null,null)).toContain("0h 30m");
    const csv=diaryCsv(s,"2026-10-10","2026-10-10",r);
    expect(csv).toContain('"2026-10-10 10:14","2026-10-10 10:31","work"');
    expect(csv.split("\r\n").filter(row=>row.includes('"Daily total"'))).toHaveLength(1);
    expect(csv.split("\r\n").find(row=>row.includes('"work"'))).toContain('"30","0","",""');
  });
  it.each([[15,15],[15+1/60,30],[17,30],[32,45],[57,60]])("rounds %s work minutes to %s",(actual,expected)=>expect(countWork(actual)).toBe(expected));
  it.each([[12,0],[15,15],[17,15],[44,30],[57,45]])("rounds %s rest minutes to %s",(actual,expected)=>expect(countRest(actual)).toBe(expected));
  it("rounds a continuous off-quarter timer once across midnight",()=>{
    const s=fixture();timer(s,"work","2026-10-10T23:59","2026-10-11T00:16");
    const r=report(s,"2026-10-11T00:16");expect(r.days.map(d=>d.work)).toEqual([15,15]);
    expect(r.days.reduce((n,d)=>n+d.work,0)).toBe(30);
  });
  it("uses manual corrections over raw timer footprints and restores exact counts with undo",()=>{
    const s=fixture();timer(s,"work","2026-10-10T10:14","2026-10-10T10:31");const saved=clone(s.days["2026-10-10"]),raw=clone(s.activities);
    editRange(s,"2026-10-10",40,43,"rest");expect(report(s,"2026-10-10T10:31").days.at(-1)?.work).toBe(0);expect(s.activities).toEqual(raw);
    s.days[saved.date]=saved;expect(report(s,"2026-10-10T10:31").days.at(-1)?.work).toBe(30);
  });
  it("migrates legacy timer footprints without undoing a later correction",()=>{
    const s=fixture();timer(s,"work","2026-10-10T10:14","2026-10-10T10:31");delete s.days["2026-10-10"].timerMap;
    upgradeWorkspace(s);expect(report(s,"2026-10-10T10:31").days.at(-1)?.work).toBe(30);
    delete s.settings.timelineVersion;editRange(s,"2026-10-10",40,43,"rest");upgradeWorkspace(s);
    expect(report(s,"2026-10-10T10:31").days.at(-1)?.work).toBe(0);
  });
  it("records a change from stationary to moving sleeper as a separate factual interval",()=>{
    const s=fixture();switchTimer(s,"rest","TEST","stationary",at("2026-10-10T08:00"));switchTimer(s,"rest","TEST","sleeper-moving",at("2026-10-10T09:00"));
    expect(s.activities.at(-1)).toMatchObject({kind:"rest",restType:"stationary",end:at("2026-10-10T09:00")});expect(s.timer?.restType).toBe("sleeper-moving");
  });
  it("does not create a work cell when a timer is immediately finished",()=>{
    const s=fixture();timer(s,"work","2026-10-10T10:14");finishTimer(s,at("2026-10-10T10:14"));
    expect(report(s,"2026-10-10T10:14").days.at(-1)?.work).toBe(0);expect(s.timer).toBeNull();
  });
  it("keeps a recorded short rest's physical setting without a completed grid cell",()=>{
    const s=fixture();s.days["2026-10-10"].restDefault="unknown";timer(s,"work","2026-10-10T00:00","2026-10-10T06:00");timer(s,"rest","2026-10-10T06:00","2026-10-10T06:14");
    const timeline=buildTimeline(s,"2026-10-10T06:14",at("2026-10-10T06:14"));expect(timeline.runs.at(-1)).toMatchObject({kind:"rest",rest:"stationary"});
  });
  it("retains exact timer links through JSON backup validation",()=>{
    const s=fixture();timer(s,"work","2026-10-10T10:14","2026-10-10T10:31");
    const restored=JSON.parse(JSON.stringify(s));validateState(restored);
    expect(report(restored,"2026-10-10T10:31").days.at(-1)?.work).toBe(30);
    expect(restored.activities).toEqual(s.activities);
  });
  it("rejects dangling timer links instead of silently replacing work with rest",()=>{
    const s=fixture();s.days["2026-10-10"].timerMap={40:["missing-activity"]};
    expect(()=>validateState(s)).toThrow("Invalid timer links");
  });
});

describe("elapsed rest and physical qualifications",()=>{
  it("excludes future work and rest on a partly completed day",()=>{
    const s=fixture();editRange(s,"2026-10-10",0,48,"work");editRange(s,"2026-10-10",80,88,"work");
    const r=analyse(s,"2026-10-10T24:00",1,{now:at("2026-10-10T13:00")});
    expect(r.days[0]).toMatchObject({work:720,rest:60,unknown:0});
    expect(r.restClassifications["2026-10-10:48"].minutes).toBe(60);
    expect(r.breachSlots["2026-10-10:80"]).toBeUndefined();
  });
  it("credits a 14-minute live rest as zero, then 15 minutes at the boundary",()=>{
    const s=fixture();timer(s,"work","2026-10-10T00:00","2026-10-10T06:00");timer(s,"rest","2026-10-10T06:00");
    expect(report(s,"2026-10-10T06:14").days.at(-1)?.rest).toBe(0);
    expect(report(s,"2026-10-10T06:15").days.at(-1)?.rest).toBe(15);
  });
  it.each([["2026-10-09T20:00","2026-10-10T03:00",false],["2026-10-09T20:00","2026-10-10T05:00",true],["2026-10-09T02:00","2026-10-10T02:00",true]])("classifies stationary %s to %s correctly",(a,b,night)=>{
    expect(restLabel(at(a),at(b),"stationary","Australia/Brisbane").night).toBe(night);
    expect(restLabel(at(a),at(b),"sleeper-moving","Australia/Brisbane").night).toBe(false);
  });
  it("counts two disjoint night alternatives in 48h and excludes reviewed clock facts",()=>{
    const s=fixture(),start=at("2026-10-09T02:00"),end=at("2026-10-11T02:00");
    const r={start,end,kind:"rest" as const,rest:"stationary" as const,profile:s.profile,review:false,clock:false};
    const nights=nightEvents([r],start,end,s.profile.zone);expect(nights).toHaveLength(2);expect(nights[0].end).toBeLessThanOrEqual(nights[1].start);
    expect(nightEvents([{...r,clock:true}],start,end,s.profile.zone)).toEqual([]);
  });
  it("reports a missing seven-hour rest even when total work stays below twelve hours",()=>{
    const s=fixture();for(const [a,b] of [[0,16],[24,40],[56,72]]) editRange(s,"2026-10-10",a,b,"work");
    const r=report(s,"2026-10-11T00:00");
    expect(r.findings.find(f=>f.code==="rest-1440"&&f.start==="2026-10-10 00:00")?.message).toBe("7h continuous stationary rest needed");
    expect(r.days[0].work).toBe(720);
  });
  it("keeps the NHVR example's old twelve-hour cap after a new seven-hour rest",()=>{
    const s=fixture();for(const [a,b] of [[24,45],[46,55],[61,79]]) editRange(s,"2026-10-10",a,b,"work");
    const r=report(s,"2026-10-11T02:45");expect(r.nextBreak).toBe(0);
    expect(r.workWindows.find(w=>w.start==="2026-10-10 06:00")).toMatchObject({work:720,rest:525});
    expect(report(s,"2026-10-11T06:00").nextBreak).toBe(315);
  });
  it("counts exact midnight-to-six work without two extra padding fragments",()=>{
    const s=fixture("BFM");timer(s,"work","2026-10-09T23:50","2026-10-10T06:10");
    expect(report(s,"2026-10-10T06:10").longNight).toBe(360);
  });
  it("keeps a still-unresolved short breach when its deadline predates the display range",()=>{
    const s=fixture();for(let n=0;n<3;n++) editRange(s,dateAdd("2026-10-08",n),0,96,"work");
    editRange(s,"2026-10-11",0,4,"work");
    expect(report(s,"2026-10-11T01:00").breachSlots["2026-10-11:3"]).toContain("15m break overdue");
  });
  it("keeps an older-than-28-day BFM 24h checkpoint through missing days",()=>{
    const s=fixture("BFM");for(const d of Object.keys(s.days)) if(d>"2026-09-01"&&d<"2026-10-01") delete s.days[d];
    for(let n=0;n<10;n++) editRange(s,dateAdd("2026-10-01",n),0,52,"work");
    const r=report(s,"2026-10-10T13:00",14);
    expect(r.workSince24).toBe(130*60);expect(r.issues).not.toContain("24h rest history missing");
    expect(r.breachSlots["2026-10-07:24"]).toContain("84 hours work exceeded");expect(r.nextBreak).toBeNull();
  });
  it("checks a WA base using explicit HVNL operation and leaves WA-specific operation for review",()=>{
    const s=fixture();Object.assign(s.profile,{base:"WA",operation:"HVNL"});for(const d of Object.values(s.days)) d.profile=clone(s.profile);
    editRange(s,"2026-10-10",0,22,"work");expect(report(s,"2026-10-10T05:30").breachSlots["2026-10-10:21"]).toContain("15m break overdue");
    s.profile.operation="WA";for(const d of Object.values(s.days)) d.profile.operation="WA";
    const r=report(s,"2026-10-10T05:30");expect(r.breachSlots).toEqual({});expect(r.issues).toContain("Check operating rules");expect(r.nextBreak).toBeNull();
  });
});
