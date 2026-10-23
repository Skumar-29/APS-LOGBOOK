import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {editRange} from "../src/domain/diary";
import {restExtensionOpportunity} from "../src/domain/rest-advisor";

function setUp(date="2026-10-23"){
 const s=emptyState();
 Object.assign(s.profile,{name:"Example",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
 const day=ensureDay(s,date);
 day.restDefault="stationary";
 return s;
}
const at=(iso:string)=>Date.parse(iso);
describe("Proactive rest extension advice",()=>{
 it("recognises six-hour stationary rest and recommends one more hour for a major and a night rest",()=>{
  const s=setUp();
  editRange(s,"2026-10-23",0,88,"work");
  const tip=restExtensionOpportunity(s,"2026-10-23",at("2026-10-23T14:00:00Z")); // Brisbane 00:00 Oct 24, not Oct 23
  expect(tip).toBeNull();
  const prev=setUp("2026-10-22");
  editRange(prev,"2026-10-22",0,64,"work"); // rest from 16:00 onwards
  const result=restExtensionOpportunity(prev,"2026-10-22",at("2026-10-22T12:00:00Z")); // 22:00, 6h rest
  expect(result?.completedMinutes).toBe(360);
  expect(result?.majorExtraMinutes).toBe(60);
  // A break beginning at 16:00 does not qualify as night rest just after 23:00.
  expect(result?.nightExtraMinutes).toBeGreaterThan(0);
 });
 it("recognises near-major rest across midnight and recommends continued rest",()=>{
  const s=setUp("2026-10-22");ensureDay(s,"2026-10-23");
  editRange(s,"2026-10-22",0,88,"work"); // rest begins 22:00
  const t=at("2026-10-22T18:00:00Z"); // 04:00 23rd, 6h rest
  const tip=restExtensionOpportunity(s,"2026-10-23",t);
  expect(tip?.completedMinutes).toBe(360);
  expect(tip?.majorExtraMinutes).toBe(60);
  expect(tip?.nightExtraMinutes).toBe(60);
 });
 it("does not suggest a solo moving-sleeper or unknown break as stationary",()=>{
  const s=setUp();s.days["2026-10-23"].restDefault="unknown";
  expect(restExtensionOpportunity(s,"2026-10-23",at("2026-10-23T05:00:00Z"))).toBeNull();
  s.days["2026-10-23"].restDefault="sleeper-moving";
  expect(restExtensionOpportunity(s,"2026-10-23",at("2026-10-23T05:00:00Z"))).toBeNull();
 });
 it("does not issue a solo suggestion for two-up mode or for a historical date",()=>{
  const s=setUp();
  s.days["2026-10-23"].profile.twoUp=true;
  expect(restExtensionOpportunity(s,"2026-10-23",at("2026-10-23T05:00:00Z"))).toBeNull();
  s.days["2026-10-23"].profile.twoUp=false;
  expect(restExtensionOpportunity(s,"2026-10-22",at("2026-10-23T05:00:00Z"))).toBeNull();
 });
});
