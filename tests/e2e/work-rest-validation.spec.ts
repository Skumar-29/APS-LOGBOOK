import { test, expect, type Page } from '@playwright/test';
import { emptyState, ensureDay } from '../../src/domain/model';
import { editRange } from '../../src/domain/diary';

async function onboard(page: Page) {
  await page.goto('/');
  await page.getByLabel('Driver name', { exact: true }).fill('Synthetic Test Driver');
  await page.getByLabel('Licence number', { exact: true }).fill('TEST');
  await page.getByLabel('Driver base', { exact: true }).selectOption('QLD');
  await page.getByRole('button', { name: 'Save driver settings', exact: true }).click();
}
async function chooseDate(page: Page, value: string) {
  const field = page.getByLabel('Diary date', { exact: true });
  await field.fill(value);
  await field.press('Tab');
}
async function seed(page: Page, state: ReturnType<typeof emptyState>) {
  await page.evaluate(async (workspace) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('aps-truck-workspace-v2', 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        const store = tx.objectStore('workspace');
        const old = store.get('current');
        old.onsuccess = () => {
          workspace.revision = old.result.revision + 1;
          store.put(workspace, 'current');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, state);
  await page.reload();
}

test('work-rest validation: selection toggles from rest to work to rest and persists', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T10:00:00Z'));
  await onboard(page);
  await chooseDate(page, '2026-10-11');
  const cell = page.locator('.swipe-block[data-slot="0"]');
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[aria-label="Planned page totals"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Shift plan"]')).toHaveCount(0);
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('.swipe-block[data-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.swipe-block[data-slot="0"]').click();
  await expect(page.locator('.swipe-block[data-slot="0"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.swipe-block[data-slot="0"]')).toHaveAttribute('aria-pressed', 'false');
});

test('work-rest validation: elapsed breaches appear solid red and no future forecast is shown', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T01:00:00Z'));
  await onboard(page);
  const s = emptyState();
  s.onboarded = true;
  s.settings.autoPages = false;
  Object.assign(s.profile, {name: 'Synthetic Test Driver', licence: 'TEST', scheme: 'Standard', base: 'QLD', zone: 'Australia/Brisbane'});
  ensureDay(s, '2026-10-10');
  editRange(s, '2026-10-11', 0, 96, 'work');
  for (const slot of [21, 31, 42, 43, 65, 74, 86, 87]) editRange(s, '2026-10-11', slot, slot + 1, 'rest');
  await seed(page, s);
  await chooseDate(page, '2026-10-11');
  const breach = page.locator('.swipe-block.work.breach').first();
  await expect(breach).toBeVisible({timeout:30000});
  await expect(breach).toHaveCSS('background-color', 'rgb(198, 40, 40)');
  await expect(page.locator('[aria-label="Planned page totals"]')).toHaveCount(0);
  await expect(page.locator('.window-summary > summary')).not.toContainText('Planned');
});


test('past, current and future blocks are editable without time locking', async ({ page }) => {
  // 00:20 UTC = 10:20 in the driver's Queensland base on 11 October.
  await page.clock.setFixedTime(new Date('2026-10-11T00:20:00Z'));
  await onboard(page);
  const slot = (index: number) => page.locator(`.swipe-block[data-slot="${index}"]`);

  await chooseDate(page, '2026-10-11');
  await expect(slot(42)).toBeEnabled(); // 10:30 has not occurred yet.
  await slot(42).click();
  await expect(slot(42)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(slot(42)).toHaveAttribute('aria-pressed', 'true');
  await slot(42).click();
  await expect(slot(42)).toHaveAttribute('aria-pressed', 'false');

  // A swipe can cross the current-clock boundary and is saved as requested.
  const start = await slot(40).boundingBox();
  const end = await slot(45).boundingBox();
  if (!start || !end) throw Error('The diary blocks are not visible');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();
  for (const i of [40, 41, 42, 43, 44, 45]) {
    await expect(slot(i)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.reload();
  await expect(slot(45)).toHaveAttribute('aria-pressed', 'true');

  // Tomorrow is editable too, with normal work/rest toggle and persistence.
  await chooseDate(page, '2026-10-12');
  await expect(slot(0)).toBeEnabled();
  await slot(0).click();
  await expect(slot(0)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  // Reload restores the current diary date; navigate back to the saved future date.
  await chooseDate(page, '2026-10-12');
  await expect(slot(0)).toHaveAttribute('aria-pressed', 'true');
  await slot(0).click();
  await expect(slot(0)).toHaveAttribute('aria-pressed', 'false');

  // A historical entry is still editable.
  await chooseDate(page, '2026-10-10');
  await expect(slot(90)).toBeEnabled();
  await slot(90).click();
  await expect(slot(90)).toHaveAttribute('aria-pressed', 'true');
});


test('mixed earlier and later selections retain red breaches, without locking future cells', async ({ page }) => {
  // Reproduces the two consecutive NSW Standard pages in the supplied screenshots.
  await page.clock.setFixedTime(new Date('2026-10-18T23:15:00Z')); // NSW 19 Oct, 10:15 AEDT
  await onboard(page);
  const s=emptyState();
  s.onboarded=true;
  s.settings.autoPages=false;
  Object.assign(s.profile, {
    name:'Synthetic Test Driver', licence:'TEST', scheme:'Standard',
    base:'NSW', zone:'Australia/Sydney'
  });
  ensureDay(s,'2026-10-17');
  editRange(s,'2026-10-18',0,52,'work');
  for (const i of [21,31,42,43]) editRange(s,'2026-10-18',i,i+1,'rest');
  editRange(s,'2026-10-19',0,90,'work');
  for (const i of [21,31]) editRange(s,'2026-10-19',i,i+1,'rest');
  await seed(page,s);

  await chooseDate(page,'2026-10-19');
  await expect(page.locator('.swipe-block[data-slot="80"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[aria-label="Page totals"]')).toContainText('22h 00m');
  await expect(page.locator('[aria-label="Page totals"]')).toContainText('2h 00m');
  await expect(page.getByText('Counted through 20/10/2026 00:00')).toBeVisible();
  const breach=page.locator('.swipe-block.work.breach').first();
  await expect(breach).toBeVisible({timeout:30000});
  await expect(breach).toHaveCSS('background-color','rgb(198, 40, 40)');
  await expect(page.locator('.swipe-block[data-slot="80"]')).toBeEnabled();

  await page.reload();
  await expect(page.locator('.swipe-block.work.breach').first()).toBeVisible({timeout:30000});
  await expect(page.locator('.swipe-block[data-slot="80"]')).toHaveAttribute('aria-pressed','true');

  await chooseDate(page,'2026-10-18');
  await expect(page.locator('[aria-label="Page totals"]')).toContainText('12h 00m');
  await expect(page.locator('[aria-label="Page totals"]')).toContainText('12h 00m');
});

test('settings effective date reapplies BFM to a previously saved Standard day without erasing blocks',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-19T01:00:00Z'));
  await onboard(page);
  const s=emptyState();
  s.onboarded=true;s.settings.autoPages=false;
  Object.assign(s.profile,{name:'Old Driver',licence:'OLD',base:'NSW',zone:'Australia/Sydney',scheme:'Standard',effectiveFrom:'2026-10-01'});
  ensureDay(s,'2026-10-18');
  editRange(s,'2026-10-18',0,4,'work');
  ensureDay(s,'2026-10-19');
  editRange(s,'2026-10-19',0,52,'work');
  await seed(page,s);
  await chooseDate(page,'2026-10-19');
  await expect(page.locator('.date-nav')).toContainText('NSW · Standard');
  await expect(page.locator('.swipe-block.work')).toHaveCount(52);

  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:/Settings Driver, vehicles/}).click();
  await page.getByLabel('Driver name',{exact:true}).fill('Updated Driver');
  await page.getByLabel('Licence number',{exact:true}).fill('NEW');
  await page.getByLabel('Effective from',{exact:true}).fill('2026-10-19');
  await page.getByLabel('Driver base',{exact:true}).selectOption('QLD');
  await page.getByLabel('Usual hours option',{exact:true}).selectOption('BFM');
  await page.getByLabel('Accreditation / certificate',{exact:true}).fill('BFM-TEST');
  await page.getByLabel('Certificate expiry',{exact:true}).fill('2027-12-31');
  await page.getByRole('button',{name:'Save driver settings',exact:true}).click();

  await expect(page.locator('.date-nav')).toContainText('QLD · BFM');
  await expect(page.locator('.base-clock')).toContainText('QLD base time');
  await expect(page.locator('.swipe-block.work')).toHaveCount(52);
  await expect(page.locator('.assessment')).toContainText('QLD time');

  await page.reload();
  await chooseDate(page,'2026-10-19');
  await expect(page.locator('.date-nav')).toContainText('QLD · BFM');
  await expect(page.locator('.swipe-block.work')).toHaveCount(52);
  await chooseDate(page,'2026-10-18');
  await expect(page.locator('.date-nav')).toContainText('NSW · Standard');
  await expect(page.locator('.swipe-block.work')).toHaveCount(4);
});

test('failed page allocation without a book does not trap navigation or block later edits',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-19T01:00:00Z'));
  await onboard(page);
  await chooseDate(page,'2026-10-20');
  await page.getByRole('button',{name:'Allocate page',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Paper page'})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Paper page'}).getByRole('button',{name:'Allocate',exact:true})).toBeDisabled();
  await expect(page.getByRole('dialog',{name:'Paper page'})).toContainText('No open book covers this date');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:/Records Books, backup/}).click();
  await expect(page.getByRole('heading',{name:'Diary books'})).toBeVisible();
  await page.getByRole('button',{name:'+ Book'}).click();
  await page.getByLabel('Book number').fill('TEST-BOOK');
  await page.getByLabel('First page number').fill('23');
  await page.getByLabel('First date').fill('2026-10-19');
  await page.getByRole('button',{name:'Save book'}).click();
  await expect(page.getByText('TEST-BOOK')).toBeVisible();
  await page.getByRole('button',{name:'Diary',exact:true}).click();
  await chooseDate(page,'2026-10-20');
  await page.getByRole('button',{name:'Allocate page',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Paper page'}).getByRole('button',{name:'Allocate',exact:true})).toBeEnabled();
  await page.getByRole('dialog',{name:'Paper page'}).getByLabel('Book').selectOption({label:'TEST-BOOK'});
  await page.getByRole('dialog',{name:'Paper page'}).getByLabel('Page number (blank = next unused)').fill('23');
  await page.getByRole('dialog',{name:'Paper page'}).getByRole('button',{name:'Allocate',exact:true}).click();
  await expect(page.locator('.date-nav')).toContainText('Page 23');
});
