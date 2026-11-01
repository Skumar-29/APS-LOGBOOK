import {test,expect,type Page} from "@playwright/test";
import {emptyState,ensureDay} from "../../src/domain/model";
import {editRange} from "../../src/domain/diary";
async function onboard(page:Page){
 await page.goto("/");
 await page.getByLabel("Driver name",{exact:true}).fill("Forecast Test Driver");
 await page.getByLabel("Licence number",{exact:true}).fill("TEST");
 await page.getByLabel("Driver base",{exact:true}).selectOption("QLD");
 await page.getByRole("button",{name:"Save driver settings",exact:true}).click();
}
async function seed(page:Page,s:ReturnType<typeof emptyState>){
 await page.evaluate(async workspace=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open("aps-truck-workspace-v2",2);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction("workspace","readwrite"),st=tx.objectStore("workspace"),old=st.get("current");
   old.onsuccess=()=>{workspace.revision=old.result.revision+1;st.put(workspace,"current");};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };req.onerror=()=>reject(req.error);
 }),s);
 await page.reload();
}
function fixture(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:"Forecast Test Driver",licence:"TEST",base:"QLD",
  zone:"Australia/Brisbane",scheme:"BFM",twoUp:false,certificate:"BFM",
  certificateExpiry:"2027-12-31"});
 const d1=ensureDay(s,"2026-11-01");d1.restDefault="stationary";
 const d2=ensureDay(s,"2026-11-02");d2.restDefault="stationary";
 editRange(s,"2026-11-01",80,96,"work");
 editRange(s,"2026-11-02",0,4,"work");
 editRange(s,"2026-11-02",8,32,"work");
 return s;
}
test("night shading, full-page balances and non-mutating shift proposals",async({page},info)=>{
 await page.clock.setFixedTime(new Date("2026-11-02T04:00:00Z"));
 await onboard(page);await seed(page,fixture());
 await page.getByRole("button",{name:"Diary",exact:true}).click();
 const date=page.getByLabel("Diary date",{exact:true});
 await date.fill("2026-11-02");await date.press("Tab");
 await expect(page.getByLabel("Diary hours and remaining allowances")).toBeVisible();
 await expect(page.locator(".swipe-block.night-band[data-slot='0']")).toBeVisible();
 await page.getByRole("button",{name:"Full day"}).click();
 await expect(page.locator(".swipe-block.night-band[data-slot='88']")).toBeVisible();
 await expect(page.locator(".swipe-block[data-slot='32']")).not.toHaveClass(/night-band/);
 const before=await page.locator("[aria-label='Page totals']").innerText();
 await page.getByText("Plan next job",{exact:true}).click();
 await page.getByLabel("Job date",{exact:true}).fill("2026-11-02");
 await page.getByLabel("Earliest start",{exact:true}).fill("15:00");
 await page.getByLabel("Work needed",{exact:true}).selectOption("6");
 await page.getByRole("button",{name:"Compare schedules"}).click();
 await expect(page.getByText("Start at your selected time")).toBeVisible();
 await expect(page.locator(".smart-plan-option").first()).toContainText("02/11/2026");
 await expect(page.locator("[aria-label='Page totals']")).toHaveText(before);
 const widths=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);
 expect(widths[1]).toBeLessThanOrEqual(widths[0]+3);
 await page.screenshot({path:`test-results/smart-diary-${info.project.name}.png`,fullPage:true});
});
test("compact Statistics and company PDF can be shared without changing diary entries",async({page},info)=>{
 await page.clock.setFixedTime(new Date("2026-11-02T04:00:00Z"));
 await onboard(page);await seed(page,fixture());
 await page.getByRole("button",{name:"Stats",exact:true}).click();
 const quick=page.getByLabel("Quick driving availability and rest deadlines");
 await expect(quick).toBeVisible();
 await expect(quick.getByText("24h Work left")).toBeVisible();
 await expect(quick.getByText("Next required breaks")).toBeVisible();
 await expect(quick.getByRole("button",{name:"Share availability"})).toBeVisible();
 const [download]=await Promise.all([
  page.waitForEvent("download"),
  quick.getByRole("button",{name:"Save PDF"}).click()
 ]);
 expect(download.suggestedFilename()).toMatch(/^APS-Availability-.*\.pdf$/);
 await page.getByText("Full driving calculations",{exact:true}).click();
 await expect(page.getByLabel("Driving eligibility and rolling fatigue statistics")).toBeVisible();
 await page.screenshot({path:`test-results/smart-stats-${info.project.name}.png`,fullPage:true});
});
