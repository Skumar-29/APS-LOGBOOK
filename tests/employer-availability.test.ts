import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {analyse} from "../src/domain/rules";
import {employerAvailability} from "../src/domain/availability-report";
import {instantFor} from "../src/domain/time";

const zone="Australia/Brisbane";
const at=(value:string)=>instantFor(value.slice(0,10),value.slice(11,16),zone)[0];
function setup(...days:string[]){
 const s=emptyState();Object.assign(s.profile,{name:"Test Driver",base:"QLD",zone,scheme:"BFM",twoUp:false,certificate:"BFM",certificateExpiry:"2027-12-31"});
 s.settings.diaryRestDefault="stationary";
 for(const day of days){const d=ensureDay(s,day);d.restDefault="stationary";}
 return s;
}
describe("Employer availability - one page factual outputs",()=>{
 it("never promises a shift start or Work duration with missing history",()=>{
  const s=setup("2026-11-01");
  editRange(s,"2026-11-01",0,4,"work");
  const now=at("2026-11-01 04:00");
  const r=analyse(s,"2026-11-01T04:00",14,{now,liveThrough:now});
  const a=employerAvailability(s,r,s.profile,now);
  expect(a.status).toBe("Review required");
  expect(a.start).toBe("Not verified");
  expect(a.workToBreak).toBe("Needs review");
  expect(a.metrics.find(m=>m.label==="7d BFM long/night")?.limit).toBe("36h");
  expect(a.metrics.find(m=>m.label==="7d total Work (recorded)")?.limit).toBe("No total-Work cap");
  expect(a.rests[2].next).toContain("No routine BFM due date");
 });
 it("preserves the last actual 48h stationary Rest and does not invent the next 48h date",()=>{
  const s=setup("2026-10-01","2026-10-02","2026-10-03");
  editRange(s,"2026-10-03",0,4,"work");
  const now=at("2026-10-03 02:00");
  const r=analyse(s,"2026-10-03T02:00",14,{now,liveThrough:now});
  const a=employerAvailability(s,r,s.profile,now);
  expect(a.rests[0].last).not.toBe("Not established");
  expect(a.rests[1].last).toContain("01/10/2026");
  expect(a.rests[2].last).toContain("01/10/2026");
  expect(a.rests[2].next).toContain("hours options");
 });
 it("does not count unknown Rest as a verified 24/48h break",()=>{
  const s=setup("2026-10-01","2026-10-02","2026-10-03");
  s.days["2026-10-02"].restDefault="unknown";
  editRange(s,"2026-10-03",0,4,"work");
  const now=at("2026-10-03 02:00");
  const r=analyse(s,"2026-10-03T02:00",14,{now,liveThrough:now});
  const a=employerAvailability(s,r,s.profile,now);
  expect(a.rests[1].last).toBe("Not established");
  expect(a.rests[2].last).toBe("Not established");
 });
 it("marks yesterday's assessment historical rather than current eligibility",()=>{
  const s=setup("2026-11-01");const now=at("2026-11-01 12:00");
  const r=analyse(s,"2026-11-01T12:00",14,{now,liveThrough:now});
  const a=employerAvailability(s,r,s.profile,now+86400000);
  expect(a.assessmentKind).toContain("Historical");
  expect(a.start).toBe("Not verified");
 });
});
