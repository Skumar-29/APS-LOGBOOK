import { describe, it, expect } from "vitest";
import { clone, emptyState, ensureDay, recordProfile, ruleProfileAt, type Workspace } from "../src/domain/model";
import { dayRuleRange, ruleChangeInstant, saveRuleChange, suggestedRestType } from "../src/domain/ruleChanges";
import { analyse } from "../src/domain/rules";
import { assessedDay, buildTimeline, counted } from "../src/domain/timeline";
import { diaryPages } from "../src/documents/diary-pages";
import { restEpisodes, nightEvents } from "../src/domain/qualifications";
import { finishTimer } from "../src/domain/diary";
import { validateState } from "../src/domain/backup";
import { dateAdd, MINUTE } from "../src/domain/time";
const zone="Australia/Brisbane", at=(s:string)=>ruleChangeInstant(s,zone);
function fixture() {
  const s=emptyState();Object.assign(s.profile,{scheme:"BFM",base:"QLD",zone,certificate:"TEST",certificateExpiry:"2027-01-01"});
  s.settings.diaryRestDefault="stationary";s.settings.autoPages=false;
  for(let n=0;n<42;n++) ensureDay(s,dateAdd("2026-09-01",n));
  return s;
}
function work(s:Workspace,start:string,end:string) {
  s.timer={id:crypto.randomUUID(),start:at(start),kind:"work",restType:"unknown",profile:recordProfile(s.profile),zone,vehicle:"TEST"};finishTimer(s,at(end));
}
function standard(s:Workspace,start:string,end:string|null=null) {
  return saveRuleChange(s,at(start),end===null?null:at(end),{...s.profile,scheme:"Standard",operator:"Other company"});
}
const report=(s:Workspace,t:string)=>analyse(s,t,14,{now:at(t)});

