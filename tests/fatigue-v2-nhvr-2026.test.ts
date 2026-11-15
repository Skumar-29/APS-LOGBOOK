import {describe,it,expect} from "vitest";
import {standardSolo} from "../src/domain/fatigue-v2/standard-solo";
import {standardTwoUp} from "../src/domain/fatigue-v2/standard-two-up";
import {standardBus} from "../src/domain/fatigue-v2/standard-bus";
import {bfmSolo} from "../src/domain/fatigue-v2/bfm-solo";
import {bfmTwoUp} from "../src/domain/fatigue-v2/bfm-two-up";
import {policyFor} from "../src/domain/fatigue-v2/registry";
import {anchorsFor,nightEventsV2,restRequirementV2,twoUpWeeklyRest} from "../src/domain/fatigue-v2/rest-and-anchors";
import {countWork,countRest,type TimelineRun} from "../src/domain/timeline";
import {emptyState} from "../src/domain/model";
import {MINUTE} from "../src/domain/time";

const base=Date.parse("2026-11-10T00:00:00+10:00");
const profile=emptyState().profile;
const run=(from:number,to:number,kind:"work"|"rest",rest:"stationary"|"sleeper-moving"|"unknown"="stationary"):TimelineRun=>({
 start:base+from*MINUTE,end:base+to*MINUTE,kind,rest,profile,review:false,clock:false
});
describe("NHVR WWD v1.4 tables transcribed independently (pages 24–25)",()=>{
 it("has Standard Solo 5h30/8h/11h/24h/7d/14d limits and 7h stationary",()=>{
  expect(standardSolo.windows.map(w=>[w.periodMinutes,w.maxWorkMinutes,w.minimumRestMinutes])).toEqual([
   [330,315,15],[480,450,30],[660,600,60],[1440,720,420],
   [10080,4320,1440],[20160,8640,0]]);
 });
 it("has Standard Two-up 5h moving sleeper, 10h stationary /52h, 7d dual rest and 14d nights",()=>{
  expect(standardTwoUp.windows.find(x=>x.id==="daily-24")).toMatchObject({
    maxWorkMinutes:720,minimumRestMinutes:300,rest:"stationary-or-approved-moving-sleeper"});
  expect(standardTwoUp.windows.find(x=>x.id==="extended-52")).toMatchObject({periodMinutes:3120,minimumRestMinutes:600});
  expect(standardTwoUp.windows.find(x=>x.id==="weekly-7")).toMatchObject({
    maxWorkMinutes:3600,rest:"two-up-seven-day"});
  expect(standardTwoUp.windows.find(x=>x.id==="fortnight-14")?.maxWorkMinutes).toBe(7200);
 });
 it("has BFM Solo different short limits, 14h daily, 36h long/night and 84h checkpoint",()=>{
  expect(bfmSolo.windows.slice(0,4).map(w=>[w.periodMinutes,w.maxWorkMinutes])).toEqual([
   [375,360],[540,510],[720,660],[1440,840]]);
  expect(bfmSolo.longNightCapMinutes).toBe(2160);
  expect(bfmSolo.checkpoint84).toBe(true);
 });
 it("has no invented 7h/24h or solo short-break table under BFM Two-up",()=>{
  expect(bfmTwoUp.windows[0]).toMatchObject({periodMinutes:1440,maxWorkMinutes:840,minimumRestMinutes:0});
  expect(bfmTwoUp.windows.find(w=>w.periodMinutes===4920)?.minimumRestMinutes).toBe(600);
  expect(bfmTwoUp.windows.find(w=>w.periodMinutes===10080)?.maxWorkMinutes).toBe(4200);
  expect(bfmTwoUp.windows.find(w=>w.periodMinutes===20160)?.maxWorkMinutes).toBe(8400);
 });
 it("includes Standard Bus/Coach night-rest and 28-day options; certificate modes stay unknown",()=>{
  expect(standardBus.windows.find(w=>w.periodMinutes===10080)?.rest).toBe("night-six");
  expect(standardBus.windows.find(w=>w.periodMinutes===40320)).toMatchObject({
    maxWorkMinutes:17280,rest:"bus-28-day"});
  expect(policyFor({...profile,scheme:"AFM"})).toBeNull();
  expect(policyFor({...profile,scheme:"ACH"})).toBeNull();
 });
});
describe("NHVR shared time and separate counting periods",()=>{
 it("rounds written diary Work upward and Rest downward in 15m steps",()=>{
  expect(countWork(6)).toBe(15);expect(countWork(32)).toBe(45);
  expect(countRest(12)).toBe(0);expect(countRest(44)).toBe(30);
 });
 it("does not reset a 24h period because of an insufficient 15m Rest",()=>{
  const runs=[run(0,420,"rest"),run(420,480,"work"),run(480,495,"rest"),run(495,540,"work")];
  const rule=standardSolo.windows.find(w=>w.id==="daily-24")!;
  const anchors=anchorsFor(runs,rule,"Australia/Brisbane");
  expect(anchors).toEqual([base+420*MINUTE]);
 });
 it("keeps the older 24h anchor after a subsequent qualifying seven-hour Rest",()=>{
  const runs=[run(0,420,"rest"),run(420,540,"work"),run(540,960,"rest"),run(960,1020,"work")];
  const rule=standardSolo.windows.find(w=>w.id==="daily-24")!;
  const anchors=anchorsFor(runs,rule,"Australia/Brisbane");
  expect(anchors).toContain(base+420*MINUTE);
  expect(anchors).toContain(base+960*MINUTE);
  expect(anchors[0]+1440*MINUTE).toBeGreaterThan(anchors[1]);
 });
 it("one 24h stationary Rest cannot meet both 7d two-up rest obligations",()=>{
  const rule=standardTwoUp.windows.find(w=>w.id==="weekly-7")!;
  const rests=[run(0,1440,"rest")];
  expect(restRequirementV2(rests,0+base,10080*MINUTE+base,rule,"Australia/Brisbane").satisfied).toBe(false);
 });
 it("separate 24h Rest and three separate 8h stationary breaks can meet two-up weekly rest",()=>{
  const rests=[
    run(0,1440,"rest"),run(1440,1500,"work"),
    run(1500,1980,"rest"),run(1980,2010,"work"),
    run(2010,2490,"rest"),run(2490,2520,"work"),
    run(2520,3000,"rest")
  ];
  expect(twoUpWeeklyRest(rests,base,base+10080*MINUTE)).toBe(true);
 });
 it("a 7h stationary break inside 22h–08h is a night rest in base time",()=>{
  const rest=[run(22*60,29*60,"rest")];
  expect(nightEventsV2(rest,base,base+2*1440*MINUTE,"Australia/Brisbane")).toHaveLength(1);
 });
});
