import { describe, expect, it } from "vitest";
import {
  clone,
  emptyState,
  ensureDay,
  upgradeWorkspace,
  type Workspace,
} from "../src/domain/model";
import { editRange, diaryCsv } from "../src/domain/diary";
import { analyse, selectWorkWindow, windowTotals } from "../src/domain/rules";
import { activityAt, classifyRest, restTypeAt } from "../src/domain/rest";
import { dateAdd, totals } from "../src/domain/time";

function fixture(scheme: "Standard" | "BFM" = "BFM", days = 29) {
  const s = emptyState();
  Object.assign(s.profile, {
    scheme,
    base: "QLD",
    zone: "Australia/Brisbane",
    certificate: "TEST",
    certificateExpiry: "2027-01-01",
  });
  s.settings.diaryRestDefault = "stationary";
  for (let n = 0; n < days; n++) ensureDay(s, dateAdd("2026-09-11", n));
  return s;
}
function explicit(
  s: Workspace,
  date: string,
  slot: number,
  restType: "unknown" | "stationary" | "sleeper-moving",
) {
  ensureDay(s, date).changes[slot] = {
    slot,
    restType,
    location: "",
    odometer: "",
    note: "",
    vehicle: "",
  };
}
function screenshot(s: Workspace) {
  editRange(s, "2026-10-09", 0, 24, "work");
  editRange(s, "2026-10-09", 26, 46, "work");
  editRange(s, "2026-10-09", 48, 60, "work");
  editRange(s, "2026-10-09", 88, 96, "work");
}

describe("saved diary rest semantics", () => {
  it("erasing work restores rest without inventing a missing day", () => {
    const s = fixture("BFM", 0);
    editRange(s, "2026-10-09", 0, 8, "work");
    editRange(s, "2026-10-09", 4, 8, null);
    expect(totals(s.days["2026-10-09"].slots)).toEqual({
      work: 60,
      rest: 1380,
      unknown: 0,
    });
    expect(activityAt(s, "2026-10-08", 95)).toBeNull();
    expect(analyse(s, "2026-10-09T12:00").issues.join(" ")).toContain(
      "incomplete",
    );
  });
  it("migrates saved blank cells once and preserves cancelled snapshots", () => {
    const s = fixture("BFM", 1),
      d = s.days["2026-09-11"];
    d.slots[0] = null;
    s.pages.push({
      id: "p",
      bookId: "b",
      number: "1",
      date: d.date,
      status: "Cancelled",
      reason: "correction",
      snapshot: clone(d),
    });
    upgradeWorkspace(s);
    expect(d.slots[0]).toBe("rest");
    expect(s.pages[0].snapshot!.slots[0]).toBeNull();
    const audits = s.audit.length;
    upgradeWorkspace(s);
    expect(s.audit.length).toBe(audits);
    expect(s.audit.at(-1)?.action).toContain("unselected blocks");
  });
  it("does not leak stationary metadata past work or a missing day", () => {
    const s = fixture("BFM", 0);
    s.settings.diaryRestDefault = "unknown";
    s.settings.restSelectionMode = "confirm";
    explicit(s, "2026-10-08", 0, "stationary");
    editRange(s, "2026-10-08", 24, 48, "work");
    expect(restTypeAt(s, "2026-10-08", 49)).toBe("unknown");
    ensureDay(s, "2026-10-10");
    expect(restTypeAt(s, "2026-10-10", 0)).toBe("unknown");
  });
  it("carries a recorded rest setting across midnight without another selection", () => {
    const s = fixture("BFM", 0);
    s.settings.diaryRestDefault = "unknown";
    editRange(s, "2026-10-08", 0, 88, "work");
    explicit(s, "2026-10-08", 88, "stationary");
    ensureDay(s, "2026-10-09");
    editRange(s, "2026-10-09", 20, 96, "work");
    expect(restTypeAt(s, "2026-10-09", 19)).toBe("stationary");
    expect(diaryCsv(s, "2026-10-09", "2026-10-09")).toContain("stationary");
    expect(classifyRest(s, "2026-10-09", 0)).toMatchObject({
      minutes: 420,
      label: "Night rest",
      night: true,
    });
  });
  it("classifies 24-hour rest and keeps unknown/moving rest physically distinct", () => {
    const s = fixture("BFM", 0);
    ensureDay(s, "2026-10-09");
    expect(classifyRest(s, "2026-10-09", 0).label).toBe("24-hour rest");
    explicit(s, "2026-10-09", 0, "sleeper-moving");
    expect(classifyRest(s, "2026-10-09", 0).label).toBe("Moving sleeper rest");
    expect(analyse(s, "2026-10-09T24:00").majorRest).toBe("Not established");
    explicit(s, "2026-10-09", 0, "unknown");
    expect(classifyRest(s, "2026-10-09", 0).label).toBe("Rest · confirm type");
  });
});

