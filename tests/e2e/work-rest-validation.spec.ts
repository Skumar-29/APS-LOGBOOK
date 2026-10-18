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
