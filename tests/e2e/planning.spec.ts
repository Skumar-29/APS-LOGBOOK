import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {emptyState,ensureDay} from '../../src/domain/model';
import {editRange} from '../../src/domain/diary';
import {dateAdd} from '../../src/domain/time';
async function fill(p:Page,label:string,value:string){await p.getByLabel(label,{exact:true}).fill(value);await p.getByLabel(label,{exact:true}).press('Tab');}
async function setup(p:Page,scheme:'Standard'|'BFM'='BFM',history=true){
  await p.goto('/');await fill(p,'Driver name','Synthetic Planner');await fill(p,'Licence number','TEST');await p.getByLabel('Driver base',{exact:true}).selectOption('QLD');await p.getByRole('button',{name:'Save driver settings',exact:true}).click();
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.diaryRestDefault='stationary';Object.assign(s.profile,{name:'Synthetic Planner',licence:'TEST',scheme,base:'QLD',zone:'Australia/Brisbane',certificate:'TEST',certificateExpiry:'2027-01-01'});
  if(history)for(let n=0;n<43;n++)ensureDay(s,dateAdd('2026-09-01',n));return s;
}
async function seed(p:Page,state:ReturnType<typeof emptyState>){
  await p.evaluate(async state=>{await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aps-truck-workspace-v2',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),old=store.get('current');old.onsuccess=()=>{state.revision=old.result.revision+1;store.put(state,'current');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});},state);await p.reload();
}
test('future planning: BFM recording, red striped excess, undo, completed Stats and CSV',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-10T17:00:00Z'));
  const s=await setup(page);editRange(s,'2026-10-10',80,96,'work');for(const [a,b] of [[0,8],[10,30],[32,44]])editRange(s,'2026-10-11',a,b,'work');await seed(page,s);
  await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 2h 30m');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Rest 0h 30m');
  await expect(page.locator('[aria-label="Planned page totals"]')).toContainText('Work 10h 00m');await expect(page.locator('[aria-label="Planned page totals"]')).toContainText('Rest 14h 00m');
  await expect(page.locator('.window-summary > summary')).toContainText('Planned 24h window');await expect(page.locator('.window-summary > summary')).toContainText('Work 14h 00m');
  await expect(page.locator('.block.work.planned.breach')).toHaveCount(0);
  await page.locator('[data-slot="44"][data-row="work"]').click();
  await expect(page.locator('[data-slot="44"][data-row="work"]')).toHaveClass(/planned.*breach/);
  await expect(page.locator('[aria-label="Shift plan"]')).toContainText('Plan: break due at 11/10/2026 11:00');
  await expect(page.locator('.window-summary > summary')).toContainText('Work 14h 15m');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 2h 30m');
  await page.screenshot({path:info.outputPath('bfm-planned-breach.png'),fullPage:true});
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.block.work.planned.breach')).toHaveCount(0);await expect(page.locator('.window-summary > summary')).toContainText('Work 14h 00m');
  await page.reload();await expect(page.locator('[aria-label="Planned page totals"]')).toContainText('Work 10h 00m');
  await page.getByRole('button',{name:'Stats',exact:true}).click();await expect(page.locator('.stat-day').filter({hasText:'11/10'})).toContainText('W 2h 30m · R 0h 30m');
  const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Export period CSV',exact:true}).click();const file=await exported;const path=info.outputPath('completed-only.csv');await file.saveAs(path);const csv=await readFile(path,'utf8');
  const row=csv.split('\r\n').find(r=>r.startsWith('"2026-10-11"')&&r.includes('"Daily total"'))!;expect(row).toContain('"150","30"');
  expect(errors).toEqual([]);
});
test('future planning: a seven-hour rest keeps the earlier cap active',async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-10-10T17:00:00Z'));const s=await setup(page);
  for(const [a,b] of [[0,16],[18,34],[36,52],[80,89]])editRange(s,'2026-10-11',a,b,'work');await seed(page,s);
  await expect(page.locator('[data-slot="88"][data-row="work"]')).toHaveClass(/planned.*breach/);
  await page.locator('.window-summary > summary').click();await expect(page.locator('.window-details')).toContainText('11/10/2026 00:00');await expect(page.locator('.window-details')).toContainText('Over work cap: 0h 15m');
  await page.screenshot({path:info.outputPath('old-window-survives-major-rest.png'),fullPage:true});
});
test('future planning: 22 recorded hours are flagged even when earlier history is missing',async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-10-11T14:00:00Z'));const s=await setup(page,'Standard',false);
  editRange(s,'2026-10-11',0,96,'work');for(const slot of [21,31,42,43,65,74,86,87])editRange(s,'2026-10-11',slot,slot+1,'rest');await seed(page,s);await fill(page,'Diary date','2026-10-11');
  await expect(page.locator('.totals')).toContainText('Work 22h 00m');await expect(page.locator('.totals')).toContainText('Rest 2h 00m');
  await expect.poll(()=>page.locator('.block.work.breach').count()).toBeGreaterThan(0);
  await expect(page.locator('.short-warnings')).toContainText('Excess work · check earlier records');await expect(page.locator('.short-warnings')).toContainText('7h continuous stationary rest needed');
  await expect(page.locator('.short-warnings')).not.toContainText('6h 30m more');await page.screenshot({path:info.outputPath('missing-history-excess.png'),fullPage:true});
});
test('future planning: completed major rest selects the new window after the earlier window expires',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-11T11:00:00Z'));const s=await setup(page);
  editRange(s,'2026-10-10',80,96,'work');for(const [a,b] of [[0,8],[10,30],[32,44],[88,96]])editRange(s,'2026-10-11',a,b,'work');await seed(page,s);
  await expect(page.locator('.window-summary > summary')).toContainText('Work 2h 00m');
  await page.locator('.window-summary > summary').click();await expect(page.locator('.window-details')).toContainText('11/10/2026 22:00');await expect(page.locator('.window-details')).toContainText('12/10/2026 22:00');
  await expect(page.locator('[aria-label="Shift plan"]')).toContainText('Continuous work limit: 12/10/2026 04:00');await expect(page.locator('.block.work.planned.breach')).toHaveCount(0);
});
