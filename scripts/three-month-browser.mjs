import {chromium,webkit} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['scripts/test-server.mjs']);
await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(data.toString().includes('Test server ready'))resolve();});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
const browserName=process.env.TEST_BROWSER || 'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({executablePath:process.env.TEST_BROWSER_PATH || undefined,headless:true,args:browserName==='webkit'?[]:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
const results=[];
async function check(value,message){if(!value)throw Error(message);}
async function more(page,item){await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:new RegExp('^'+item+' ')}).click();}
async function download(page,path){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();await(await event).saveAs(path);const pdf=await PDFDocument.load(await readFile(path));return pdf.getPageCount();}
try{
 for(const width of (process.env.TEST_WIDTHS || '440,1280').split(',').map(Number))for(const scenario of ['solo-standard','solo-bfm','two-up-standard','two-up-bfm']){
  const s=JSON.parse(await readFile('simulation-output/'+scenario+'.json','utf8')),context=await browser.newContext({viewport:{width,height:956},acceptDownloads:true}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173');
  await page.evaluate(async s=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('aps-truck-workspace-v2',2);r.onsuccess=()=>{const db=r.result,t=db.transaction('workspace','readwrite');t.objectStore('workspace').put(s,'current');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});},s);
  await page.reload();await page.getByLabel('Diary date',{exact:true}).waitFor();let daily=0;
  for(let n=0;n<30;n++){
   const date=Object.keys(s.days).sort().slice(-30)[n],work=s.days[date].slots.filter(x=>x==='work').length;
   await page.getByLabel('Diary date',{exact:true}).fill(date);try{await page.waitForFunction(({work,date})=>document.querySelector('[aria-label="Diary date"]')?.value===date&&document.querySelector('.totals')?.textContent.replace(/\s+/g,' ').includes('Work '+(work/4)+'h 00m'),{work,date});}catch(e){console.log(await page.locator('body').innerText());throw e;}
   await check(await page.locator('.block.work').count()===work,'Selected blocks mismatch '+scenario+' '+date);
   await check(await page.locator('.block.work.breach').count()===0,'False red blocks '+scenario+' '+date);
   await check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow '+date);daily++;
  }
  const date=Object.keys(s.days).sort().slice(-30).find(d=>s.days[d].slots.includes('work'));
  await page.getByLabel('Diary date',{exact:true}).fill(date);await page.getByRole('button',{name:'Time range',exact:true}).click();await page.getByLabel('From',{exact:true}).fill('14:30');await page.getByLabel('To (24:00 for midnight)',{exact:true}).fill('22:00');await page.getByRole('button',{name:'Save work',exact:true}).click();
  await page.locator('.block.work.breach').first().waitFor();await check(await page.locator('.block.rest.breach').count()===0,'Work cap incorrectly coloured rest');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.block.work.breach').length===0&&document.querySelector('.totals')?.textContent.replace(/\s+/g,' ').includes('Work 8h 00m'));
  await page.reload();await page.getByLabel('Diary date',{exact:true}).fill(date);await page.waitForFunction(()=>document.querySelector('.totals')?.textContent.replace(/\s+/g,' ').includes('Work 8h 00m'));
  await page.getByRole('button',{name:'Jump to page',exact:true}).click();await page.getByLabel('Page number',{exact:true}).fill('15');await page.getByRole('button',{name:'Go to page',exact:true}).click();await check(await page.getByLabel('Diary date',{exact:true}).inputValue()===Object.keys(s.days).sort().slice(-30)[14],'Page jump wrong');
  await mkdir('simulation-output/browser',{recursive:true});
  await more(page,'Forms');await page.locator('.form-record').first().getByRole('button',{name:'Share / PDF',exact:true}).click();
  await page.getByRole('button',{name:'Download PDF',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('dialog button')].some(b=>b.textContent==='Download PDF'&&!b.disabled));
  const formPages=await download(page,`simulation-output/browser/${scenario}-${width}-form.pdf`);await check(formPages===2,'Form PDF pages');await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await more(page,'Invoices');await page.locator('.list-button').first().click();await check((await page.locator('body').innerText()).includes('350.00'),'Invoice total not rendered');await page.getByRole('button',{name:'Preview PDF',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('dialog button')].some(b=>b.textContent==='Download PDF'&&!b.disabled));
  const invoicePages=await download(page,`simulation-output/browser/${scenario}-${width}-invoice.pdf`);await check(invoicePages>=1,'Invoice PDF empty');
  await check(errors.length===0,'Browser errors '+errors.join(';'));
  results.push({scenario,width,browser:browserName,daysViewed:daily,addedBlocksDetected:true,undoClearedBreach:true,reloadPersisted:true,pageJump:true,formPages,invoicePages,errors});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 await writeFile('simulation-output/'+browserName+'-summary.json',JSON.stringify(results,null,2));
}finally{await browser.close();server.kill();}
