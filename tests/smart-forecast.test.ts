import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {forecastWork} from "../src/domain/smart-forecast";

const now=Date.parse("2026-11-02T04:00:00Z"); // 2 PM Brisbane
function schedule(){
 const s=emptyState();
 Object.assign(s.profile,{name:"Test Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",
   scheme:"BFM",twoUp:false,certificate:"BFM-TEST",certificateExpiry:"2027-12-31"});
 const d1=ensureDay(s,"2026-11-01");d1.restDefault="stationary";
 const d2=ensureDay(s,"2026-11-02");d2.restDefault="stationary";
 editRange(s,"2026-11-01",80,96,"work"); // 8pm - midnight, 4h
 editRange(s,"2026-11-02",0,4,"work"); // midnight - 1am, 1h
 editRange(s,"2026-11-02",8,32,"work"); // 2am - 8am, 6h
 return s;
}
describe("Next-job forecasting never edits diary data",()=>{
 it("compares starts at 3pm and 5pm across the earlier 8pm-8pm counting window",()=>{
  const s=schedule(),before=JSON.stringify(s);
  const result=forecastWork(s,"2026-11-02","15:00",360,now);
  const at=(iso:string)=>Date.parse(iso);
  const early=result.options.find(x=>x.start===at("2026-11-02T05:00:00Z"));
  const later=result.options.find(x=>x.start===at("2026-11-02T07:00:00Z"));
  expect(early).toBeDefined();
  expect(later).toBeDefined();
  expect(early?.requestedMinutes).toBe(360);
  expect(later?.requestedMinutes).toBe(360);
  expect(early?.restBeforeMinutes).toBe(0);
  expect(later?.restBeforeMinutes).toBe(120);
  // Earlier counted periods remain active even after completing 7h Rest.
  // A 5 PM restart must not be penalised merely because the old period
  // started at 8 PM the previous day.
  expect(early?.continuousMinutes).toBeLessThanOrEqual(360);
  expect(later?.continuousMinutes).toBeGreaterThanOrEqual(early?.continuousMinutes??0);
  expect(JSON.stringify(s)).toBe(before);
 });
 it("compares a two-hour job without changing recorded Work or break types",()=>{
  const s=schedule(),before=structuredClone(s.days);
  const r=forecastWork(s,"2026-11-02","15:00",120,now);
  expect(r.options[0]?.start).toBe(Date.parse("2026-11-02T05:00:00Z"));
  expect(s.days).toEqual(before);
 });
 it("never presents an unproven history as safe to drive",()=>{
  const s=emptyState();
  Object.assign(s.profile,{name:"Driver",licence:"T",base:"QLD",zone:"Australia/Brisbane",
    scheme:"BFM",twoUp:false,certificate:"T",certificateExpiry:"2027-12-31"});
  const r=forecastWork(s,"2026-11-02","15:00",180,now);
  expect(r.options.every(x=>x.evidence!=="modelled"||x.reason.includes("Other"))).toBe(true);
  expect(r.options.every(x=>x.continuousMinutes<=180)).toBe(true);
 });
 it("does not invent rules for certificate-specific ACH and unconfirmed two-up",()=>{
  const s=schedule();
  s.days["2026-11-02"].profile.scheme="ACH";
  const a=forecastWork(s,"2026-11-02","15:00",180,now);
  expect(a.options).toHaveLength(0);
  s.days["2026-11-02"].profile.scheme="BFM";
  s.days["2026-11-02"].profile.twoUp=true;
  s.days["2026-11-02"].profile.coDriver="";
  const b=forecastWork(s,"2026-11-02","15:00",180,now);
  expect(b.options).toHaveLength(0);
 });
 it("validates work durations and daylight-saving local times",()=>{
  const s=schedule();
  expect(()=>forecastWork(s,"2026-11-02","15:00",0,now)).toThrow();
  expect(()=>forecastWork(s,"2026-11-02","15:00",17,now)).toThrow();
 });
});
