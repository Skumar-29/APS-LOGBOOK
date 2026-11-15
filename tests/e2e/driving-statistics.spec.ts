import {PDFDocument} from "pdf-lib";
import {readFile} from "node:fs/promises";
import {test,expect,type Page} from "@playwright/test";
import {emptyState,ensureDay} from "../../src/domain/model";
import {editRange} from "../../src/domain/diary";

async function onboard(page:Page){
 await page.goto("/");
 await page.getByLabel("Driver name",{exact:true}).fill("Statistics Tester");
 await page.getByLabel("Licence number",{exact:true}).fill("TEST");
 await page.getByLabel("Driver base",{exact:true}).selectOption("QLD");
 await page.getByRole("button",{name:"Save driver settings",exact:true}).click();
}
async function seed(page:Page,s:ReturnType<typeof emptyState>){
 await page.evaluate(async workspace=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open("aps-truck-workspace-v2",2);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction("workspace","readwrite"),st=tx.objectStore("workspace");
   const old=st.get("current");
   old.onsuccess=()=>{workspace.revision=old.result.revision+1;st.put(workspace,"current");};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };req.onerror=()=>reject(req.error);
 }),s);
 await page.reload();
}
test("Driving statistics dashboard renders requested fields on desktop and phone without unsafe clearance",async({page},info)=>{
 await page.clock.setFixedTime(new Date("2026-11-01T03:00:00Z"));
 await onboard(page);
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:"Statistics Tester",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",
  scheme:"BFM",twoUp:false,certificate:"BFM",certificateExpiry:"2027-12-31"});
 const day=ensureDay(s,"2026-11-01");day.restDefault="stationary";
 editRange(s,"2026-11-01",0,16,"work");
 await seed(page,s);
 await page.getByRole("button",{name:"Stats",exact:true}).click();
 const cumulative=page.getByLabel("Driver Statistics accumulated hours");
 await expect(cumulative).toBeVisible();
 await expect(cumulative).toContainText("14-day accumulated hours");
 await expect(cumulative.getByRole("columnheader",{name:"Work",exact:true})).toBeVisible();
 await expect(cumulative.getByRole("columnheader",{name:"Acc",exact:true})).toBeVisible();
 await expect(cumulative.getByRole("columnheader",{name:"Left",exact:true})).toBeVisible();
 await expect(cumulative.locator("tbody tr")).toHaveCount(14);
 await expect(cumulative.getByRole("columnheader",{name:"L/N 7d"})).toBeVisible();
 const quick=page.getByLabel("Quick driving availability and rest deadlines");
 await expect(quick).toBeVisible();
 await expect(quick.getByText("Next required breaks")).toBeVisible();
 await page.getByText("Full driving calculations",{exact:true}).click();
 const d=page.getByLabel("Driving eligibility and rolling fatigue statistics");
 await expect(d).toBeVisible();
 await expect(d.getByText("Can work for (before next applicable limit)")).toBeVisible();
 await expect(d.getByText("Latest start for seven-hour stationary Rest")).toBeVisible();
 await expect(d.getByText("Remaining before 84-hour Work threshold")).toBeVisible();
 await expect(d.getByText("Long/night Work remaining · 36h cap")).toBeVisible();
 await expect(d.getByText("Current 14-day period ends")).toBeVisible();
 await expect(d.getByText("Hours to be released")).toBeVisible();
 await expect(d.getByText("Next night-rest requirement")).toBeVisible();
 await expect(d.getByText("Consecutive night-rest requirement")).toBeVisible();
 await expect(d.getByText("Last finished Work")).toBeVisible();
 await expect(d.getByText("Needs review",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Calculate as of now"}).click();
 await expect(d).toContainText("Assessed 01/11/2026");
 const width=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);
 expect(width[1]).toBeLessThanOrEqual(width[0]+3);
 const pdfWait=page.waitForEvent("download");
 await quick.getByRole("button",{name:"Save PDF"}).click();
 const exported=await pdfWait;
 expect(exported.suggestedFilename()).toMatch(/^APS-Availability-\d{4}-\d{2}-\d{2}\.pdf$/);
 const file=info.outputPath("employer-availability.pdf");await exported.saveAs(file);
 const checked=await PDFDocument.load(await readFile(file));
 expect(checked.getPageCount()).toBe(1);
  await page.screenshot({path:`test-results/driving-statistics-${info.project.name}.png`,fullPage:true});
});

test("GPS map and truck stop finder are absent from Driving; cumulative Stats table fits a narrow phone",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-11-15T08:00:00Z"));
 await page.setViewportSize({width:345,height:800});
 await onboard(page);
 await page.getByRole("button",{name:"Driving",exact:true}).click();
 await expect(page.getByRole("button",{name:"Start work",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Hours review"})).toBeVisible();
 await expect(page.getByRole("heading",{name:/GPS map|truck stops/i})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Open GPS map/i})).toHaveCount(0);
 await page.getByRole("button",{name:"Stats",exact:true}).click();
 const card=page.getByLabel("Driver Statistics accumulated hours");
 await expect(card).toBeVisible();
 await expect(card.locator("tbody tr")).toHaveCount(14);
 const widths=await page.evaluate(()=>{
  const table=document.querySelector(".accumulation-table")!.getBoundingClientRect();
  return {tableRight:table.right,viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};
 });
 expect(widths.tableRight).toBeLessThanOrEqual(widths.viewport+2);
 expect(widths.scroll).toBeLessThanOrEqual(widths.viewport+3);
});
