import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {emptyState,ensureDay} from '../../src/domain/model';
import {dateAdd,minutesLabel} from '../../src/domain/time';
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function fill(p:Page,label:string,value:string) {const el=p.getByLabel(label,{exact:true});await el.fill(value);await el.press('Tab');}
async function more(p:Page,item:string) {await p.getByRole('button',{name:'More',exact:true}).click();await p.getByRole('button',{name:new RegExp('^'+item+' ')}).click();}
async function range(p:Page,from:string,to:string,kind='work') {await p.getByRole('button',{name:'Time range',exact:true}).click();await fill(p,'From',from);await fill(p,'To (24:00 for midnight)',to);await p.getByRole('button',{name:kind==='work'?'Save work':'Save rest',exact:true}).click();}
for(const mode of [
  {name:'Solo Standard',scheme:'Standard',twoUp:false,start:'2026-07-01',hours:8},
  {name:'Solo BFM',scheme:'BFM',twoUp:false,start:'2026-08-01',hours:10},
  {name:'Two-up Standard',scheme:'Standard',twoUp:true,start:'2026-09-01',hours:8},
  {name:'Two-up BFM',scheme:'BFM',twoUp:true,start:'2026-09-01',hours:10},
] as const) test('monthly driver use: '+mode.name,async({page},info)=>{
  test.setTimeout(300000);page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-10T13:59:59Z'));
  await page.goto('/');await fill(page,'Driver name','Synthetic Month Driver');await fill(page,'Licence number','TEST');
  await page.getByLabel('Driver base',{exact:true}).selectOption('QLD');await page.getByRole('button',{name:'Save driver settings',exact:true}).click();
  const s=emptyState();s.onboarded=true;s.settings.autoPages=false;s.settings.diaryRestDefault='stationary';
  Object.assign(s.profile,{name:'Synthetic Month Driver',licence:'TEST',base:'QLD',zone:'Australia/Brisbane',scheme:mode.scheme,twoUp:mode.twoUp,coDriver:mode.twoUp?'Synthetic co-driver':'',certificate:mode.scheme==='BFM'?'TEST':'',certificateExpiry:'2027-01-01',signature});
  for(let n=-28;n<30;n++)ensureDay(s,dateAdd(mode.start,n));
  await page.evaluate(async state=>{
    await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aps-truck-workspace-v2',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),prev=store.get('current');prev.onsuccess=()=>{state.revision=prev.result.revision+1;store.put(state,'current');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});
  },s);await page.reload();
  let monthWork=0,forms=0;
  for(let n=0;n<30;n++){
    const date=dateAdd(mode.start,n),working=n%7<5;
    if(n%7===0)console.log(mode.name+' week '+(1+Math.floor(n/7))); 
    await fill(page,'Diary date',date);
    await expect(page.getByLabel('Diary date',{exact:true})).toHaveValue(date);
    if(working){
      await range(page,'06:00',mode.hours===8?'10:00':'11:00');
      await range(page,mode.hours===8?'10:30':'11:30',mode.hours===8?'14:30':'16:30');monthWork+=mode.hours*60;
    }
    await expect(page.locator('[aria-label="Page totals"]')).toContainText('Work '+minutesLabel(working?mode.hours*60:0));
    await expect(page.locator('[aria-label="Page totals"]')).toContainText('Rest '+minutesLabel(1440-(working?mode.hours*60:0)));
    await expect(page.locator('.block.work.breach')).toHaveCount(0);
    if(n%7===0){
      await more(page,'Forms');await page.getByRole('button',{name:'+ New form',exact:true}).click();
      await fill(page,'Location','Laverton North');await fill(page,'Destination','Rocklea');await fill(page,'Departure date',date);await fill(page,'Departure time','06:00');await fill(page,'Estimated arrival',date+'T18:00');await fill(page,'Truck registration','TEST01');
      await page.getByRole('button',{name:'All checked · OK',exact:true}).click();await page.getByRole('button',{name:'Reviewed all · all clear',exact:true}).click();
      await page.getByLabel('I have reviewed this form and these answers for this trip',{exact:true}).check();await page.getByRole('button',{name:'Apply my saved signature',exact:true}).click();
      await expect(page.getByText('Signed by Synthetic Month Driver. This saved form is read only.',{exact:true})).toBeVisible();forms++;
      if(n===0){
        await page.getByRole('button',{name:'Preview / export PDF',exact:true}).click();await expect(page.getByRole('button',{name:'Download PDF',exact:true})).toBeEnabled({timeout:60000});const download=page.waitForEvent('download',{timeout:20000});await page.getByRole('button',{name:'Download PDF',exact:true}).click();const file=await download;const path=info.outputPath('safe-driving.pdf');await file.saveAs(path);expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(2);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      }
      await page.getByRole('button',{name:'Diary',exact:true}).click();
    }
  }
  const badDate=dateAdd(mode.start,14);await fill(page,'Diary date',badDate);await range(page,'00:00','15:00');
  await expect.poll(()=>page.locator('.block.work.breach').count()).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('deliberate-breach.png'),fullPage:true});await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.block.work.breach')).toHaveCount(0);await expect(page.locator('.totals')).toContainText('Work '+minutesLabel(mode.hours*60));
  await page.reload();await fill(page,'Diary date',badDate);await expect(page.locator('.block.work.breach')).toHaveCount(0);
  await more(page,'Invoices');await page.getByRole('button',{name:'+ New invoice',exact:true}).click();
  await fill(page,'Bill to','Synthetic Transport');await fill(page,'Date from',mode.start);await fill(page,'Date to',dateAdd(mode.start,29));
  await fill(page,'Load date',mode.start);await fill(page,'From','MEL');await fill(page,'To','BNE');await fill(page,'BD / RT / BT / AB / C/O','BD');await fill(page,'Quantity / km','500');await fill(page,'Rate per km','0.55');
  await expect(page.locator('.invoice-total')).toContainText('275.00');await page.getByRole('button',{name:'Preview PDF',exact:true}).click();
  await expect(page.getByRole('button',{name:'Download PDF',exact:true})).toBeEnabled({timeout:60000});
  const download=page.waitForEvent('download',{timeout:20000});await page.getByRole('button',{name:'Download PDF',exact:true}).click();const file=await download;const path=info.outputPath('invoice.pdf');await file.saveAs(path);expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Mark issued',exact:true}).click();
  await expect(page.getByRole('button',{name:'Create revision',exact:true})).toBeVisible();
  console.log(mode.name+' invoice issued; checking backup');
  await more(page,'Records');const exported=page.waitForEvent('download',{timeout:20000});await page.getByRole('button',{name:'Download full backup',exact:true}).click();const backup=await exported;const bp=info.outputPath('month-backup.json');await backup.saveAs(bp);
  const envelope=JSON.parse(await readFile(bp,'utf8')),data=JSON.parse(envelope.payload);
  expect(data.forms.filter((f:any)=>f.status==='Signed')).toHaveLength(forms);expect(data.invoices.filter((i:any)=>i.status==='Issued')).toHaveLength(1);
  expect(Object.entries(data.days).filter(([d])=>d>=mode.start&&d<=dateAdd(mode.start,29)).reduce((sum,[,d]:any)=>sum+d.slots.filter((x:any)=>x==='work').length*15,0)).toBe(monthWork);
  expect(errors).toEqual([]);
});

