import {test,expect,type Page} from '@playwright/test';
import {screenshotFixture} from '../fixtures/screenshot-history';
async function open(p:Page){
 await p.clock.setFixedTime(new Date('2026-10-13T17:56:00Z'));await p.goto('/');
 for(const [label,value] of [['Driver name','Synthetic Audit'],['Licence number','TEST']]){await p.getByLabel(label,{exact:true}).fill(value);await p.getByLabel(label,{exact:true}).press('Tab');}
 await p.getByLabel('Driver base',{exact:true}).selectOption('QLD');await p.getByRole('button',{name:'Save driver settings',exact:true}).click();
 await p.evaluate(async s=>{await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aps-truck-workspace-v2',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),old=store.get('current');old.onsuccess=()=>{s.revision=old.result.revision+1;store.put(s,'current');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});},screenshotFixture());await p.reload();
}
async function date(p:Page,d:string){await p.getByLabel('Diary date',{exact:true}).fill(d);await p.getByLabel('Diary date',{exact:true}).press('Tab');}
test('screenshot audit: binary rest totals, mixed-zone red work and persisted future plan',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await date(page,'2026-10-06');
 await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 4h 00m');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Rest 20h 00m');await expect(page.locator('[aria-label="Page totals"]')).not.toContainText('Missing');
 await date(page,'2026-10-07');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 22h 00m');await expect.poll(()=>page.locator('.block.work.breach').count()).toBeGreaterThan(0);
 await date(page,'2026-10-13');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 19h 30m');await expect.poll(()=>page.locator('.block.work.breach').count()).toBeGreaterThan(0);await expect(page.locator('.short-warnings')).toContainText('13/10/2026');
 await page.screenshot({path:info.outputPath('mixed-zone-red-work.png'),fullPage:true});
 await date(page,'2026-10-14');await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work 0h 00m');await expect(page.locator('.assessment')).toContainText('NSW time');await expect(page.locator('[aria-label="Planned page totals"]')).toContainText('Work 12h 00m');await expect(page.locator('[aria-label="Shift plan"]')).toContainText('Short-break limit:');
 await page.reload();await expect(page.locator('[aria-label="Planned page totals"]')).toContainText('Work 12h 00m');expect(errors).toEqual([]);
});
test('screenshot audit: night-work quantity agrees across Stats and Driving at the same cutoff',async({page},info)=>{
 await open(page);await date(page,'2026-10-14');await page.getByRole('button',{name:'Stats',exact:true}).click();
 const nightRow=page.locator('.record-line').filter({hasText:'Long / night work · rule window'});const quantity=await nightRow.locator('b').innerText();expect(quantity).not.toBe('0h 00m');
 await expect(page.getByText(/Calendar pages/)).toBeVisible();await page.getByRole('button',{name:'Driving',exact:true}).click();
 await expect(page.locator('.record-line').filter({hasText:'7 days long/night'})).toContainText(quantity);await expect(page.locator('.status.review').first()).toBeVisible();await expect(page.locator('.status.open').first()).toBeVisible();
 await page.screenshot({path:info.outputPath('review-colours-and-periods.png'),fullPage:true});
});
