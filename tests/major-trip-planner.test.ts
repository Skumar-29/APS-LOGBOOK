import {describe,it,expect} from "vitest";
import {emptyState,ensureDay} from "../src/domain/model";
import {dateAdd} from "../src/domain/time";
import {assessTrip} from "../src/domain/trip-feasibility";

const now=Date.parse("2026-11-11T00:00:00Z");
function diary(){
 const s=emptyState();
 Object.assign(s.profile,{base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false,
   operation:"HVNL",certificate:"TEST",certificateExpiry:"2027-12-31"});
 for(let i=0;i<24;i++)ensureDay(s,dateAdd("2026-10-18",i));
 return s;
}
describe("Reusable major trip planning does not mutate the diary",()=>{
 it("assesses a 20h work + 12h rest one-way estimate with an explicit candidate schedule",()=>{
   const s=diary(),before=structuredClone(s);
   const r=assessTrip(s,"2026-11-11","20:00",1200,720,false,now);
   expect(r.workMinutes).toBe(1200);
   expect(r.restMinutes).toBe(720);
   expect(r.finishedAt-r.startedAt).toBe(32*3600000);
   expect(r.revision).toBe(s.revision);
   expect(r.status).toMatch(/Possible|Needs review|Estimate insufficient/);
   if(r.status!=="Estimate insufficient"){
     const work=r.schedule.filter(x=>x.kind==="work").reduce((n,x)=>n+(x.end-x.start)/60000,0);
     const rest=r.schedule.filter(x=>x.kind==="rest").reduce((n,x)=>n+(x.end-x.start)/60000,0);
     expect(work).toBe(1200);expect(rest).toBe(720);
     expect(r.schedule.some(x=>x.kind==="rest"&&x.major&&(x.end-x.start)>=7*3600000)).toBe(true);
   }
   expect(s).toEqual(before);
 });
 it("uses twice the manual estimates for a return trip without assuming a 24h rest is automatically due",()=>{
   const s=diary(),r=assessTrip(s,"2026-11-11","20:00",1200,720,true,now);
   expect(r.workMinutes).toBe(2400);
   expect(r.restMinutes).toBe(1440);
   expect(r.finishedAt-r.startedAt).toBe(64*3600000);
   expect(r.reason).not.toMatch(/24h rest automatically/);
 });
 it("does not grant permission if the driver has unconfirmed Two-up details or ACH conditions",()=>{
   const s=diary();
   s.profile.twoUp=true;s.profile.coDriver="";s.profile.coLicence="";
   expect(assessTrip(s,"2026-11-11","20:00",1200,720,false,now).status).toBe("Needs review");
   s.profile.twoUp=false;s.profile.scheme="ACH";
   expect(assessTrip(s,"2026-11-11","20:00",1200,720,false,now).status).toBe("Needs review");
 });
 it("rejects invalid estimates without modifying recorded pages",()=>{
   const s=diary();
   expect(()=>assessTrip(s,"2026-11-11","20:00",1201,720,false,now)).toThrow();
   expect(()=>assessTrip(s,"2026-11-11","20:01",1200,720,false,now)).toThrow();
 });
});
