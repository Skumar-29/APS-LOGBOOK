import {test,expect,type Page} from "@playwright/test";
import {emptyState,ensureDay} from "../../src/domain/model";
import {editRange} from "../../src/domain/diary";

async function onboard(page:Page){
  await page.goto("/");
  await page.getByLabel("Driver name",{exact:true}).fill("Touch Safety Test");
  await page.getByLabel("Licence number",{exact:true}).fill("TEST");
  await page.getByLabel("Driver base",{exact:true}).selectOption("QLD");
  await page.getByRole("button",{name:"Save driver settings",exact:true}).click();
}
async function seed(page:Page){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.fullDay=true;
 Object.assign(s.profile,{name:"Touch Safety Test",licence:"TEST",base:"QLD",
 zone:"Australia/Brisbane",scheme:"BFM",twoUp:false});
 const d=ensureDay(s,"2026-11-05");d.restDefault="stationary";
 editRange(s,"2026-11-05",5,9,"work");
 editRange(s,"2026-11-05",35,39,"work");
 await page.evaluate(async workspace=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open("aps-truck-workspace-v2",2);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction("workspace","readwrite"),store=tx.objectStore("workspace");
   const old=store.get("current");
   old.onsuccess=()=>{workspace.revision=old.result.revision+1;store.put(workspace,"current");};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };req.onerror=()=>reject(req.error);
 }),s);
 await page.reload();
}
async function slotsAndRevision(page:Page){
 return page.evaluate(async()=>new Promise<{slots:string[],revision:number}>((resolve,reject)=>{
  const req=indexedDB.open("aps-truck-workspace-v2",2);
  req.onsuccess=()=>{
    const db=req.result,tx=db.transaction("workspace","readonly");
    const get=tx.objectStore("workspace").get("current");
    get.onsuccess=()=>{const d=get.result.days["2026-11-05"];resolve({slots:[...d.slots],revision:d.revision});};
    get.onerror=()=>reject(get.error);
    tx.oncomplete=()=>db.close();
  };req.onerror=()=>reject(req.error);
 }));
}
const block=(page:Page,i:number)=>page.locator(`.swipe-block[data-slot="${i}"]`);
test("all controls fit on phone and balances remain beside the grid",async({page},info)=>{
 await page.clock.setFixedTime(new Date("2026-11-05T05:00:00Z"));
 await onboard(page);await seed(page);
 const card=page.locator(".block-card");
 await expect(card.getByLabel("Diary hours and remaining allowances")).toBeVisible();
 await expect(card.getByLabel("Diary hours and remaining allowances")).toContainText("Work / Rest");
 await expect(card.getByLabel("Work and rest block colours")).toContainText("Red ?");
 const choices=card.locator(".periods button");
 await expect(choices).toHaveCount(4);
 for(let i=0;i<4;i++){
   const b=await choices.nth(i).boundingBox();
   expect(b).not.toBeNull();
   const vw=await page.evaluate(()=>document.documentElement.clientWidth);
   expect(b!.x).toBeGreaterThanOrEqual(0);
   expect(b!.x+b!.width).toBeLessThanOrEqual(vw+2);
 }
 const dimensions=await page.evaluate(()=>({inner:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.inner+2);
 await page.screenshot({path:`test-results/diary-touch-layout-${info.project.name}.png`,fullPage:true});
});
test("vertical drag is never saved, while a deliberate horizontal swipe and a tap still work",async({page},info)=>{
 await page.clock.setFixedTime(new Date("2026-11-05T05:00:00Z"));
 await onboard(page);await seed(page);
 await page.evaluate(()=>window.scrollTo(0,0));
 await block(page,2).scrollIntoViewIfNeeded();
 const before=await slotsAndRevision(page);
 const originalScroll=await page.evaluate(()=>window.scrollY);
 const area=await block(page,2).boundingBox();
 if(!area)throw Error("Block not on screen");
 const x=area.x+area.width/2,y=area.y+area.height/2;
 if(info.project.name==="phone"){
   const cdp=await page.context().newCDPSession(page);
   const touch=(px:number,py:number)=>[{x:px,y:py,radiusX:4,radiusY:4,force:1}];
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:touch(x,y)});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touch(x+2,y-48)});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touch(x+2,y-110)});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   await page.waitForTimeout(150);
   expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(originalScroll);
 }else{
   await page.mouse.move(x,y);
   await page.mouse.down();
   await page.mouse.move(x+1,y+85,{steps:8});
   await page.mouse.up();
 }
 expect(await slotsAndRevision(page)).toEqual(before);
 // A deliberate horizontal swipe must still paint the intended block range.
 await block(page,11).scrollIntoViewIfNeeded();
 const left=await block(page,11).boundingBox(),right=await block(page,16).boundingBox();
 if(!left||!right)throw Error("Horizontal swipe range not visible");
 const atStart=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute("data-slot")||document.elementFromPoint(x,y)?.tagName,{x:left.x+left.width/2,y:left.y+left.height/2});
 console.log("HORIZONTAL_START_TARGET",info.project.name,atStart,{left,right});
 expect(atStart).toBe("11"); // A sticky header must not intercept the finger.
 if(info.project.name==="phone"){
   await page.evaluate(()=>{
     const row=document.querySelector('.swipe-block[data-slot="11"]')?.closest('.swipe-blocks');
     const w=window as typeof window&{__gestureDebug?:string[]};
     w.__gestureDebug=[];
     for(const eventName of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture","touchstart","touchmove","touchend","touchcancel"]){
       row?.addEventListener(eventName,(event)=>{
         const e=event as PointerEvent;
         w.__gestureDebug?.push([e.type,e.pointerId??"",e.isPrimary??"",Math.round(e.clientX??0),Math.round(e.clientY??0),
           (e.target as Element)?.getAttribute?.("data-slot")??""].join(":"));
       },true);
     }
   });
   const cdp=await page.context().newCDPSession(page);
   const y=left.y+left.height/2;
   const x1=left.x+left.width/2,x2=right.x+right.width/2;
   const touch=(x:number)=>[{x,y,radiusX:3,radiusY:3,force:1}];
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:touch(x1)});
   for(let i=1;i<=8;i++){
     await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touch(x1+(x2-x1)*i/8)});
     await page.waitForTimeout(25); // Approximate real finger motion, avoid event coalescing.
   }
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   console.log("PHONE_TOUCH_DEBUG",JSON.stringify(await page.evaluate(()=>(window as typeof window&{__gestureDebug?:string[]}).__gestureDebug||[])));
 }else{
   await page.mouse.move(left.x+left.width/2,left.y+left.height/2);
   await page.mouse.down();
   await page.mouse.move(right.x+right.width/2,right.y+right.height/2,{steps:14});
   await page.mouse.up();
 }
 for(let i=11;i<=16;i++)await expect(block(page,i)).toHaveAttribute("aria-pressed","true");
 const justPainted=await slotsAndRevision(page);
 expect(justPainted.revision).toBeGreaterThan(before.revision);
 // Single intentional tap toggles once, and not again on the synthetic click.
 if(info.project.name==="phone"){
   const b=await block(page,19).boundingBox();
   if(!b)throw Error("Tap target missing");
   await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
 }else{
   await block(page,19).click();
 }
 await expect(block(page,19)).toHaveAttribute("aria-pressed","true");
 await page.reload();
 await expect(block(page,19)).toHaveAttribute("aria-pressed","true");
});
test("cancelled horizontal gesture and diagonal movement save nothing",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-11-05T05:00:00Z"));
 await onboard(page);await seed(page);
 const before=await slotsAndRevision(page);
 const el=block(page,50);
 await el.dispatchEvent("pointerdown",{pointerId:91,pointerType:"touch",isPrimary:true,clientX:60,clientY:410,button:0});
 await el.dispatchEvent("pointermove",{pointerId:91,pointerType:"touch",isPrimary:true,clientX:125,clientY:413});
 await el.dispatchEvent("pointercancel",{pointerId:91,pointerType:"touch",isPrimary:true,clientX:125,clientY:413});
 await el.dispatchEvent("pointerup",{pointerId:91,pointerType:"touch",isPrimary:true,clientX:125,clientY:413});
 const diagonal=block(page,51);
 await diagonal.dispatchEvent("pointerdown",{pointerId:92,pointerType:"touch",isPrimary:true,clientX:60,clientY:410,button:0});
 await diagonal.dispatchEvent("pointermove",{pointerId:92,pointerType:"touch",isPrimary:true,clientX:90,clientY:452});
 await diagonal.dispatchEvent("pointerup",{pointerId:92,pointerType:"touch",isPrimary:true,clientX:90,clientY:452});
 expect(await slotsAndRevision(page)).toEqual(before);
});
