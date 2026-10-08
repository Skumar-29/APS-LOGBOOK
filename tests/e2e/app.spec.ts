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
const oldDiary = {
  profile: {
    driverName: "Imported Driver",
    licenceNumber: "OLD123",
    baseTimeZone: "QLD",
  },
  scheme: "Standard",
  restAsStationary: true,
  selectedDate: "2026-09-03",
  slotsCompact: {
    "2026-09-01": "0".repeat(24) + "1".repeat(16) + "0".repeat(56),
    "2026-09-03": "1".repeat(8) + "0".repeat(88),
  },
  dayDetails: {
    "2026-09-01": {
      pageNo: "56",
      workDiaryNo: "TESTBOOK",
      numberPlate: "TEST01",
      changeRows: [
        { time: "06:00", location: "Laverton North", odometer: "1000" },
        { time: "10:00", location: "Rocklea", odometer: "2710" },
      ],
    },
    "2026-09-03": {
      pageNo: "87",
      workDiaryNo: "TESTBOOK",
      numberPlate: "TEST01",
    },
  },
  diaryBooks: [
    {
      diaryNo: "TESTBOOK",
      startDate: "2026-09-01",
      firstPageNumber: "56",
      status: "active",
    },
  ],
};
test("first use, work/rest blocks, persisted location and offline reload", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const grid = await page.locator(".diary-grid-section").first().boundingBox();
  expect(grid?.width).toBeLessThanOrEqual(430);
  const slot = await page.locator('[data-slot="0"][data-row="work"]').boundingBox();
  expect(slot?.width).toBeLessThanOrEqual(16.1);
  await page.getByRole("button", { name: "Time range", exact: true }).click();
  await fill(page, "From", "06:00");
  await fill(page, "To (24:00 for midnight)", "12:00");
  await page.getByRole("button", { name: "Save work", exact: true }).click();
  await expect(page.locator(".totals")).toContainText("6h 00m");
  await page.getByRole("button", { name: "06–12", exact: true }).click();
  await expect(page.locator(".block.work")).toHaveCount(24);
  await page
    .locator(".change-table tr")
    .filter({
      has: page.getByRole("rowheader", { name: "06:00", exact: true }),
    })
    .getByLabel("Location", { exact: true })
    .fill("Laverton North");
  await page
    .locator(".change-table tr")
    .filter({
      has: page.getByRole("rowheader", { name: "06:00", exact: true }),
    })
    .getByLabel("Odometer", { exact: true })
    .fill("1000");
  await page.getByRole("button", { name: "Time range", exact: true }).click();
  await fill(page, "From", "12:00");
  await fill(page, "To (24:00 for midnight)", "13:00");
  await page.getByRole("button", { name: "Save rest", exact: true }).click();
  await expect(page.locator(".totals")).toContainText("Rest 1h 00m");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("diary.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".totals")).toContainText("6h 00m");
  await page.getByRole("button", { name: "06–12", exact: true }).click();
  await expect(
    page.getByLabel("Location", { exact: true }).first(),
  ).toHaveValue("Laverton North");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Work diary", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".totals")).toContainText("6h 00m");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator(".paper svg")).toBeVisible();
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Statistics", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test("restores legacy diary, jumps to exact page, imports a trip and downloads PDF", async ({
  page,
}, info) => {
  await start(page);
  await more(page, "Records");
  await page.getByLabel("Restore backup", { exact: true }).setInputFiles({
    name: "diary.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(oldDiary)),
  });
  await page.getByRole("button", { name: "Merge backup", exact: true }).click();
  await expect(page.getByText("Backup imported successfully.")).toBeVisible();
  await page.getByRole("button", { name: "Diary", exact: true }).click();
  await page.getByRole("button", { name: "Jump to page", exact: true }).click();
  await fill(page, "Page number", "87");
  await page.getByRole("button", { name: "Go to page", exact: true }).click();
  await expect(page.getByLabel("Diary date", { exact: true })).toHaveValue(
    "2026-09-03",
  );
  await page.getByRole("button", { name: "Jump to page", exact: true }).click();
  await fill(page, "Page number", "56");
  await page.getByRole("button", { name: "Go to page", exact: true }).click();
  await expect(page.getByLabel("Diary date", { exact: true })).toHaveValue(
    "2026-09-01",
  );
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview / export PDF", exact: true })
    .click();
  let event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  let file = await event;
  await file.saveAs(info.outputPath("diary.pdf"));
  expect(
    (await readFile(info.outputPath("diary.pdf"))).subarray(0, 4).toString(),
  ).toBe("%PDF");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await more(page, "Invoices");
  await page
    .getByRole("button", { name: "+ New invoice", exact: true })
    .click();
  await fill(page, "Bill to", "Test Transport");
  await fill(page, "Date from", "2026-09-01");
  await fill(page, "Date to", "2026-09-03");
  await page.getByRole("button", { name: "+ From diary", exact: true }).click();
  await page
    .getByLabel("Start change", { exact: true })
    .selectOption("2026-09-01:24");
  await page
    .getByLabel("Finish change", { exact: true })
    .selectOption("2026-09-01:40");
  await page
    .getByRole("button", { name: "Add trip for review", exact: true })
    .click();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("MEL");
  await expect(page.getByLabel("To", { exact: true })).toHaveValue("BNE");
  await expect(page.getByLabel("Quantity / km", { exact: true })).toHaveValue(
    "1710",
  );
  await fill(page, "BD / RT / BT / AB / C/O", "BD");
  await fill(page, "Rate per km", "0.55");
  await expect(page.locator(".invoice-total")).toContainText("940.50");
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect(page.locator("dialog .paper svg")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("invoice-preview.png"),
    fullPage: true,
  });
  event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  file = await event;
  await file.saveAs(info.outputPath("invoice.pdf"));
  expect(
    (await readFile(info.outputPath("invoice.pdf"))).subarray(0, 4).toString(),
  ).toBe("%PDF");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const excelEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const workbook = await excelEvent;
  await workbook.saveAs(info.outputPath("invoice.xlsx"));
  expect(
    (await readFile(info.outputPath("invoice.xlsx"))).subarray(0, 2).toString(),
  ).toBe("PK");
  await page.getByRole("button", { name: "Mark issued", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create revision", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});
test("reusable signature, all-clear answers, exact two-page PDF and fresh next-trip review", async ({
  page, context,
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
  const pdf = await PDFDocument.load(await readFile(info.outputPath("safe-driving.pdf")));
  expect(pdf.getPageCount()).toBe(2);
  const original = await PDFDocument.load(await readFile("public/templates/safe-driving-original-v1.pdf"));
  // Preserve the actual original PDF artwork/content streams, not a redrawn approximation.
  function formStreams(resources: PDFDict): string[] {
    const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
    return objects.keys().flatMap(key => {
      const object = objects.lookup(key, PDFRawStream);
      if (object.dict.get(PDFName.of("Subtype"))?.toString() !== "/Form") return [];
      const children = object.dict.lookup(PDFName.of("Resources"), PDFDict);
      return [Buffer.from(object.getContents()).toString("base64"),
        ...(children.has(PDFName.of("XObject")) ? formStreams(children) : [])];
    });
  }
  for (const [index, pdfPage] of pdf.getPages().entries()) {
    expect(pdfPage.getSize()).toEqual(original.getPage(index).getSize());
    expect(formStreams(pdfPage.node.Resources()!)).toEqual(formStreams(original.getPage(index).node.Resources()!));
    const resources = pdfPage.node.Resources()!;
    const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
    expect(fonts.keys().length).toBeGreaterThan(0);
    const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
    for (const key of objects.keys()) {
      const object = objects.lookup(key, PDFRawStream);
      if (object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
        expect(Number(object.dict.get(PDFName.of("Height"))?.toString())).toBeLessThan(500);
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
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
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
test("table notes, backup download and active timer survive reload", async ({
  page,
}, info) => {
  await start(page);
  await more(page, "Notes");
  await page.getByRole("button", { name: "+ New note", exact: true }).click();
  await fill(page, "Title", "Depot access");
  await fill(page, "Note", "Warehouse entrance");
  await page.getByRole("button", { name: "+ Row", exact: true }).click();
  await fill(page, "Row 1, item", "Test depot");
  await fill(page, "Row 1, detail 1", "1234");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("1234", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(page.getByText("1234", { exact: true })).toBeVisible();
  await more(page, "Records");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const file = await event;
  await file.saveAs(info.outputPath("backup.json"));
  const saved = JSON.parse(
    await readFile(info.outputPath("backup.json"), "utf8"),
  );
  expect(JSON.parse(saved.payload).notes[0].rows[0][1]).toBe("1234");
  await page.getByRole("button", { name: "Driving", exact: true }).click();
  await fill(page, "Truck registration", "TEST01");
  await page.getByRole("button", { name: "Start work", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Working", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Driving", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Working", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start rest", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resting", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start work", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});

test("drag selection, Undo, full-rest action and narrow screen layout", async ({
  page,
}, info) => {
  await start(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
  const first = page.locator('[data-slot="0"][data-row="work"]'),
    last = page.locator('[data-slot="3"][data-row="work"]');
  await first.scrollIntoViewIfNeeded();
  const a = await first.boundingBox(),
    b = await last.boundingBox();
  if (!a || !b) throw Error("Blocks unavailable");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".totals")).toContainText("Work 1h 00m");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".totals")).toContainText("Work 0h 00m");
  await page.getByRole("button", { name: "Time range", exact: true }).click();
  await page
    .getByRole("button", { name: "Full day · stationary rest", exact: true })
    .click();
  await expect(page.locator(".totals")).toContainText("Rest 24h 00m");
  await expect(page.getByLabel("Rest", { exact: true })).toHaveValue(
    "stationary",
  );
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("narrow-320.png"),
    fullPage: true,
  });
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

test("GitHub repository subpath has its own working offline scope", async ({
  page,
  context,
}) => {
  await page.goto("/Work-Diary/");
  await expect(page.getByLabel("Driver name", { exact: true })).toBeVisible();
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toContain("/Work-Diary/");
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Welcome to Truck Workspace",
      exact: true,
    }),
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
  await page
    .getByLabel("Add document", { exact: true })
    .setInputFiles({
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
  await page
    .getByLabel("Restore backup", { exact: true })
    .setInputFiles({
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

test("state clock and red diary blocks stay clear on a narrow screen", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-07T14:30:00Z"));
  await start(page);
  await expect(page.locator(".base-clock")).toContainText("08/10/2026 · 00:30");
  await page.getByRole("button", { name: "Time range", exact: true }).click();
  await fill(page, "From", "00:00");
  await fill(page, "To (24:00 for midnight)", "05:30");
  await page.getByRole("button", { name: "Save work", exact: true }).click();
  await expect(page.locator(".block.breach")).toHaveCount(1);
  await expect(page.locator(".window-summary")).toContainText("Work 5h 30m");
  await page.locator(".block.breach").click();
  await expect(page.getByRole("dialog")).toContainText("5h 15m");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("red-blocks.png"),
    fullPage: true,
  });
  await more(page, "Settings");
  await page.getByLabel("Driver base", { exact: true }).selectOption("WA");
  await page
    .getByRole("button", { name: "Save driver settings", exact: true })
    .click();
  await expect(page.locator(".base-clock")).toContainText("07/10/2026 · 22:30");
  await expect(page.locator(".window-summary")).toContainText("QLD time");
});

test("compact sticky header, immediate colour modes, settings return and safe touch scrolling", async ({ page, context }, info) => {
  await start(page);
  await page.setViewportSize({width:390,height:740});
  const first=page.locator('[data-slot="0"][data-row="work"]');
  const box=await first.boundingBox();
  expect(box!.y).toBeLessThan(240);
  await expect(page.locator('.base-clock')).toContainText(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.getByRole('button',{name:'Night mode',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:info.outputPath('compact-night.png'),fullPage:false});
  await page.getByRole('button',{name:'Appearance',exact:true}).click();
  await page.getByRole('button',{name:'Day mode',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:info.outputPath('compact-day.png'),fullPage:false});
  const before=await page.locator('.totals').textContent();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  // A real browser touch scroll beginning on a block must never write diary slots.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+box!.width/2,y:box!.y+22}]});
  for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box!.x+box!.width/2+2,y:box!.y+22-i*23}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(40);
  expect(await page.locator('.totals').textContent()).toBe(before);
  expect((await page.locator('.workspace-header').boundingBox())!.y).toBe(0);
  // Horizontal touch movement still records a range, and Undo restores it.
  await page.evaluate(()=>window.scrollTo(0,0));
  const a=(await first.boundingBox())!, b=(await page.locator('[data-slot="3"][data-row="work"]').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+20}]});
  for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width/2+(b.x-a.x)*i/6,y:a.y+20}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.totals')).toContainText('Work 1h 00m');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.totals')).toContainText('Work 0h 00m');
  await page.getByRole('button',{name:'Refresh saved records',exact:true}).click();
  await expect(page.locator('.totals')).toContainText('Work 0h 00m');
  await page.evaluate(()=>window.scrollTo(0,280));
  const diaryScroll=await page.evaluate(()=>window.scrollY);
  await more(page,'Settings');
  await fill(page,'Driver name','Updated Driver');
  await page.getByRole('button',{name:'Save driver settings',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Work diary',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(diaryScroll);
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await more(page,'Settings');
  await expect(page.getByLabel('Driver name',{exact:true})).toHaveValue('Updated Driver');
  await page.setViewportSize({width:320,height:700});
  await page.getByRole('button',{name:'Diary',exact:true}).click();
  await noOverflow(page);
  await page.screenshot({path:info.outputPath('compact-320.png'),fullPage:false});
});