describe("dated hours-option facts and shared counting",()=>{
  it("changes only the selected day and restores the usual BFM option",()=>{
    const s=fixture(),before=clone(s.days),range=dayRuleRange("2026-10-10",zone);
    saveRuleChange(s,range.from,range.to,{...s.profile,scheme:"Standard"});
    expect(ruleProfileAt(s,range.from-1,s.profile).scheme).toBe("BFM");
    expect(ruleProfileAt(s,range.from,s.profile).scheme).toBe("Standard");
    expect(ruleProfileAt(s,range.to-1,s.profile).scheme).toBe("Standard");
    expect(ruleProfileAt(s,range.to,s.profile).scheme).toBe("BFM");
    expect(s.days).toEqual(before);expect(s.profile.scheme).toBe("BFM");
  });
  it("carries earlier BFM work into Standard across midnight",()=>{
    const s=fixture();work(s,"2026-10-10T20:15","2026-10-11T03:00");standard(s,"2026-10-11T00:00");
    const r=report(s,"2026-10-11T03:00");
    expect(r.days.slice(-2).map(d=>d.work)).toEqual([225,180]);
    expect(r.breachSlots["2026-10-11:6"]).toContain("15m break overdue");
    expect(r.findings.find(f=>f.code==="work-330")?.at).toBe("2026-10-11 01:30");
    expect(s.activities[0].profile.scheme).toBe("BFM");
  });
  it("does not round one activity again when the scheme changes inside a quarter",()=>{
    const s=fixture();work(s,"2026-10-10T10:14","2026-10-10T10:31");standard(s,"2026-10-10T10:17");
    const t=buildTimeline(s,"2026-10-10T10:31",at("2026-10-10T10:31"));
    expect(counted(t.runs,at("2026-10-10T00:00"),t.through,"work")).toBe(30);
    const parts=t.runs.filter(r=>r.kind==="work");
    expect(parts.map(r=>r.profile.scheme)).toEqual(["BFM","Standard"]);
    expect(parts[1].start).toBe(at("2026-10-10T10:17"));
  });
  it("immediately checks the lower 24h work cap, even if no new work is entered",()=>{
    const s=fixture();work(s,"2026-10-10T06:00","2026-10-10T12:00");work(s,"2026-10-10T12:30","2026-10-10T19:30");
    standard(s,"2026-10-10T20:00");const r=report(s,"2026-10-10T20:00");
    expect(r.workWindows.some(w=>w.limit===720&&w.work===780&&w.status==="Exceeded")).toBe(true);
    expect(r.nextBreak).toBe(0);
  });
  it("preserves continuous stationary and night rest through a rule change",()=>{
    const s=fixture();work(s,"2026-10-10T19:00","2026-10-10T20:00");standard(s,"2026-10-11T00:00");
    const t=buildTimeline(s,"2026-10-11T05:00",at("2026-10-11T05:00"));
    const last=restEpisodes(t.runs).at(-1)!;
    expect((last.end-last.start)/MINUTE).toBe(540);
    expect(nightEvents([last],last.start,last.end,zone)).toHaveLength(1);
  });
  it("does not activate a scheduled change before its effective time",()=>{
    const s=fixture();standard(s,"2026-10-11T06:00");
    expect(buildTimeline(s,"2026-10-12T24:00",at("2026-10-10T12:00")).profile.scheme).toBe("BFM");
  });
  it("counts forward after a confirmed 48h reset without dropping original records",()=>{
    const s=fixture();work(s,"2026-10-08T12:00","2026-10-09T02:00");standard(s,"2026-10-11T06:00");
    work(s,"2026-10-11T06:00","2026-10-11T07:00");const r=report(s,"2026-10-11T07:00");
    expect(r.workWindows.filter(w=>w.limit===720).every(w=>w.work<=60)).toBe(true);
    expect(r.nextBreak).toBe(255);expect(s.activities).toHaveLength(2);
  });
  it("recognises an already-completed 48h reset while the driver is still resting",()=>{
    const s=fixture();delete s.days["2026-09-01"];standard(s,"2026-10-11T06:00");
    const r=report(s,"2026-10-11T06:00");expect(r.issues.join(" ")).not.toContain("incomplete history");
    expect(r.nextBreak).toBe(315);
  });
  it("splits PDF previews at a mid-day change without inventing a second paper page number",()=>{
    const s=fixture();work(s,"2026-10-10T10:14","2026-10-10T10:31");standard(s,"2026-10-10T10:17");
    const r=report(s,"2026-10-10T11:00"),view=assessedDay(s.days["2026-10-10"],r.days.at(-1));
    const pages=diaryPages(view,{number:"87",status:"Active"},{number:"TESTBOOK"});
    expect(pages).toHaveLength(4);
    expect(pages[1]).toContain("Scheme: BFM");expect(pages[3]).toContain("Scheme: Standard");
    expect(pages[3]).toContain("Unallocated");expect(pages[3]).not.toContain("Page: 87");
    const periods=view.calculatedRulePeriods as Array<{fragments:Array<{work:number}>}>;
    expect(periods.flatMap(p=>p.fragments).reduce((n,f)=>n+f.work,0)).toBe(30);
  });
  it("does not charge later Standard night work to an already-ended BFM phase",()=>{
    const s=fixture();for(let n=4;n<=9;n++)work(s,`2026-10-0${n}T00:00`,`2026-10-0${n}T06:00`);
    standard(s,"2026-10-09T18:00");work(s,"2026-10-10T00:00","2026-10-10T06:00");
    expect(report(s,"2026-10-10T06:00").findings.filter(f=>f.code==="long-night")).toHaveLength(0);
  });
  it("keeps missing earlier records as review rather than inventing a new allowance",()=>{
    const s=emptyState();Object.assign(s.profile,{scheme:"BFM",zone,base:"QLD"});standard(s,"2026-10-11T00:00");
    work(s,"2026-10-11T06:00","2026-10-11T07:00");const r=report(s,"2026-10-11T07:00");
    expect(r.nextBreak).toBeNull();expect(r.issues.join(" ")).toContain("incomplete history");
  });
  it("edits an overlapping temporary change without losing either surrounding interval",()=>{
    const s=fixture();standard(s,"2026-10-10T00:00","2026-10-12T00:00");
    saveRuleChange(s,at("2026-10-10T12:00"),at("2026-10-10T18:00"),s.profile);
    expect(s.ruleChanges).toHaveLength(3);
    expect(ruleProfileAt(s,at("2026-10-10T11:00"),s.profile).scheme).toBe("Standard");
    expect(ruleProfileAt(s,at("2026-10-10T13:00"),s.profile).scheme).toBe("BFM");
    expect(ruleProfileAt(s,at("2026-10-10T19:00"),s.profile).scheme).toBe("Standard");validateState(s);
  });
  it("round-trips rule changes through backups and rejects overlaps",()=>{
    const s=fixture();standard(s,"2026-10-10T00:00","2026-10-11T00:00");const copy=JSON.parse(JSON.stringify(s));
    validateState(copy);expect(copy.ruleChanges).toEqual(s.ruleChanges);
    copy.ruleChanges.push({...copy.ruleChanges[0],id:"OTHER"});expect(()=>validateState(copy)).toThrow("Overlapping");
  });
  it("rejects invalid, skipped and repeated local times rather than guessing",()=>{
    expect(()=>ruleChangeInstant("2026-10-04T02:30","Australia/Sydney")).toThrow("unambiguous");
    expect(()=>ruleChangeInstant("2026-04-05T02:30","Australia/Sydney")).toThrow("unambiguous");
    expect(()=>ruleChangeInstant("2026-02-30T06:00",zone)).toThrow("valid");
  });
});
describe("rest suggestions preserve physical facts",()=>{
  it("suggests stationary for solo without rewriting existing unknown rest",()=>{
    const s=fixture();s.days["2026-10-10"].restDefault="unknown";
    expect(suggestedRestType(s,false)).toBe("stationary");expect(s.days["2026-10-10"].restDefault).toBe("unknown");
  });
  it("requires confirmation for two-up unless a previous recorded choice exists",()=>{
    const s=fixture();s.profile.twoUp=true;expect(suggestedRestType(s,true)).toBe("unknown");
    s.activities.push({id:"REST",kind:"rest",restType:"sleeper-moving",start:at("2026-10-10T01:00"),end:at("2026-10-10T02:00"),zone,profile:clone(s.profile),vehicle:"TEST"});
    expect(suggestedRestType(s,true)).toBe("sleeper-moving");expect(suggestedRestType(s,false)).toBe("stationary");
  });
});
