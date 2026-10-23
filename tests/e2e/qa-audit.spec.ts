import {test,expect,type Page} from "@playwright/test";
import {emptyState,ensureDay} from "../../src/domain/model";
import {editRange} from "../../src/domain/diary";

async function onboard(page:Page){
  await page.goto("/");
  await page.getByLabel("Driver name",{exact:true}).fill("Audit Test Driver");
  await page.getByLabel("Licence number",{exact:true}).fill("TEST");
  await page.getByLabel("Driver base",{exact:true}).selectOption("QLD");
  await page.getByRole("button",{name:"Save driver settings",exact:true}).click();
}
async function seed(page:Page,s:ReturnType<typeof emptyState>){
  await page.evaluate(async (workspace)=>{
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open("aps-truck-workspace-v2",2);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction("workspace","readwrite");
        const st=tx.objectStore("workspace"),old=st.get("current");
        old.onsuccess=()=>{workspace.revision=old.result.revision+1;st.put(workspace,"current");};
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>reject(tx.error);
      };
      req.onerror=()=>reject(req.error);
    });
  },s);
  await page.reload();
}
async function chooseDate(page:Page,d:string){
  const field=page.getByLabel("Diary date",{exact:true});
  await field.fill(d);await field.press("Tab");
}
test("Audit: seven-hour and night rest suggestions appear after six continuous stationary hours",async ({page},testInfo)=>{
  await page.clock.setFixedTime(new Date("2026-10-22T19:00:00Z")); // 05:00 Brisbane Oct 23
  await onboard(page);
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:"Audit Test Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
  const prev=ensureDay(s,"2026-10-22");prev.restDefault="stationary";
  editRange(s,"2026-10-22",0,92,"work"); // Rest 23:00-00:00
  const current=ensureDay(s,"2026-10-23");current.restDefault="stationary";
  await seed(page,s);await chooseDate(page,"2026-10-23");
  const advice=page.getByText("Rest opportunity",{exact:true});
  await expect(advice).toBeVisible({timeout:15000});
  await expect(page.getByText(/Continue stationary Rest for 1h more to complete 7 continuous hours/)).toBeVisible();
  await expect(page.getByText(/Continue Rest for 1h more to qualify for one night-rest break/)).toBeVisible();
  const bounds=await advice.boundingBox();
  console.log("AUDIT rest-advisor placement",JSON.stringify(bounds));
  await page.screenshot({path:`test-results/audit-rest-opportunity-${testInfo.project.name}.png`,fullPage:true});
});
test("Audit: BFM 21-22 October excessive work shows red selected blocks",async({page},testInfo)=>{
  await page.clock.setFixedTime(new Date("2026-10-22T11:00:00Z"));
  await onboard(page);
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:"Audit Test Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
  ensureDay(s,"2026-10-20");
  const d21=ensureDay(s,"2026-10-21");d21.restDefault="stationary";
  const d22=ensureDay(s,"2026-10-22");d22.restDefault="stationary";
  editRange(s,"2026-10-21",86,89,"work"); // 21:30-22:15
  editRange(s,"2026-10-22",13,74,"work"); // 03:15-18:30
  await seed(page,s);await chooseDate(page,"2026-10-22");
  await expect(page.locator("[aria-label='Page totals']")).toContainText("15h 15m");
  const red=page.locator(".swipe-block.work.breach");
  const count=await red.count();
  console.log("AUDIT BFM red selected block count",count);
  await page.screenshot({path:`test-results/audit-bfm-overnight-${testInfo.project.name}.png`,fullPage:true});
  await expect(red.first()).toBeVisible({timeout:15000});
  await expect(red.first()).toHaveCSS("background-color","rgb(198, 40, 40)");
});
test("Audit: mobile diary arrows preserve touch target width and avoid horizontal overflow",async({page},testInfo)=>{
  await page.clock.setFixedTime(new Date("2026-10-23T01:00:00Z"));
  await onboard(page);
  const previous=page.getByRole("button",{name:"Previous diary day"});
  const next=page.getByRole("button",{name:"Next diary day"});
  const prevWidth=await previous.evaluate(el=>el.getBoundingClientRect().width);
  const nextWidth=await next.evaluate(el=>el.getBoundingClientRect().width);
  const dimensions=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth,
    header:document.querySelector(".workspace-header")?.getBoundingClientRect().height||0
  }));
  console.log("AUDIT mobile date arrow widths",prevWidth,nextWidth,JSON.stringify(dimensions));
  await page.screenshot({path:`test-results/audit-header-${testInfo.project.name}.png`,fullPage:false});
  await expect(previous).toBeVisible();await expect(next).toBeVisible();
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport+3);
  if(testInfo.project.name==="phone"){
    expect(prevWidth).toBeGreaterThanOrEqual(54);
    expect(nextWidth).toBeGreaterThanOrEqual(54);
  }
});
test("Audit: switch Diary to Stats without losing selected Work and no browser errors",async({page},testInfo)=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-22T10:00:00Z"));
  await onboard(page);
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:"Audit Test Driver",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",scheme:"BFM"});
  ensureDay(s,"2026-10-21");
  editRange(s,"2026-10-22",0,48,"work");
  await seed(page,s);await chooseDate(page,"2026-10-22");
  await expect(page.locator("[aria-label='Page totals']")).toContainText("12h 00m");
  await page.getByRole("button",{name:"Stats",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Statistics"})).toBeVisible();
  await expect(page.locator(".stat-day").last()).toContainText("W 12h 00m");
  const unrecorded=await page.getByText("Unrecorded",{exact:true}).count();
  console.log("AUDIT statistics unrecorded metric still shown",unrecorded>0);
  await page.screenshot({path:`test-results/audit-statistics-${testInfo.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});
