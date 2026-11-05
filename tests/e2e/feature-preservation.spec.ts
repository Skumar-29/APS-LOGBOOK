import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
async function fill(p: Page, label: string, value: string) {
  await p.getByLabel(label, { exact: true }).fill(value);
  await p.getByLabel(label, { exact: true }).press("Tab");
}
async function more(p: Page, item: string) {
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: new RegExp("^" + item + " ") }).click();
}
test.beforeEach(async ({page})=>{await page.clock.setFixedTime(new Date("2026-10-11T03:00:00Z"));});
async function start(p: Page) {
  await p.goto("/");
  await fill(p, "Driver name", "Test Driver");
  await fill(p, "Licence number", "TEST123");
  await p.getByLabel("Driver base", { exact: true }).selectOption("QLD");
  await p
    .getByRole("button", { name: "Save driver settings", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "Work diary", exact: true }),
  ).toBeVisible();
}
async function noOverflow(p: Page) {
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
async function seedWorkspace(page:Page,state:any) {
 await page.evaluate(async state=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open("aps-truck-workspace-v2",2);
  req.onsuccess=()=>{const db=req.result,tx=db.transaction("workspace","readwrite"),store=tx.objectStore("workspace"),old=store.get("current");
   old.onsuccess=()=>{state.revision=old.result.revision+1;store.put(state,"current");};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);
 }),state);await page.reload();
}
test("reusable signature, all-clear answers, exact two-page PDF and fresh next-trip review", async ({
  page,
  context,
}, info) => {
  await start(page);
  await more(page, "Settings");
  await page.getByText("My reusable signature", { exact: true }).click();
  await page
    .getByRole("button", { name: "Draw my signature", exact: true })
    .click();
  await page
    .getByLabel("Draw signature", { exact: true })
    .scrollIntoViewIfNeeded();
  const box = await page
    .getByLabel("Draw signature", { exact: true })
    .boundingBox();
  if (!box) throw Error("No signature canvas");
  await page.mouse.move(box.x + 20, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 80, { steps: 10 });
  await page.mouse.move(box.x + 140, box.y + 30, { steps: 10 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Save signature", exact: true })
    .click();
  await expect(page.getByAltText("Saved driver signature")).toBeVisible();
  await more(page, "Forms");
  await page.getByRole("button", { name: "+ New form", exact: true }).click();
  await fill(page, "Location", "MEL");
  await fill(page, "Destination", "BNE");
  await fill(page, "Departure date", "2026-09-01");
  await fill(page, "Departure time", "06:00");
  await fill(page, "Estimated arrival", "2026-09-02T06:00");
  await fill(page, "Truck registration", "TEST01");
  await page
    .getByRole("button", { name: "All checked · OK", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reviewed all · all clear", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", {
        name: "Are there any vehicle faults or concerns, including windscreen cracks?",
        exact: true,
      })
      .getByRole("button", { name: "No", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("I have reviewed this form and these answers for this trip", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Apply my saved signature", exact: true })
    .click();
  await expect(
    page.getByText("Signed by Test Driver. This saved form is read only."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview / export PDF", exact: true })
    .click();
  await expect(page.locator("dialog .paper svg")).toHaveCount(2);
  expect(await page.locator("dialog .paper svg image").count()).toBeGreaterThan(
    2,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const file = await event;
  await file.saveAs(info.outputPath("safe-driving.pdf"));
  const pdf = await PDFDocument.load(
    await readFile(info.outputPath("safe-driving.pdf")),
  );
  expect(pdf.getPageCount()).toBe(2);
  const original = await PDFDocument.load(
    await readFile("public/templates/safe-driving-original-v1.pdf"),
  );
  // Preserve the actual original PDF artwork/content streams, not a redrawn approximation.
  function formStreams(resources: PDFDict): string[] {
    const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
    return objects.keys().flatMap((key) => {
      const object = objects.lookup(key, PDFRawStream);
      if (object.dict.get(PDFName.of("Subtype"))?.toString() !== "/Form")
        return [];
      const children = object.dict.lookup(PDFName.of("Resources"), PDFDict);
      return [
        Buffer.from(object.getContents()).toString("base64"),
        ...(children.has(PDFName.of("XObject")) ? formStreams(children) : []),
      ];
    });
  }
  for (const [index, pdfPage] of pdf.getPages().entries()) {
    expect(pdfPage.getSize()).toEqual(original.getPage(index).getSize());
    expect(formStreams(pdfPage.node.Resources()!)).toEqual(
      formStreams(original.getPage(index).node.Resources()!),
    );
    const resources = pdfPage.node.Resources()!;
    const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
    expect(fonts.keys().length).toBeGreaterThan(0);
    const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
    for (const key of objects.keys()) {
      const object = objects.lookup(key, PDFRawStream);
      if (object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
        expect(
          Number(object.dict.get(PDFName.of("Height"))?.toString()),
        ).toBeLessThan(500);
      }
    }
  }
  expect(
    (await readFile(info.outputPath("safe-driving.pdf")))
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");
  await page.screenshot({
    path: info.outputPath("form-preview.png"),
    fullPage: true,
  });
  await expect(page.locator('dialog [data-original-form-page="1"] text').filter({ hasText: /^Test Driver$/ })).toHaveCount(2);
  await expect(page.locator('dialog [data-original-form-page="1"] image[href^="data:image/png"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save form", exact: true }).click();
  await expect(page.locator(".form-record")).toHaveCount(1);
  await page.locator(".form-record").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Create editable revision", exact: true }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue("MEL");
  await expect(page.getByLabel("Location", { exact: true })).toBeEnabled();
  await expect(page.locator(".question button[aria-pressed=true]")).toHaveCount(36);
  await page.getByRole("button", { name: "Save form", exact: true }).click();
  await expect(page.locator(".form-record")).toHaveCount(2);
  await page.locator(".form-record").first().getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete form", exact: true }).click();
  await expect(page.locator(".form-record")).toHaveCount(1);
  await page.locator(".form-record-open").click();
  await page
    .getByRole("button", { name: "New trip from this form", exact: true })
    .click();
  await expect(
    page.getByLabel(
      "I have reviewed this form and these answers for this trip",
      { exact: true },
    ),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Apply my saved signature", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".question button[aria-pressed=true]")).toHaveCount(
    0,
  );
  await noOverflow(page);
});

test("encrypted notes contain no plaintext in a backup and unlock after reload", async ({
  page,
}, info) => {
  await start(page);
  await more(page, "Notes");
  await page.getByRole("button", { name: "+ New note", exact: true }).click();
  await fill(page, "Title", "Private depot");
  await fill(page, "Note", "SECRET-CODE-98765");
  await page
    .getByLabel("Encrypt note contents with a passphrase", { exact: true })
    .check();
  await fill(
    page,
    "Note passphrase (at least 12 characters)",
    "synthetic-note-password",
  );
  await page.getByRole("button", { name: "Save & lock", exact: true }).click();
  await expect(
    page.getByText("Encrypted contents", { exact: true }),
  ).toBeVisible();
  await more(page, "Records");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const file = await event;
  await file.saveAs(info.outputPath("encrypted-note-backup.json"));
  const text = await readFile(
    info.outputPath("encrypted-note-backup.json"),
    "utf8",
  );
  expect(text).not.toContain("SECRET-CODE-98765");
  await page.reload();
  await more(page, "Notes");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await fill(page, "Note passphrase", "synthetic-note-password");
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    "SECRET-CODE-98765",
  );
});


test("save failure is visible and cannot replace the previous saved record", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "00:00 work", exact: true }).click();
  await expect(page.locator(".totals")).toContainText("Work 0h 15m");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Simulated storage full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "00:15 work", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(page.locator(".totals")).toContainText("Work 0h 15m");
  await expect(
    page.getByRole("button", { name: "00:15 work", exact: true }),
  ).toBeVisible();
});


test("documents open offline and a full backup restores the actual file", async ({
  page,
  context,
}, info) => {
  await start(page);
  await more(page, "Documents");
  // A valid tiny PNG exercises the browser preview, storage and byte-for-byte backup.
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Add document", { exact: true }).setInputFiles({
    name: "Certificate.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await fill(page, "Document name", "My BFM certificate");
  await page
    .getByLabel("Document type", { exact: true })
    .selectOption("BFM certificate");
  await fill(page, "Expiry date (optional)", "2027-12-31");
  await page.getByLabel("Pin for quick access").check();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByText("Expires 31/12/2027")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await more(page, "Documents");
  await page
    .getByRole("button", { name: "Show document", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByAltText("My BFM certificate"),
  ).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .getByAltText("My BFM certificate")
      .evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBe(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await more(page, "Records");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const download = await event;
  await download.saveAs(info.outputPath("documents-backup.json"));
  const backup = await readFile(
      info.outputPath("documents-backup.json"),
      "utf8",
    ),
    payload = JSON.parse(JSON.parse(backup).payload);
  expect(
    Buffer.from(payload.documents[0].data.split(",")[1], "base64"),
  ).toEqual(bytes);
  await more(page, "Documents");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await more(page, "Records");
  await page.getByLabel("Restore backup", { exact: true }).setInputFiles({
    name: "documents.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page.getByRole("button", { name: "Merge backup", exact: true }).click();
  await expect(page.getByText("Backup imported successfully.")).toBeVisible();
  await more(page, "Documents");
  await page
    .getByRole("button", { name: "Show document", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByAltText("My BFM certificate"),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("documents.png") });
});


test("sign now works without a saved signature and can save it for future trips", async ({
  page,
}) => {
  await start(page);
  await more(page, "Forms");
  await page.getByRole("button", { name: "+ New form", exact: true }).click();
  await fill(page, "Location", "MEL");
  await fill(page, "Destination", "BNE");
  await fill(page, "Departure date", "2026-10-08");
  await fill(page, "Departure time", "17:00");
  await fill(page, "Estimated arrival", "2026-10-09T18:00");
  await fill(page, "Truck registration", "TEST01");
  await page
    .getByRole("button", { name: "All checked · OK", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reviewed all · all clear", exact: true })
    .click();
  await page
    .getByLabel("I have reviewed this form and these answers for this trip", {
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("button", { name: "Apply my saved signature", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign now", exact: true }).click();
  await page
    .getByLabel("Draw signature", { exact: true })
    .scrollIntoViewIfNeeded();
  const box = await page
    .getByLabel("Draw signature", { exact: true })
    .boundingBox();
  if (!box) throw Error("No signature canvas");
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 65, { steps: 12 });
  await page.mouse.up();
  await page
    .getByLabel("Save this signature for future forms", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Sign this form", exact: true })
    .click();
  await expect(
    page.getByText("Signed by Test Driver. This saved form is read only."),
  ).toBeVisible();
  await more(page, "Settings");
  await page.getByText("My reusable signature", { exact: true }).click();
  await expect(page.getByAltText("Saved driver signature")).toBeVisible();
});


test("invoice tables retain defaults and fixed changeover calculations", async ({
  page,
}, info) => {
  await start(page);
  await more(page, "Invoices");
  await page
    .getByRole("button", { name: "+ New invoice", exact: true })
    .click();
  await fill(page, "Bill to", "Repeat Customer");
  await fill(page, "BSB", "123456");
  await fill(page, "Account number", "12345678");
  await page
    .getByRole("button", { name: "Save as defaults", exact: true })
    .click();
  await expect(page.getByLabel("Bill to", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "‹ Invoices", exact: true }).click();
  await page
    .getByRole("button", { name: "+ New invoice", exact: true })
    .click();
  await expect(page.getByLabel("Bill to", { exact: true })).not.toBeVisible();
  await page
    .getByText("Business, customer & bank details", { exact: true })
    .click();
  await expect(page.getByLabel("Bill to", { exact: true })).toHaveValue(
    "Repeat Customer",
  );
  await expect(page.getByLabel("BSB", { exact: true })).toHaveValue("123456");
  await page
    .getByText("Business, customer & bank details", { exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add load", exact: true }).click();
  const load = page.getByRole("row", { name: "Load 1", exact: true });
  await load.getByLabel("Load date", { exact: true }).fill("2026-10-08");
  await load.getByLabel("From", { exact: true }).fill("MEL");
  await load.getByLabel("To", { exact: true }).fill("BNE");
  await load.getByLabel("BD / RT / BT / AB / C/O", { exact: true }).fill("C/O");
  await load.getByLabel("Fixed amount", { exact: true }).fill("450");
  await expect(page.locator(".invoice-total")).toContainText("450.00");
  await page.getByText("Miscellaneous · 0 rows", { exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add miscellaneous", exact: true })
    .click();
  const misc = page.getByRole("row", { name: "Miscellaneous 1", exact: true });
  await misc.getByLabel("Date", { exact: true }).fill("2026-10-08");
  await misc.getByLabel("Item", { exact: true }).fill("Wait time");
  await misc.getByLabel("Quantity", { exact: true }).fill("2");
  await misc.getByLabel("Rate", { exact: true }).fill("30");
  await expect(page.locator(".invoice-total")).toContainText("510.00");
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("invoice-tables.png"),
    fullPage: true,
  });
});


test("form defaults, explicit save, list sharing, edit and confirmed deletion persist", async ({ page }, info) => {
  await start(page); await more(page, "Forms");
  await page.getByRole("button", { name: "Form defaults", exact: true }).click();
  await fill(page, "Default company name", "Test Transport");
  await fill(page, "Default contact number", "0400000000");
  await page.getByLabel("Show company name by default", { exact: true }).check();
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByAltText("Default company logo")).toBeVisible();
  await page.getByRole("button", { name: "Save defaults", exact: true }).click();
  await page.getByRole("button", { name: "+ New form", exact: true }).click();
  await fill(page, "Destination", "Brisbane"); await fill(page, "Truck registration", "TRUCK7");
  await page.getByText("Driver, trailers & load", { exact: true }).click();
  await expect(page.getByLabel("Contact", { exact: true })).toHaveValue("0400000000");
  await page.getByText("Company name & logo (this form)", { exact: true }).click();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Test Transport");
  await expect(page.getByAltText("Company logo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save form", exact: true }).click();
  await expect(page.locator(".form-record")).toHaveCount(1);
  await page.reload(); await more(page, "Forms");
  await expect(page.locator(".form-record")).toContainText("TRUCK7");
  await page.getByRole("button", { name: "Form defaults", exact: true }).click();
  await expect(page.getByLabel("Default company name", { exact: true })).toHaveValue("Test Transport");
  await fill(page, "Default company name", "Next Company");
  await page.getByRole("button", { name: "Save defaults", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Company name & logo (this form)", { exact: true }).click();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Test Transport");
  await fill(page, "Destination", "Sydney");
  await page.getByRole("button", { name: "Save form", exact: true }).click();
  await expect(page.locator(".form-record")).toContainText("Sydney");
  await page.getByRole("button", { name: "Share / PDF", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share PDF", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async ({files}: {files: File[]}) => {
      (window as any).sharedPdf = { name: files[0].name, type: files[0].type, size: files[0].size, active: navigator.userActivation.isActive };
    }});
  });
  await page.getByRole("button", { name: "Share PDF", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sharedPdf)).toMatchObject({ type: "application/pdf", active: true });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({path: info.outputPath("form-actions.png"), fullPage: true});
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".form-record")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete form", exact: true }).click();
  await page.reload(); await more(page, "Forms");
  await expect(page.locator(".form-record")).toHaveCount(0);
  await page.getByRole("button", { name: "+ New form", exact: true }).click();
  await page.getByText("Company name & logo (this form)", { exact: true }).click();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Next Company");
});



test("two-up rest suggestions remain correctable and preserve separate factual intervals",async({page},info)=>{
  await start(page);const {emptyState}=await import("../../src/domain/model");
  const s=emptyState();s.onboarded=true;Object.assign(s.profile,{name:"Synthetic Two-up",licence:"TEST",base:"QLD",zone:"Australia/Brisbane",twoUp:true,coDriver:"Test co-driver"});
  await seedWorkspace(page,s);await page.getByRole("button",{name:"Driving",exact:true}).click();
  await expect(page.getByLabel("Rest type",{exact:true})).toHaveValue("unknown");
  await page.getByRole("button",{name:"Start rest",exact:true}).click();
  await page.clock.setFixedTime(new Date("2026-10-11T03:20:00Z"));
  await page.getByLabel("Rest type",{exact:true}).selectOption("sleeper-moving");
  await page.getByRole("button",{name:"Change rest",exact:true}).click();
  await more(page,"Records");
  const exported=page.waitForEvent("download");await page.getByRole("button",{name:"Download full backup",exact:true}).click();
  const file=await exported;await file.saveAs(info.outputPath("rest-facts.json"));
  const state=JSON.parse(JSON.parse(await readFile(info.outputPath("rest-facts.json"),"utf8")).payload);
  expect(state.activities.at(-1)).toMatchObject({kind:"rest",restType:"unknown"});
  expect(state.timer).toMatchObject({kind:"rest",restType:"sleeper-moving"});
});
