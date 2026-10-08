import { describe, it, expect, beforeEach } from "vitest";
import { emptyState, ensureDay, clone, uid } from "../src/domain/model";
import {
  dateAdd,
  instantFor,
  clockChange,
  civil,
  totals,
  parseSlot,
} from "../src/domain/time";
import {
  allocatePage,
  cancelPage,
  editRange,
  findPage,
  finishTimer,
  switchTimer,
  correctTimerStart,
  diaryCsv,
} from "../src/domain/diary";
import { applyImport, exportBackup, inspectBackup } from "../src/domain/backup";
import {
  blankLoad,
  blankMisc,
  newInvoice,
  calculateLoad,
  calculateInvoice,
  validateInvoice,
  tripLoad,
  cityFor,
  multiplyMoney,
} from "../src/domain/invoices";
import {
  newForm,
  allClear,
  signForm,
  editForm,
  validateForm,
  inspection,
  declarations,
} from "../src/domain/forms";
import { analyse } from "../src/domain/rules";
import { encryptBackup, decryptBackup } from "../src/domain/encryption";
import { invoicePages, formPages, diaryPage } from "../src/documents/templates";
function driver() {
  const s = emptyState();
  Object.assign(s.profile, {
    name: "Test Driver",
    licence: "TEST123",
    base: "QLD",
    zone: "Australia/Brisbane",
    signature: "data:image/png;base64,AA==",
  });
  return s;
}
function legacy() {
  return {
    profile: {
      driverName: "Imported Driver",
      licenceNumber: "OLD123",
      baseTimeZone: "QLD",
    },
    scheme: "BFM",
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
        ruleScheme: "Standard",
        changeRows: [
          { time: "06:00", location: "Laverton North", odometer: "1000" },
        ],
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
    ruleHistory: [
      { effectiveDate: "2026-09-01", scheme: "Standard", mode: "solo" },
      { effectiveDate: "2026-09-03", scheme: "BFM", mode: "twoUp" },
    ],
  };
}
describe("calendar, clock changes and recording", () => {
  it("uses the driver base across midnight and DST", () => {
    expect(
      civil(Date.parse("2026-10-03T16:30:00Z"), "Australia/Sydney"),
    ).toMatchObject({ date: "2026-10-04", time: "03:30" });
    expect(clockChange("2026-10-04", "Australia/Sydney")).toBe(true);
    expect(clockChange("2026-10-04", "Australia/Brisbane")).toBe(false);
    expect(instantFor("2026-10-04", "02:30", "Australia/Sydney")).toEqual([]);
    expect(instantFor("2026-04-05", "02:30", "Australia/Sydney")).toHaveLength(
      2,
    );
  });
  it("starts blank and keeps explicit unknown gaps", () => {
    const s = driver();
    expect(totals(ensureDay(s, "2026-10-07").slots)).toEqual({
      work: 0,
      rest: 0,
      unknown: 1440,
    });
    editRange(s, "2026-10-07", 8, 12, "work");
    expect(totals(s.days["2026-10-07"].slots)).toEqual({
      work: 60,
      rest: 0,
      unknown: 1380,
    });
    expect(() => parseSlot("02:12")).toThrow();
  });
  it("records overnight range in both days", () => {
    const s = driver();
    editRange(s, "2026-09-01", 88, 8, "work", true);
    expect(totals(s.days["2026-09-01"].slots).work).toBe(120);
    expect(totals(s.days["2026-09-02"].slots).work).toBe(120);
  });
  it("rounds work up, rest down, without replacing work at a switch", () => {
    const s = driver(),
      a = Date.parse("2026-09-01T00:07:00+10:00");
    switchTimer(s, "work", "TEST01", "unknown", a);
    switchTimer(s, "rest", "TEST01", "stationary", a + 16 * 60000);
    finishTimer(s, a + 60 * 60000);
    expect(s.days["2026-09-01"].slots.slice(0, 5)).toEqual([
      "work",
      "work",
      "rest",
      "rest",
      null,
    ]);
    expect(s.activities).toHaveLength(2);
    expect(s.timer).toBeNull();
  });
  it("keeps an active timer through backup and corrects ordinary local start", async () => {
    const s = driver();
    switchTimer(
      s,
      "work",
      "TEST01",
      "unknown",
      Date.parse("2026-09-01T00:00:00Z"),
    );
    const plan = await inspectBackup(await exportBackup(s));
    expect(plan.state.timer?.start).toBe(s.timer?.start);
    correctTimerStart(s, "2026-09-01T09:30", -1);
    expect(s.timer?.start).toBe(Date.parse("2026-08-31T23:30:00Z"));
  });
  it("rejects a nonexistent time and ambiguous time without a choice", () => {
    const s = driver();
    s.profile.zone = "Australia/Sydney";
    switchTimer(
      s,
      "work",
      "TEST01",
      "unknown",
      Date.parse("2026-04-05T00:00:00Z"),
    );
    expect(() => correctTimerStart(s, "2026-10-04T02:30", -1)).toThrow(
      "does not exist",
    );
    expect(() => correctTimerStart(s, "2026-04-05T02:30", -1)).toThrow(
      "first or second",
    );
  });
});
describe("paper pages", () => {
  it("jumps within a book, preserving cancelled snapshots and replacements", () => {
    const s = driver();
    s.books = [
      {
        id: "a",
        number: "A",
        firstDate: "2026-09-01",
        firstPage: "56",
        closed: false,
      },
      {
        id: "b",
        number: "B",
        firstDate: "2026-09-01",
        firstPage: "56",
        closed: false,
      },
    ];
    editRange(s, "2026-09-01", 0, 4, "work");
    const p = allocatePage(s, "2026-09-01", "a");
    allocatePage(s, "2026-09-02", "b");
    cancelPage(s, p.id, "Written page corrected");
    editRange(s, "2026-09-01", 0, 4, "rest");
    const replacement = allocatePage(s, "2026-09-01", "a");
    expect(replacement.number).toBe("57");
    expect(findPage(s, "a", "0056").snapshot?.slots[0]).toBe("work");
    expect(findPage(s, "b", "56").date).toBe("2026-09-02");
    expect(() => allocatePage(s, "2026-09-03", "a", "56")).toThrow();
    expect(() => findPage(s, "a", "99")).toThrow("not recorded");
  });
});
describe("legacy and combined backups", () => {
  it("migrates compact rest semantics, books and effective rules", async () => {
    const plan = await inspectBackup(JSON.stringify(legacy()));
    expect(plan.kind).toBe("diary");
    expect(Object.keys(plan.state.days)).toHaveLength(3);
    expect(plan.state.days["2026-09-02"].legacyAssumedRest).toBe(true);
    expect(plan.state.days["2026-09-02"].review).toBe(true);
    expect(plan.state.days["2026-09-01"].profile.scheme).toBe("Standard");
    expect(plan.state.days["2026-09-03"].profile.scheme).toBe("BFM");
    expect(plan.state.days["2026-09-03"].profile.twoUp).toBe(true);
    expect(findPage(plan.state, plan.state.books[0].id, "56").date).toBe(
      "2026-09-01",
    );
  });
  it("keeps newer days and their page mappings on merge", async () => {
    const s = driver();
    s.books = [
      {
        id: "book",
        number: "TESTBOOK",
        firstDate: "2026-09-01",
        firstPage: "87",
        closed: false,
      },
    ];
    editRange(s, "2026-09-01", 0, 4, "work");
    allocatePage(s, "2026-09-01", "book", "87");
    const plan = await inspectBackup(JSON.stringify(legacy())),
      merged = applyImport(s, plan);
    expect(merged.days["2026-09-01"].slots[0]).toBe("work");
    expect(merged.pages).toHaveLength(1);
    expect(merged.pages[0].number).toBe("87");
    expect(() => applyImport(merged, plan)).toThrow("already");
  });
  it("imports v14 invoice profile, rates, manual prices and IDs", async () => {
    const s = driver(),
      i = newInvoice(s);
    i.loads = [
      {
        ...blankLoad(),
        id: "ROW",
        type: "C/O",
        fixedAmount: "120",
        manualAmount: true,
        amount: "150",
      },
    ];
    const plan = await inspectBackup(
      JSON.stringify({
        app: "Invoice Generator",
        state: {
          settings: {
            ...s.invoiceSettings,
            profile: { nameSg: "TEST" },
            typeRates: { BD: "0.52" },
          },
          invoices: [i],
        },
      }),
    );
    expect(plan.state.invoices[0].loads[0]).toMatchObject({
      id: "ROW",
      manualAmount: true,
      amount: "150",
    });
    expect(plan.state.invoiceSettings.typeRates.BD).toBe("0.52");
  });
  it("checksum catches corruption before modifying records", async () => {
    const s = driver(),
      b = JSON.parse(await exportBackup(s));
    b.payload = b.payload.replace("Test Driver", "Wrong Driver");
    await expect(inspectBackup(JSON.stringify(b))).rejects.toThrow("checksum");
    expect(s.profile.name).toBe("Test Driver");
  });
  it("rejects unsafe keys and future schema", async () => {
    await expect(inspectBackup('{"__proto__":{}}')).rejects.toThrow(
      "Unsupported",
    );
    const s = driver();
    (s as any).schema = 5;
    await expect(inspectBackup(await exportBackup(s))).rejects.toThrow(
      "Unsupported",
    );
  });
  it("encrypted backups round trip and reject wrong passwords", async () => {
    const s = driver(),
      json = await exportBackup(s),
      encrypted = await encryptBackup(json, "test-passphrase-123");
    expect(await decryptBackup(encrypted, "test-passphrase-123")).toBe(json);
    await expect(decryptBackup(encrypted, "wrong-passphrase")).rejects.toThrow(
      "Incorrect",
    );
  });
});
describe("invoice totals and trip snapshots", () => {
  it("uses decimal half-up rounding and fixed changeover amounts", () => {
    expect(multiplyMoney("3", "0.335")).toBe(1.01);
    expect(
      calculateLoad({
        ...blankLoad(),
        type: "C/O",
        km: "1700",
        rate: "120",
        fixedAmount: "120",
      }).amount,
    ).toBe("120.00");
    expect(
      calculateLoad({
        ...blankLoad(),
        odoStart: "1000",
        odoFinish: "2710",
        rate: "0.55",
      }),
    ).toMatchObject({ km: "1710", amount: "940.50" });
    expect(() =>
      calculateLoad({
        ...blankLoad(),
        odoStart: "20",
        odoFinish: "10",
        rate: "1",
      }),
    ).toThrow();
  });
  it("preserves manual amounts and totals all miscellaneous rows", () => {
    const s = driver(),
      i = newInvoice(s);
    i.loads = [
      {
        ...blankLoad(),
        km: "100",
        rate: "1",
        amount: "125",
        manualAmount: true,
      },
    ];
    i.misc = Array.from({ length: 9 }, () => ({
      ...blankMisc(),
      date: "2026-09-01",
      item: "Wait",
      quantity: "1",
      rate: "5",
    }));
    expect(calculateInvoice(i).total).toBe(170);
  });
  it("maps exact known suburbs and rejects cross-truck odometers", () => {
    const s = driver(),
      d = ensureDay(s, "2026-09-01");
    d.vehicle = "TEST01";
    d.changes[0] = {
      slot: 0,
      location: "Laverton North",
      odometer: "1000",
      restType: "unknown",
      note: "",
      vehicle: "TEST01",
    };
    d.changes[40] = {
      slot: 40,
      location: "Rocklea",
      odometer: "2710",
      restType: "unknown",
      note: "",
      vehicle: "TEST01",
    };
    expect(tripLoad(s, "2026-09-01:0", "2026-09-01:40")).toMatchObject({
      from: "MEL",
      to: "BNE",
      km: "1710",
    });
    d.changes[40].vehicle = "TEST02";
    expect(() => tripLoad(s, "2026-09-01:0", "2026-09-01:40")).toThrow(
      "Truck changed",
    );
    expect(cityFor("Unknown depot")).toBe("Unknown depot");
  });
  it("paginates every invoice row and note, including misc overflow", () => {
    const s = driver(),
      i = newInvoice(s);
    i.loads = Array.from({ length: 23 }, (_, n) => ({
      ...blankLoad(),
      loadDate: "2026-09-01",
      from: "MEL",
      to: "BNE",
      type: "BD",
      km: "1",
      rate: "1",
      amount: "1",
      id: "load" + n,
    }));
    i.misc = Array.from({ length: 11 }, (_, n) => ({
      ...blankMisc(),
      item: "ITEM-" + n,
      quantity: "1",
      rate: "1",
      amount: "1",
    }));
    i.notes = Array.from({ length: 8 }, (_, n) => "NOTE-" + n).join("\n");
    const pages = invoicePages(i);
    expect(pages).toHaveLength(3);
    const all = pages.join("");
    for (let n = 0; n < 11; n++) expect(all).toContain("ITEM-" + n);
    for (let n = 0; n < 8; n++) expect(all).toContain("NOTE-" + n);
  });
});
describe("safe driving forms", () => {
  it("all-clear preserves a fault and N/A; negative questions receive No", () => {
    const s = driver(),
      f = newForm(s);
    f.values.pm = "TEST01";
    f.checks.pm[0] = "issue";
    f.checks.pm[1] = "na";
    allClear(f, "checks");
    expect(f.checks.pm[0]).toBe("issue");
    expect(f.checks.pm[1]).toBe("na");
    expect(() => allClear(f, "declarations")).toThrow("fault");
    f.checks.pm[0] = "ok";
    allClear(f, "declarations");
    expect(f.declarations[6]).toBe("No");
    expect(f.declarations[7]).toBe("No");
    expect(f.declarations[0]).toBe("Yes");
  });
  it("signs only a complete reviewed trip for its driver, and signed records cannot be edited", () => {
    const s = driver(),
      f = newForm(s);
    Object.assign(f.values, {
      pm: "TEST01",
      date: "2026-09-01",
      depart: "06:00",
      arrive: "2026-09-02T06:00",
      from: "MEL",
      to: "BNE",
    });
    allClear(f, "checks");
    allClear(f, "declarations");
    s.forms.push(f);
    signForm(f, s);
    expect(f.status).toBe("Signed");
    expect(() =>
      editForm(s, f.id, (f) => {
        f.values.from = "SYD";
      }),
    ).toThrow("Duplicate");
    const next = newForm(s, f);
    expect(next.signature).toBe("");
    expect(next.checks.pm).toEqual({});
    expect(next.values.from).toBe("MEL");
  });
  it("requires inspection for every listed trailer and never invents answers", () => {
    const f = newForm(driver());
    Object.assign(f.values, {
      pm: "TEST01",
      t1: "TR01",
      date: "2026-09-01",
      depart: "06:00",
      arrive: "2026-09-02T06:00",
      from: "MEL",
      to: "BNE",
    });
    inspection.forEach((_, i) => (f.checks.pm[i] = "ok"));
    declarations.forEach(([, v], i) => (f.declarations[i] = v));
    expect(() => validateForm(f)).toThrow("each listed vehicle");
  });
  it("keeps long comments on continuation pages and hides optional branding", () => {
    const f = newForm(driver());
    f.company = "";
    f.showCompany = false;
    f.showLogo = false;
    f.values.comments = Array.from(
      { length: 80 },
      (_, i) => "COMMENT-" + i,
    ).join("\n");
    const pages = formPages(f);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.join("")).toContain("COMMENT-79");
    expect(pages.join("")).not.toContain('href="undefined"');
  });
});
describe("fatigue helper boundaries", () => {
  it("never supplies driving clearance for missing history or AFM", () => {
    const s = driver(),
      r = analyse(s, "2026-10-07T12:00");
    expect(r.nextBreak).toBeNull();
    expect(r.issues.join(" ")).toContain("incomplete");
    s.profile.scheme = "AFM";
    const afm = analyse(s, "2026-10-07T12:00");
    expect(afm.checks).toEqual([]);
    expect(afm.nextBreak).toBeNull();
  });
  it("finds recorded standard short-period work beyond cap", () => {
    const s = driver();
    editRange(s, "2026-09-01", 0, 28, "work");
    const r = analyse(s, "2026-09-01T07:00");
    expect(
      r.checks.some((c) => c.label === "5h 30m" && c.status === "Exceeded"),
    ).toBe(true);
    expect(r.nextBreak).toBeNull();
  });
  it("does not count moving-sleeper rest as stationary solo rest", () => {
    const s = driver();
    editRange(s, "2026-09-01", 0, 96, "rest");
    s.days["2026-09-01"].changes[0] = {
      slot: 0,
      restType: "sleeper-moving",
      location: "",
      odometer: "",
      note: "",
      vehicle: "",
    };
    const r = analyse(s, "2026-09-02T00:00");
    expect(r.majorRest).toBe("Not established");
  });
  it("keeps CSV formula cells inert", () => {
    const s = driver(),
      d = ensureDay(s, "2026-09-01");
    d.changes[0] = {
      slot: 0,
      location: "=SUM(1,2)",
      odometer: "",
      restType: "unknown",
      vehicle: "",
      note: "",
    };
    expect(diaryCsv(s, "2026-09-01", "2026-09-01")).toContain("'=SUM(1,2)");
  });
});

