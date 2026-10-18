import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from "vitest";
import {emptyState,ensureDay,clone,recordProfile} from "../src/domain/model";
import {instantFor,dateAdd} from "../src/domain/time";
import {editRange} from "../src/domain/diary";

const channel={onmessage:null as null|((e:{data:unknown})=>void),postMessage:vi.fn()};
beforeAll(async()=>{vi.stubGlobal("self",channel);await import("../src/domain/rules.worker");});
afterAll(()=>vi.unstubAllGlobals());
beforeEach(()=>channel.postMessage.mockClear());
function fixture() {
  const s=emptyState();Object.assign(s.profile,{base:"QLD",zone:"Australia/Brisbane"});s.settings.diaryRestDefault="stationary";
  for(let n=0;n<41;n++) ensureDay(s,dateAdd("2026-09-01",n));return s;
}
const at=(date:string,time:string)=>instantFor(date,time,"Australia/Brisbane")[0];
describe("real hours-worker message contract",()=>{
  it("returns overnight active-timer totals under the caller's assessment cutoff",()=>{
    const s=fixture();s.timer={id:"live",kind:"work",start:at("2026-10-10","20:15"),zone:s.profile.zone,vehicle:"TEST",restType:"unknown",profile:recordProfile(s.profile)};
    const before=clone(s);
    channel.onmessage!({data:{id:"overnight",s,asOf:"2026-10-11T24:00",range:2,now:at("2026-10-11","03:00")}});
    const response=channel.postMessage.mock.calls[0][0];
    expect(response.id).toBe("overnight");expect(response.report.days.map((d:{work:number})=>d.work)).toEqual([225,180]);
    expect(response.report.assessedThrough).toBe("2026-10-11 03:00");expect(s).toEqual(before);
  });
  it("excludes future rest rather than silently completing the day",()=>{
    const s=fixture();editRange(s,"2026-10-11",0,48,"work");
    channel.onmessage!({data:{id:"today",s,asOf:"2026-10-11T24:00",range:1,now:at("2026-10-11","13:00")}});
    expect(channel.postMessage.mock.calls[0][0].report.days[0]).toMatchObject({work:720,rest:60,unknown:0});
  });
  it("echoes request identity so the view can reject old calculations",()=>{
    const s=fixture();
    for(const id of ["before-edit","after-edit"]) channel.onmessage!({data:{id,s,asOf:"2026-10-11T13:00",range:1,now:at("2026-10-11","13:00")}});
    expect(channel.postMessage.mock.calls.map(x=>x[0].id)).toEqual(["before-edit","after-edit"]);
  });
  it("does not run discarded future-planning calculations",()=>{
    const s=fixture();editRange(s,"2026-10-11",0,48,"work");editRange(s,"2026-10-11",80,88,"work");const before=clone(s);
    channel.onmessage!({data:{id:"plan",s,asOf:"2026-10-11T24:00",range:1,now:at("2026-10-11","13:00"),includePlan:true}});
    const response=channel.postMessage.mock.calls[0][0];
    expect(response.report.days[0]).toMatchObject({work:720,rest:60,unknown:0});
    expect(response).not.toHaveProperty("plan");
    expect(response.report.days[0]).not.toHaveProperty("future");
    expect(response.report.breachSlots["2026-10-11:80"]).toBeUndefined();expect(s).toEqual(before);
  });
  it("checks all recorded blocks through day end while live timer remains limited to real clock",()=>{
    const s=emptyState();
    Object.assign(s.profile,{name:"Synthetic",licence:"TEST",scheme:"Standard",base:"NSW",zone:"Australia/Sydney"});
    ensureDay(s,"2026-10-17");
    editRange(s,"2026-10-18",0,52,"work");
    for(const slot of [21,31,42,43]) editRange(s,"2026-10-18",slot,slot+1,"rest");
    editRange(s,"2026-10-19",0,90,"work");
    for(const slot of [21,31]) editRange(s,"2026-10-19",slot,slot+1,"rest");
    const before=clone(s);
    const observed=instantFor("2026-10-19","10:15",s.profile.zone)[0];
    const fullEnd=instantFor("2026-10-20","00:00",s.profile.zone)[0];
    channel.onmessage!({data:{id:"elapsed",s,asOf:"2026-10-19T24:00",range:2,now:observed,liveThrough:observed}});
    const elapsed=channel.postMessage.mock.calls[0][0].report;
    expect(elapsed.days.at(-1)).toMatchObject({work:600,rest:30});
    expect(elapsed.breachSlots["2026-10-19:80"]).toBeUndefined();
    channel.onmessage!({data:{id:"all-entered",s,asOf:"2026-10-19T24:00",range:2,now:fullEnd,liveThrough:observed}});
    const recorded=channel.postMessage.mock.calls[1][0].report;
    expect(recorded.days.at(-1)).toMatchObject({work:1320,rest:120});
    expect(recorded.days[0]).toMatchObject({work:720,rest:720});
    expect(Object.keys(recorded.breachSlots).some(k=>k.startsWith("2026-10-19:"))).toBe(true);
    expect(recorded.findings.some(f=>f.severity==="breach")).toBe(true);
    expect(s).toEqual(before);
  });
  it("returns a short retry error instead of an empty clearance",()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    channel.onmessage!({data:{id:"invalid",s:fixture(),asOf:"invalid",range:1,now:Date.now()}});
    expect(channel.postMessage.mock.calls[0][0]).toEqual({id:"invalid",error:"Hours unavailable · retry"});log.mockRestore();
  });
});