describe("counting periods and cap boundaries", () => {
  it("reproduces the screenshot: the older period controls despite seven hours rest", () => {
    const s = fixture();
    screenshot(s);
    const r = analyse(s, "2026-10-09T24:00", 2);
    const red = Object.keys(r.breachSlots).filter((k) =>
      k.startsWith("2026-10-09:"),
    );
    expect(red).toEqual(
      Array.from({ length: 8 }, (_, i) => "2026-10-09:" + (88 + i)),
    );
    const w = selectWorkWindow(r.workWindows, "2026-10-09")!;
    expect(w).toMatchObject({
      start: "2026-10-09 00:00",
      work: 960,
      remaining: 0,
      status: "Exceeded",
    });
    expect(
      r.workWindows.some(
        (w) => w.start === "2026-10-09 22:00" && w.work === 120,
      ),
    ).toBe(true);
    expect(windowTotals(s, w)).toMatchObject({
      work: 960,
      rest: 480,
      unknown: 0,
    });
  });
  it("does not claim a confirmed 24-hour breach from an unknown starting history", () => {
    const s = fixture("BFM", 0);
    screenshot(s);
    const r = analyse(s, "2026-10-09T24:00");
    expect(
      Object.values(r.breachSlots)
        .flat()
        .some((x) => x.includes("24h")),
    ).toBe(false);
    expect(
      r.workWindows.find((w) => w.start === "2026-10-09 00:00")?.status,
    ).toBe("Needs review");
    expect(r.nextBreak).toBeNull();
  });
  it("allows exactly 14 BFM hours but flags the next recorded quarter", () => {
    const s = fixture();
    screenshot(s);
    editRange(s, "2026-10-09", 88, 96, "rest");
    let r = analyse(s, "2026-10-09T22:00");
    expect(r.breachSlots).toEqual({});
    expect(
      r.workWindows.find((w) => w.start === "2026-10-09 00:00")?.work,
    ).toBe(840);
    editRange(s, "2026-10-09", 88, 89, "work");
    r = analyse(s, "2026-10-09T22:15");
    expect(Object.keys(r.breachSlots)).toEqual(["2026-10-09:88"]);
    expect(r.controlling?.remaining).toBe(0);
  });
  it.each([
    ["Standard", 21],
    ["BFM", 24],
  ] as const)("enforces %s continuous-work boundary", (scheme, slots) => {
    const s = fixture(scheme);
    editRange(s, "2026-10-09", 24, 24 + slots, "work");
    expect(
      Object.keys(analyse(s, "2026-10-09T12:15").breachSlots),
    ).toHaveLength(0);
    editRange(s, "2026-10-09", 24 + slots, 25 + slots, "work");
    expect(Object.keys(analyse(s, "2026-10-09T12:15").breachSlots)).toContain(
      "2026-10-09:" + (24 + slots),
    );
  });
  it("does not credit a partial rest quarter or future planned rest", () => {
    const s = fixture();
    editRange(s, "2026-10-09", 0, 24, "work");
    const r = analyse(s, "2026-10-09T06:14");
    expect(r.days.at(-1)).toMatchObject({ work: 360, rest: 0, unknown: 0 });
    expect(
      r.workWindows.find((w) => w.start === "2026-10-09 00:00")?.rest,
    ).toBe(0);
    const r2 = analyse(s, "2026-10-09T06:15");
    expect(r2.days.at(-1)?.rest).toBe(15);
  });
  it("does not subtract reviewed work a second time from recorded rest", () => {
    const s = fixture();
    screenshot(s);
    s.days["2026-10-09"].review = true;
    const w = analyse(s, "2026-10-09T24:00").workWindows.find(
      (w) => w.start === "2026-10-09 00:00",
    )!;
    expect(w.rest).toBe(480);
    expect(w.review).toBe(true);
  });
  it("a break interrupted by work is not a continuous seven-hour rest", () => {
    const s = fixture();
    editRange(s, "2026-10-09", 0, 24, "work");
    editRange(s, "2026-10-09", 36, 37, "work");
    editRange(s, "2026-10-09", 52, 76, "work");
    const r = analyse(s, "2026-10-09T19:00");
    expect(
      r.workWindows.some(
        (w) => w.start === "2026-10-09 13:00" && w.established,
      ),
    ).toBe(false);
  });
  it("preserves an 84-hour excess after the following 24-hour rest", () => {
    const s = fixture();
    for (let n = 0; n < 7; n++)
      editRange(s, dateAdd("2026-10-01", n), 0, 52, "work");
    const r = analyse(s, "2026-10-09T12:00", 14);
    expect(
      Object.values(r.breachSlots)
        .flat()
        .some((reason) => reason.includes("84 hours")),
    ).toBe(true);
    expect(r.workSince24).toBe(0);
  });
  it("counts night work and work above 12 hours once where they overlap", () => {
    const s = fixture();
    editRange(s, "2026-10-08", 48, 72, "work");
    editRange(s, "2026-10-08", 74, 96, "work");
    editRange(s, "2026-10-09", 0, 10, "work");
    const r = analyse(s, "2026-10-09T02:30");
    expect(r.longNight).toBe(150); // Midnight–02:30 includes every >12h quarter.
  });
  it("provides a constrained estimate for complete, consistent history", () => {
    const s = fixture();
    editRange(s, "2026-10-09", 24, 32, "work");
    const r = analyse(s, "2026-10-09T08:00");
    expect(r.issues).toEqual([]);
    expect(r.nextBreak).toBe(240);
    expect(r.controlling?.label).toBe("6h 15m");
  });
});