describe("long-period rest qualifications", () => {
  it("anchors a night-rest period at the actual end of rest, not a fixed 8am", () => {
    const s = driver();
    for (let i = 0; i < 29; i++) {
      const date = dateAdd("2026-09-01", i),
        d = ensureDay(s, date);
      d.slots.fill("rest");
      d.changes[0] = {
        slot: 0,
        location: "",
        odometer: "",
        restType: "stationary",
        note: "",
        vehicle: "TEST01",
      };
      if (i > 0) {
        for (let slot = 24; slot < 40; slot++) d.slots[slot] = "work";
      }
    }
    const r = analyse(s, "2026-09-29T12:00");
    const periods = r.checks.filter((c) => c.label === "14 days");
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.every((c) => c.start.endsWith("06:00"))).toBe(true);
  });
  it("does not treat one 24-hour break as both two-up seven-day rest requirements", () => {
    const s = driver();
    s.profile.twoUp = true;
    s.profile.coDriver = "Second Test Driver";
    for (let i = 0; i < 8; i++) {
      const date = dateAdd("2026-09-01", i),
        d = ensureDay(s, date);
      d.slots.fill("work");
      d.changes[0] = {
        slot: 0,
        location: "",
        odometer: "",
        restType: "stationary",
        note: "",
        vehicle: "TEST01",
      };
    }
    s.days["2026-09-01"].slots.fill("rest");
    const r = analyse(s, "2026-09-08T12:00");
    expect(r.issues.join(" ")).toContain("plus 24 hours");
    expect(r.nextBreak).toBeNull();
  });
  it("retains the old 24-hour counting window when another major rest ends", () => {
    const s = driver();
    for (let i = 0; i < 3; i++) {
      const d = ensureDay(s, dateAdd("2026-09-01", i));
      d.slots.fill("rest");
      d.changes[0] = {
        slot: 0,
        location: "",
        odometer: "",
        restType: "stationary",
        note: "",
        vehicle: "TEST01",
      };
    }
    editRange(s, "2026-09-02", 24, 56, "work");
    editRange(s, "2026-09-02", 84, 96, "work");
    editRange(s, "2026-09-03", 0, 8, "work");
    const r = analyse(s, "2026-09-03T02:00");
    expect(
      r.checks.some(
        (c) =>
          c.label === "1 day" &&
          c.status === "Exceeded" &&
          c.start === "2026-09-02 06:00",
      ),
    ).toBe(true);
    expect(r.nextBreak).toBeNull();
  });
});

