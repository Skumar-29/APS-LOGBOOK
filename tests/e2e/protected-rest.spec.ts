import {test,expect,type Page} from "@playwright/test";
import { assessmentTime, overlappingRestart, restartDay } from "../fixtures/bfm-overlapping-restart";
import {emptyState,ensureDay} from "../../src/domain/model";
import {editRange} from "../../src/domain/diary";

async function start(page:Page){
 await page.goto("/");
 await page.getByLabel("Driver name",{exact:true}).fill("Rest Scenario Driver");
 await page.getByLabel("Licence number",{exact:true}).fill("TEST");
 await page.getByLabel("Driver base",{exact:true}).selectOption("QLD");
 await page.getByRole("button",{name:"Save driver settings",exact:true}).click();
}
async function seed(page:Page,s:ReturnType<typeof emptyState>){
 await page.evaluate(async (workspace)=>{
  await new Promise<void>((resolve,reject)=>{
   const req=indexedDB.open("aps-truck-workspace-v2",2);
   req.onsuccess=()=>{
    const db=req.result,tx=db.transaction("workspace","readwrite"),st=tx.objectStore("workspace"),old=st.get("current");
    old.onsuccess=()=>{workspace.revision=old.result.revision+1;st.put(workspace,"current");};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
   };req.onerror=()=>reject(req.error);
  });
 },s);
 await page.reload();
}
test("phone navigation controls have useful touch widths without horizontal scrolling",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-10-23T00:00:00Z"));
 await start(page);
 const prev=page.getByRole("button",{name:"Previous diary day"}),next=page.getByRole("button",{name:"Next diary day"});
 await expect(prev).toBeVisible();await expect(next).toBeVisible();
 const a=await prev.evaluate(el=>el.getBoundingClientRect().width),b=await next.evaluate(el=>el.getBoundingClientRect().width);
 expect(a).toBeGreaterThanOrEqual(56);
 expect(b).toBeGreaterThanOrEqual(56);
 const x=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);
 expect(x[1]).toBeLessThanOrEqual(x[0]+3);
});
test("BFM protected seven-hour rest paints yellow and projected Work conflicts red",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-10-22T02:00:00Z")); // QLD noon, 22 October
 await start(page);
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:"Rest Scenario Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
 const p=ensureDay(s,"2026-10-21");p.restDefault="stationary";
 const d=ensureDay(s,"2026-10-22");d.restDefault="stationary";
 editRange(s,"2026-10-21",86,89,"work");
 editRange(s,"2026-10-22",13,74,"work");
 await seed(page,s);
 const field=page.getByLabel("Diary date",{exact:true});
 await field.fill("2026-10-22");await field.press("Tab");
 const banner=page.locator(".prevention-advisor");
 await expect(banner).toBeVisible({timeout:30000});
 await expect(banner).toContainText("14:30");
 const yellow=page.locator(".swipe-block.rest.protected-rest[data-slot='74']");
 const red=page.locator(".swipe-block.work[data-slot='58']");
 await expect(yellow).toBeVisible({timeout:30000});
 await expect(red).toBeVisible();
 await expect(red).toHaveClass(/breach|rest-risk/);
 await expect(red).toHaveCSS("background-color","rgb(198, 40, 40)");
 await expect(yellow).toHaveCSS("background-color","rgb(245, 206, 103)");
 await red.click();
 await expect(page.locator(".swipe-block[data-slot='58']")).toHaveAttribute("aria-pressed","false");
});

test("BFM diary and Statistics show long/night balance, night-rest progress and remaining Work",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-10-22T02:00:00Z"));
 await start(page);
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:"Rest Scenario Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",
  scheme:"BFM",twoUp:false,certificate:"BFM-TEST",certificateExpiry:"2027-12-31"});
 const p=ensureDay(s,"2026-10-21");p.restDefault="stationary";
 const d=ensureDay(s,"2026-10-22");d.restDefault="stationary";
 editRange(s,"2026-10-21",0,16,"work");
 editRange(s,"2026-10-22",0,12,"work");
 await seed(page,s);
 const field=page.getByLabel("Diary date",{exact:true});
 await field.fill("2026-10-22");await field.press("Tab");
 await expect(page.locator(".fatigue-quick-summary")).toContainText("BFM long/night");
 await expect(page.locator(".fatigue-quick-summary")).toContainText("Night rests");
 await page.getByRole("button",{name:"Stats",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Statistics"})).toBeVisible();
 await expect(page.getByLabel("Quick driving availability and rest deadlines")).toBeVisible();
 await page.getByText("Calendar history & night Rest",{exact:true}).click();
 await expect(page.getByText("Remaining Work · 14d",{exact:true})).toBeVisible();
 await expect(page.getByText("Unrecorded",{exact:true})).toHaveCount(0);
 await expect(page.getByText(/BFM long\/night allowance remaining/)).toBeVisible();
 await expect(page.getByText("Consecutive-night pair",{exact:true})).toBeVisible();
});

test("release review: overlapping BFM restart credits planned Rest and retains the old cap", async ({ page }) => {
  await page.clock.setFixedTime(new Date(assessmentTime));
  await start(page);
  const workspace = overlappingRestart();
  editRange(workspace, restartDay, 76, 96, "work");
  await seed(page, workspace);

  const block = (slot: number) => page.locator(`.swipe-block[data-slot="${slot}"]`);
  // Wait for the analysis to load before checking that the restart stays green.
  await expect(page.locator(".assessment")).toContainText("QLD time");
  for (let slot = 76; slot < 96; slot++) {
    await expect(block(slot)).toHaveClass(/future-work/);
    await expect(block(slot)).not.toHaveClass(/breach|rest-risk/);
  }

  // Add a quarter at 5 pm. The old window now runs out at 7:45 pm,
  // while the 8 pm block falls outside the old window.
  await block(68).click();
  await expect(block(79)).toHaveClass(/breach/);
  await expect(block(79)).toHaveAttribute("title", /24h work limit exceeded/);
  await expect(block(80)).not.toHaveClass(/breach|rest-risk/);
});