describe("remaining table requirements", () => {
  it("enforces the BFM nine-hour cap after an insufficient accumulated rest", () => {
    const s = fixture();
    editRange(s, "2026-10-09", 0, 24, "work");
    editRange(s, "2026-10-09", 25, 36, "work");
    const r = analyse(s, "2026-10-09T09:00");
    expect(r.checks.find((c) => c.label === "9h 00m")?.status).toBe("Exceeded");
    expect(Object.keys(r.breachSlots)).toEqual(["2026-10-09:35"]);
  });
  it("enforces the BFM twelve-hour cap despite satisfying the earlier nine-hour cap", () => {
    const s = fixture();
    for (const [a, b] of [
      [0, 24],
      [25, 35],
      [36, 47],
    ])
      editRange(s, "2026-10-09", a, b, "work");
    const r = analyse(s, "2026-10-09T12:00");
    expect(r.checks.find((c) => c.label === "12h 00m")?.status).toBe(
      "Exceeded",
    );
    expect(r.breachSlots["2026-10-09:46"]).toContain("15m break overdue");
    expect(r.findings.find(f=>f.code==="work-720")?.at).toBe("2026-10-09 11:30");
  });
  it("requires review of a possible BFM split rest instead of declaring its eligibility", () => {
    const s = fixture();
    for (const [a, b] of [
      [0, 24],
      [48, 72],
      [80, 88],
    ])
      editRange(s, "2026-10-09", a, b, "work");
    const r = analyse(s, "2026-10-09T24:00");
    const c = r.checks.find(
      (c) => c.label === "1 day" && c.start === "2026-10-09 00:00",
    );
    expect(c?.status).toBe("Needs review");
    expect(c?.reason).toContain("split rest");
    expect(r.nextBreak).toBeNull();
  });
  it("recognizes a five-hour moving sleeper break only for Standard two-up", () => {
    const s = fixture("Standard", 0);
    s.profile.twoUp = true;
    s.profile.coDriver = "TEST TWO";
    editRange(s, "2026-10-08", 0, 76, "work");
    explicit(s, "2026-10-08", 76, "sleeper-moving");
    editRange(s, "2026-10-09", 0, 8, "work");
    const r = analyse(s, "2026-10-09T02:00");
    expect(
      r.workWindows.find((w) => w.start === "2026-10-09 00:00")?.established,
    ).toBe(true);
    expect(r.checks.some((c) => c.label === "52h 00m")).toBe(true);
  });
});

it("identifies the 84-hour budget when it is tighter than the short-period cap", () => {
  const s = fixture();
  for (let n = 0; n < 6; n++) {
    const day = dateAdd("2026-10-03", n);
    editRange(s, day, 24, 48, "work");
    editRange(s, day, 50, 70, "work");
    if (n < 5) editRange(s, day, 72, 84, "work");
  }
  editRange(s, "2026-10-09", 24, 28, "work");
  const r = analyse(s, "2026-10-09T07:00");
  expect(r.workSince24).toBe(82 * 60);
  expect(r.nextBreak).toBe(120);
  expect(r.controlling?.label).toBe("BFM 84-hour work cap");
});


describe("Elapsed CSV export", () => {
  it("elapsed CSV has consistent columns and no future-time amounts", () => {
    const s = fixture();
    editRange(s, "2026-10-09", 24, 26, "work");
    const rows = diaryCsv(s, "2026-10-09", "2026-10-09")
      .split("\r\n")
      .map(row => row.slice(1, -1).split('","'));
    const header = rows[0];
    expect(header).toHaveLength(21);
    expect(header).not.toContain("Future minutes");
    expect(header[16]).toBe("Unrecorded minutes");
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every(row => row.length === header.length)).toBe(true);
    expect(rows[1][9]).toBe(s.days["2026-10-09"].vehicle);
    expect(rows[1][10]).toBe(s.days["2026-10-09"].profile.name);
  });
});
