import {test,expect,type Page} from '@playwright/test';
import {emptyState,ensureDay} from '../../src/domain/model';
import {editRange,switchTimer} from '../../src/domain/diary';
import {dateAdd,instantFor} from '../../src/domain/time';
import {readFile} from 'node:fs/promises';
async function start(p:Page,path='/'){
 await p.goto(path);
 await p.getByLabel('Driver name',{exact:true}).fill('Release Review');
 await p.getByLabel('Licence number',{exact:true}).fill('TEST');
 await p.getByLabel('Driver base',{exact:true}).selectOption('QLD');
 await p.getByRole('button',{name:'Save driver settings',exact:true}).click();
}
async function seed(p:Page,state:ReturnType<typeof emptyState>){
 await p.evaluate(async state=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open('aps-truck-workspace-v2',2);
  req.onsuccess=()=>{const db=req.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),old=store.get('current');
   old.onsuccess=()=>{state.revision=old.result.revision+1;store.put(state,'current');};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);
 }),state);await p.reload();
}
async function noOverflow(p:Page){expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await p.evaluate(()=>document.documentElement.clientWidth)+2);}
test('release review: compact header and every page remain reachable at narrow widths',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-11-05T03:00:00Z'));await start(page);
 for(const width of [320,390,440]){
  await page.setViewportSize({width,height:850});await noOverflow(page);
  expect((await page.locator('.workspace-header').boundingBox())!.height).toBeLessThan(125);
  const first=await page.locator('.swipe-block').first().boundingBox();expect(first!.y).toBeLessThan(350);
 }
 await page.screenshot({path:info.outputPath('diary-compact.png'),fullPage:true});
 for(const screen of ['Driving','Graph','Stats','More']){
  await page.getByRole('button',{name:screen,exact:true}).click();
  await expect(page.locator('main')).not.toContainText('Opening…');await noOverflow(page);
  await page.screenshot({path:info.outputPath(screen+'.png'),fullPage:true});
 }
 for(const screen of ['Invoices','Forms','Documents','Notes','Records','NHVR guide','Settings']){
  await page.getByRole('button',{name:new RegExp('^'+screen+' ')}).click();
  await expect(page.locator('.header-title h1')).toHaveText(screen);
  await expect(page.locator('main')).not.toContainText('Opening…');await noOverflow(page);
  await page.screenshot({path:info.outputPath(screen.replaceAll(' ','-')+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Back to tools',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your tools',exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});
test('release review: planned Work stays striped and red breaches survive mixed future edits',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-05T03:00:00Z'));await start(page);
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Release Review',licence:'TEST',base:'QLD',zone:'Australia/Brisbane'});
 ensureDay(s,'2026-11-04').restDefault='stationary';
 ensureDay(s,'2026-11-05').restDefault='stationary';editRange(s,'2026-11-05',0,96,'work');await seed(page,s);
 const future=page.locator('.swipe-block[data-slot="80"]');
 await expect(future).toHaveClass(/future-work/);await expect(future).toHaveClass(/breach/);
 await expect(future).toHaveCSS('background-color','rgb(198, 40, 40)');
 await expect(future).not.toHaveCSS('background-image','none');
 await expect(page.locator('.swipe-block[data-slot="0"]')).not.toHaveClass(/future-work/);
 const earlier=await page.locator('.swipe-block.breach:not(.future-work)').count();expect(earlier).toBeGreaterThan(0);
 await future.click();await expect(future).toHaveAttribute('aria-pressed','false');
 await expect.poll(()=>page.locator('.swipe-block.breach:not(.future-work)').count()).toBe(earlier);
 await page.reload();await expect(future).toHaveAttribute('aria-pressed','false');
});
test('release review: overnight timer agrees across Diary Stats Driving and CSV',async({page},info)=>{
 await page.clock.setFixedTime(new Date('2026-11-05T17:00:00Z'));await start(page);
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.diaryRestDefault='stationary';
 Object.assign(s.profile,{name:'Release Review',licence:'TEST',base:'QLD',zone:'Australia/Brisbane'});
 for(let n=0;n<42;n++)ensureDay(s,dateAdd('2026-09-26',n));
 switchTimer(s,'work','TEST','unknown',instantFor('2026-11-05','20:15',s.profile.zone)[0]);await seed(page,s);
 await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 3h 00m');
 await page.getByRole('button',{name:'Stats',exact:true}).click();
 await expect(page.getByLabel('Quick driving availability and rest deadlines')).toContainText('3h 00m');
 await page.getByText('Calendar history & night Rest',{exact:true}).click();
 await expect(page.locator('.stat-day').filter({hasText:'06/11'})).toContainText('W 3h 00m');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export period CSV',exact:true}).click();
 const file=await event;await file.saveAs(info.outputPath('overnight.csv'));
 const csv=await readFile(info.outputPath('overnight.csv'),'utf8');
 expect(csv).toContain('"2026-11-05 20:15","2026-11-06 00:00","work"');
 expect(csv).toContain('"2026-11-06 00:00","2026-11-06 03:00","work"');
 await page.getByRole('button',{name:'Driving',exact:true}).click();
 await expect(page.getByText('Today’s work').locator('..')).toContainText('3h 00m');
});
test('release review: GitHub Pages subpath installs APS Logbook and reloads offline',async({page,context,browserName,request})=>{
 await start(page,'/APS-LOGBOOK/');
 await page.locator('.swipe-block[data-slot="0"]').click();
 await expect(page.locator('.swipe-block[data-slot="0"]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);expect(scope).toContain('/APS-LOGBOOK/');
 const manifest=await (await request.get('/APS-LOGBOOK/manifest.webmanifest')).json();expect(manifest.name).toBe('APS Logbook');expect(manifest.scope).toBe('./');
 if(browserName==='webkit')expect((await request.post('http://127.0.0.1:4174/offline')).ok()).toBe(true);else await context.setOffline(true);
 try{
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  await expect(page.locator('.swipe-block[data-slot="0"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Graph',exact:true}).click();await expect(page.locator('.paper svg')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.fonts.check('12px "Workspace Sans"'))).toBe(true);
 }finally{
  if(browserName==='webkit')expect((await request.post('http://127.0.0.1:4174/online')).ok()).toBe(true);else await context.setOffline(false);
 }
});
