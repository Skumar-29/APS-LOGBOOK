import {test,expect,type Page} from '@playwright/test';
import {novemberCumulative,fourteenHours} from '../fixtures/november-cumulative';
import {editRange} from '../../src/domain/diary';
import {dateAdd} from '../../src/domain/time';
async function seed(page:Page,s:ReturnType<typeof novemberCumulative>){
 await page.goto('/');
 await page.getByLabel('Driver name',{exact:true}).fill('Cumulative regression');
 await page.getByLabel('Licence number',{exact:true}).fill('TEST');
 await page.getByRole('button',{name:'Save driver settings',exact:true}).click();
 await page.evaluate(async state=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open('aps-truck-workspace-v2',2);
  req.onsuccess=()=>{const db=req.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),old=store.get('current');
   old.onsuccess=()=>{state.revision=old.result.revision+1;store.put(state,'current');};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);
 }),s);await page.reload();
}
async function date(page:Page,d:string){await page.getByLabel('Diary date',{exact:true}).fill(d);await page.getByLabel('Diary date',{exact:true}).press('Tab');}
const cell=(page:Page,slot:number)=>page.locator(`.swipe-block[data-slot="${slot}"]`);
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-11-06T02:00:00Z'));});
test('release review: cumulative 84h excess starts at 06:45 without a prior 24h checkpoint',async({page},info)=>{
 const s=novemberCumulative();for(let n=0;n<6;n++)fourteenHours(s,dateAdd('2026-11-06',n));editRange(s,'2026-11-12',27,28,'work');
 await seed(page,s);await date(page,'2026-11-12');
 await expect(cell(page,27)).toHaveClass(/breach/);await expect(cell(page,27)).toHaveAttribute('title',/84 hours work exceeded/);
 await expect(cell(page,27)).toHaveCSS('background-color','rgb(210, 60, 60)');
 const totals=page.getByLabel('Cumulative work and breach totals');
 await expect(totals).toContainText('84h 15m');await expect(totals).toContainText('Exceeded');
 await expect(page.locator('.short-warnings')).toContainText('84 hours work exceeded');
 await expect(page.locator('.short-warnings')).toContainText('12/11/2026 06:45');
 await page.reload();await date(page,'2026-11-12');await expect(cell(page,27)).toHaveClass(/breach/);
 await page.getByRole('button',{name:'Stats',exact:true}).click();await expect(page.getByLabel('Cumulative work and breach totals')).toContainText('84h 15m');
 await page.screenshot({path:info.outputPath('84-hour-excess.png'),fullPage:true});
});
test('release review: cumulative 144h excess stays red while older history needs review',async({page},info)=>{
 const s=novemberCumulative();for(let n=0;n<12;n++)fourteenHours(s,dateAdd('2026-11-06',n));
 await seed(page,s);await date(page,'2026-11-17');
 await expect(cell(page,43)).toHaveAttribute('title',/14 days work limit exceeded/);
 await expect(cell(page,43)).toHaveClass(/breach/);
 const row=page.locator('.cumulative-limit').filter({hasText:'14d Work'});
 await expect(row).toContainText('154h 00m / 144h');await expect(row).toContainText('Exceeded');
 await page.screenshot({path:info.outputPath('144-hour-excess.png'),fullPage:true});
});
test('release review: cumulative 7d night breach and zero remaining cannot be hidden by Review',async({page},info)=>{
 const s=novemberCumulative();for(let n=0;n<7;n++)editRange(s,dateAdd('2026-11-06',n),0,24,'work');
 await seed(page,s);await date(page,'2026-11-12');
 await expect(cell(page,0)).toHaveAttribute('title',/36h long\/night work exceeded/);
 await expect(cell(page,0)).toHaveClass(/breach/);
 const row=page.locator('.cumulative-limit').filter({hasText:'7d long/night'});
 // At midnight the earliest 7-day window expires. Its red breach remains;
 // the next active window contains 36h, rather than resetting to zero.
 await expect(row).toContainText('36h 00m / 36h');await expect(row).toContainText('At limit');
 await expect(page.getByLabel('Active 24-hour window')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>document.documentElement.clientWidth)+2);
 await page.screenshot({path:info.outputPath('7-day-night-excess.png'),fullPage:true});
});
test('release review: cumulative recorded 14d excess remains visible when period needs confirmation',async({page})=>{
 const s=novemberCumulative();for(let n=0;n<12;n++){const d=dateAdd('2026-11-06',n);fourteenHours(s,d);s.days[d].restDefault='unknown';}
 await seed(page,s);await date(page,'2026-11-17');
 await expect(page.locator('.cumulative-limit').filter({hasText:'14d Work'})).toContainText('Recorded excess · review period');
 await expect(page.locator('.short-warnings')).toContainText('14 days recorded work exceeds limit');
 await expect(page.locator('.short-warnings')).toContainText('Review:');
});