import { selectWorkWindow, windowTotals } from "../src/domain/rules";
import { displayInstant } from "../src/domain/time";
describe("diary highlights and counted-window totals", () => {
  it("starts red work blocks only after the short-period cap and never colours rest", () => {
    const s = driver();
    editRange(s, "2026-09-01", 0, 22, "work");
    let r = analyse(s, "2026-09-01T05:30");
    expect(Object.keys(r.breachSlots)).toEqual(["2026-09-01:21"]);
    editRange(s, "2026-09-01", 21, 22, "rest");
    r = analyse(s, "2026-09-01T05:30");
    expect(r.breachSlots).toEqual({});
  });
  it("carries a counted work window across midnight without treating blanks as rest", () => {
    const s = driver();
    editRange(s, "2026-09-01", 0, 68, "rest");
    s.days["2026-09-01"].changes[0] = {
      slot: 0,
      location: "",
      odometer: "",
      restType: "stationary",
      note: "",
      vehicle: "",
    };
    editRange(s, "2026-09-01", 68, 92, "work");
    editRange(s, "2026-09-01", 92, 96, "rest");
    s.days["2026-09-01"].changes[92] = {
      slot: 92,
      location: "",
      odometer: "",
      restType: "stationary",
      note: "",
      vehicle: "",
    };
    editRange(s, "2026-09-02", 0, 8, "work");
    const r = analyse(s, "2026-09-02T02:00"),
      w = selectWorkWindow(r.workWindows, "2026-09-02");
    expect(w?.start).toBe("2026-09-01 17:00");
    expect(w?.end).toBe("2026-09-02 17:00");
    expect(windowTotals(s, w!)).toMatchObject({
      work: 480,
      rest: 60,
      unknown: 900,
    });
  });
  it("does not present highlights or calculated windows for unsupported rules", () => {
    const s = driver();
    s.profile.scheme = "AFM";
    editRange(s, "2026-09-01", 0, 96, "work");
    const r = analyse(s, "2026-09-01T24:00");
    expect(r.breachSlots).toEqual({});
    expect(r.workWindows).toEqual([]);
  });
  it("displays the selected state time independently of the device time zone", () => {
    const at = "2026-10-07T14:30:00Z";
    expect(displayInstant(at, "Australia/Brisbane")).toBe("08/10/2026 · 00:30");
    expect(displayInstant(at, "Australia/Perth")).toBe("07/10/2026 · 22:30");
    expect(displayInstant(at, "Australia/Sydney")).toBe("08/10/2026 · 01:30");
  });
});