test('future page screenshot: selected blocks remain planned until the clock reaches them',async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-10-13T15:38:00Z'));
  await page.goto('/');await fill(page,'Driver name','Synthetic Future Driver');await fill(page,'Licence number','TEST');
  await page.getByLabel('Driver base',{exact:true}).selectOption('NSW');await page.getByRole('button',{name:'Save driver settings',exact:true}).click();
  await fill(page,'Diary date','2026-10-15');await expect(page.getByLabel('Diary date',{exact:true})).toHaveValue('2026-10-15');
  await range(page,'00:00','09:45');await expect(page.locator('.block.work.planned')).toHaveCount(39);
  await expect(page.locator('.totals')).toContainText('Work 0h 00m');await expect(page.locator('.totals')).toContainText('Rest 0h 00m');
  await expect(page.locator('.assessment')).toContainText('Future time excluded');await expect(page.locator('.block.work.breach')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('future-page.png'),fullPage:true});
  await page.clock.setFixedTime(new Date('2026-10-14T22:45:00Z'));
  await page.getByRole('button',{name:'Refresh saved records',exact:true}).click();
  await expect(page.locator('.totals')).toContainText('Work 9h 45m');
  await expect.poll(()=>page.locator('.block.work.breach').count()).toBeGreaterThan(0);
});
