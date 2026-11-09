import { test, expect } from '@playwright/test';
import { emptyState, ensureDay } from '../../src/domain/model';
test('release review: clear test diary requires confirmation, preserves settings and survives reload', async ({page}) => {
 await page.goto('/');
 await page.getByLabel('Driver name',{exact:true}).fill('Clear Test Driver');
 await page.getByLabel('Licence number',{exact:true}).fill('TEST');
 await page.getByRole('button',{name:'Save driver settings',exact:true}).click();
 await expect(page.locator('.swipe-block').first()).toBeVisible();
 const workspace=emptyState(); workspace.onboarded=true; workspace.settings.autoPages=false;
 workspace.profile.name='Clear Test Driver'; workspace.profile.licence='TEST';
 for(let i=1;i<=45;i++){const date=new Date(Date.UTC(2026,9,i)).toISOString().slice(0,10);ensureDay(workspace,date).slots[0]='work';}
 await page.evaluate(async(workspace)=>{
  await new Promise<void>((resolve,reject)=>{
   const req=indexedDB.open('aps-truck-workspace-v2',2);
   req.onsuccess=()=>{const db=req.result, tx=db.transaction('workspace','readwrite'), st=tx.objectStore('workspace'), r=st.get('current');
    r.onsuccess=()=>{workspace.revision=r.result.revision+1;st.put(workspace,'current');};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  });
 },workspace);
 await page.reload();
 await page.getByRole('button',{name:'More',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByText('Clear test diary',{exact:true}).click();
 await page.getByRole('button',{name:'Clear test diary…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Clear all test diary entries?'});
 const confirm=dialog.getByRole('button',{name:'Clear all diary entries',exact:true});
 await expect(confirm).toBeDisabled();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Clear test diary…',exact:true}).click();
 await dialog.getByLabel('Type CLEAR to confirm').fill('CLEAR');
 await confirm.click(); await expect(dialog).not.toBeVisible();
 await expect(page.getByText('Test diary cleared. A recovery copy is available in Records.')).toBeVisible();
 await page.reload();
 const state=await page.evaluate(async()=>new Promise<any>((resolve)=>{
  const r=indexedDB.open('aps-truck-workspace-v2',2);r.onsuccess=()=>{const db=r.result,t=db.transaction(['workspace','recovery']),a=t.objectStore('workspace').get('current'),b=t.objectStore('recovery').get('previous');t.oncomplete=()=>{resolve({s:a.result,old:b.result});db.close();};};
 }));
 expect(Object.values(state.s.days).every((d:any)=>!d.slots.includes('work'))).toBe(true);
 expect(Object.keys(state.old.days).length).toBeGreaterThanOrEqual(45);
 expect(Object.values(state.old.days).some((d:any)=>d.slots.includes('work'))).toBe(true);
 expect(state.s.profile.name).toBe('Clear Test Driver');
 expect(state.s.pages).toEqual([]); expect(state.s.activities).toEqual([]);
});
