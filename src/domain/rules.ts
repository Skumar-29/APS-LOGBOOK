import { activityAt, restTypeAt } from "./rest";
import {
  type Workspace,
  type Activity,
  type RestType,
  profileOn,
} from "./model";
import { clockChange, dateAdd, hhmm, minutesLabel, totals } from "./time";
export const RULE_SOURCE =
  "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time";
export const RULE_VERSION = "NHVR-2026-10-09-review-2";
interface Cell {
  kind: Activity;
  rest: RestType;
  date: string;
  slot: number;
  review: boolean;
}
interface Run {
  start: number;
  end: number;
  kind: Activity;
  stationary: boolean;
  sleeper: boolean;
}
export interface Check {
  label: string;
  start: string;
  end: string;
  work: number;
  limit: number | null;
  rest: number;
  requiredRest: number;
  status:
    | "Exceeded"
    | "Needs review"
    | "Within work cap"
    | "Rest due"
    | "Open period";
  remaining: number;
  date: string;
  reason: string;
}
export interface WorkWindow {
  start: string;
  end: string;
  limit: number | null;
  established: boolean;
  assessedThrough: string;
  work: number;
  rest: number;
  remaining: number;
  status: Check["status"];
  review: boolean;
}
export interface RuleReport {
  breachSlots: Record<string, string[]>;
  workWindows: WorkWindow[];
  checks: Check[];
  issues: string[];
  days: Array<{ date: string; work: number; rest: number; unknown: number }>;
  lastWork: string;
  majorRest: string;
  nightRests: number;
  longNight: number;
  workSince24: number;
  nextBreak: number | null;
  controlling: Check | null;
  source: string;
  version: string;
}
function label(cell: Cell | undefined) {
  return cell ? cell.date + " " + hhmm(cell.slot) : "";
}
/** Conservative helper checks. Unknown records, rest types and certificate conditions never produce clearance. */
export function analyse(s: Workspace, asOf: string, range = 14): RuleReport {
  const endDate = asOf.slice(0, 10),
    rawSlot = Number(asOf.slice(11, 13)) * 4 + Number(asOf.slice(14, 16)) / 15,
    // Work rounds outwards; an unfinished rest quarter is outside the assessment.
    endSlot =
      rawSlot % 1 && activityAt(s, endDate, Math.floor(rawSlot)) === "rest"
        ? Math.floor(rawSlot)
        : Math.ceil(rawSlot),
    startDate = dateAdd(endDate, -28),
    cells: Cell[] = [],
    issues: string[] = [];
  const profile = s.days[endDate]?.profile || profileOn(s, endDate),
    bfm = profile.scheme === "BFM",
    two = profile.twoUp;
  let clock = false,
    changed = false;
  for (let offset = 0; offset <= 28; offset++) {
    const date = dateAdd(startDate, offset),
      d = s.days[date],
      max = offset === 28 ? endSlot : 96;
    if (d && clockChange(date, d.profile.zone)) clock = true;
    if (
      d &&
      (d.profile.scheme !== profile.scheme ||
        d.profile.twoUp !== two ||
        d.profile.zone !== profile.zone)
    )
      changed = true;
    for (let i = 0; i < max; i++) {
      const kind = activityAt(s, date, i);
      cells.push({
        kind,
        rest: kind === "rest" ? restTypeAt(s, date, i) : "unknown",
        date,
        slot: i,
        review: !!d?.review || !!d?.clockReview,
      });
    }
  }
  const end = cells.length,
    runs: Run[] = [];
  for (let i = 0; i < end; i++) {
    const c = cells[i],
      prev = runs.at(-1),
      stationary = c.kind === "rest" && c.rest === "stationary",
      sleeper = c.kind === "rest" && c.rest === "sleeper-moving";
    if (
      prev &&
      prev.kind === c.kind &&
      prev.stationary === stationary &&
      prev.sleeper === sleeper
    )
      prev.end = i + 1;
    else runs.push({ start: i, end: i + 1, kind: c.kind, stationary, sleeper });
  }
  const workPrefix = [0],
    restPrefix = [0],
    unknownPrefix = [0];
  for (const c of cells) {
    workPrefix.push(workPrefix.at(-1)! + (c.kind === "work" ? 15 : 0));
    restPrefix.push(restPrefix.at(-1)! + (c.kind === "rest" ? 15 : 0));
    unknownPrefix.push(
      unknownPrefix.at(-1)! + (c.kind === null || c.review ? 1 : 0),
    );
  }
  const work = (a: number, b: number) => workPrefix[b] - workPrefix[a],
    rest = (a: number, b: number) => restPrefix[b] - restPrefix[a],
    unknown = (a: number, b: number) => unknownPrefix[b] - unknownPrefix[a];
  const workStarts = runs.filter((r) => r.kind === "work").map((r) => r.start);
  const stationary = runs.filter((r) => r.stationary);
  const longest = (a: number, b: number, allowSleeper = false) => {
    let best = 0,
      current = 0;
    for (let i = a; i < b; i++) {
      const c = cells[i];
      if (
        c.kind === "rest" &&
        (c.rest === "stationary" ||
          (allowSleeper && c.rest === "sleeper-moving"))
      ) {
        current = i > a && cells[i - 1].rest !== c.rest ? 15 : current + 15;
        best = Math.max(best, current);
      } else current = 0;
    }
    return best;
  };
  const nightEvents: Array<{
    start: number;
    at: number;
    anchor: number;
    day: number | null;
    required: number;
  }> = [];
  for (let n = 0; n < 29; n++) {
    const a = n * 96 + 88,
      b = Math.min(end, a + 40);
    for (const r of stationary) {
      if (Math.min(b, r.end) - Math.max(a, r.start) >= 28) {
        nightEvents.push({
          start: Math.max(a, r.start),
          at: Math.min(b, r.end),
          anchor: r.end,
          day: n,
          required: 28,
        });
        break;
      }
    }
  }
  // A 24-hour stationary break also qualifies as a night rest. Do not count it again
  // when a qualifying overnight interval already lies in that same rest break.
  for (const r of stationary) {
    const count = nightEvents.filter(
        (n) => n.at > r.start && n.at <= r.end,
      ).length,
      required = Math.floor((r.end - r.start) / 96);
    for (let n = count; n < required; n++)
      nightEvents.push({
        start: r.start + n * 96,
        at: r.start + (n + 1) * 96,
        anchor: r.end,
        day: null,
        required: 96,
      });
  }
  const nights = [...new Set(nightEvents.map((n) => n.anchor))].sort(
    (a, b) => a - b,
  );
  const nightRequirements = (
    a: number,
    b: number,
    consecutiveNeeded: boolean,
  ) => {
    const events = nightEvents.filter(
        (n) => Math.min(b, n.at) - Math.max(a, n.start) >= n.required,
      ),
      days = [
        ...new Set(events.filter((n) => n.day !== null).map((n) => n.day!)),
      ].sort((a, b) => a - b);
    return (
      events.length >= 4 &&
      (!consecutiveNeeded ||
        days.some((d, i) => i > 0 && d - days[i - 1] === 1))
    );
  };
  const at24 = stationary
    .filter((r) => r.end - r.start >= 96)
    .map((r) => r.end);
  const major: Run[] = [];
  for (const r of runs) {
    const eligible = r.stationary || (two && !bfm && r.sleeper);
    if (!eligible) continue;
    major.push({ ...r });
  }
  const minimumMajor = two ? (bfm ? 40 : 20) : 28;
  for (let i = major.length - 1; i >= 0; i--)
    if (major[i].end - major[i].start < minimumMajor) major.splice(i, 1);
  const qualifyingAnchors = (mins: number) => {
    if (mins < 1440 || (bfm && two && mins === 1440)) return workStarts;
    let anchors: number[] = [];
    if (mins === 1440) anchors = major.map((r) => r.end);
    else if (mins === 3120 || mins === 4920)
      anchors = stationary
        .filter((r) => r.end - r.start >= 40)
        .map((r) => r.end);
    else if (mins === 10080) anchors = at24;
    else anchors = bfm && !two ? [...at24, ...nights] : nights;
    return [...new Set(anchors)].sort((a, b) => a - b);
  };
  const anchored = (mins: number) => {
    const qualified = qualifyingAnchors(mins);
    // NHVR fallback: where the required major rest is absent, count from any rest.
    // Do not silently drop overlapping older anchors when a newer break finishes.
    const fallback = workStarts.filter(
      (a) => !qualified.some((q) => q <= a && q > a - mins / 15),
    );
    return [...new Set([...qualified, ...fallback])].sort((a, b) => a - b);
  };
  const checks: Check[] = [],
    allChecks: Check[] = [],
    workWindows: WorkWindow[] = [];
  const breachSlots: Record<string, string[]> = {};
  const supported =
    !["AFM", "ACH"].includes(profile.scheme) &&
    !["WA", "NT"].includes(profile.base) &&
    !clock &&
    !changed;
  const mark = (i: number, reason: string) => {
    if (!supported || cells[i]?.kind !== "work") return;
    const key = cells[i].date + ":" + cells[i].slot;
    breachSlots[key] ||= [];
    if (!breachSlots[key].includes(reason)) breachSlots[key].push(reason);
  };
  const short = bfm
    ? two
      ? []
      : [
          [375, 360, 15],
          [540, 510, 30],
          [720, 660, 60],
        ]
    : [
        [330, 315, 15],
        [480, 450, 30],
        [660, 600, 60],
      ];
  const specs: Array<[number, number | null, number]> = [
    ...(short as Array<[number, number, number]>),
    [1440, bfm ? 840 : 720, two ? (bfm ? 0 : 300) : 420],
    ...(two ? [[bfm ? 4920 : 3120, null, 600] as [number, null, number]] : []),
    ...(!bfm || two
      ? [
          [10080, two ? (bfm ? 4200 : 3600) : 4320, 1440] as [
            number,
            number,
            number,
          ],
        ]
      : []),
    [20160, two ? (bfm ? 8400 : 7200) : 8640, 0],
  ];
  for (const [period, limit, need] of specs) {
    const anchors = anchored(period).filter(
      (a) => a < end && a >= Math.max(0, end - range * 96 - period / 15),
    );
    const rows: Check[] = [];
    for (const a of anchors) {
      const intended = a + period / 15,
        b = Math.min(end, intended);
      if (b <= Math.max(0, end - range * 96)) continue;
      const w = work(a, b),
        r = rest(a, b),
        complete = intended <= end;
      const qualified =
        period < 1440 ? r : longest(a, b, two && period === 1440);
      let reason = "",
        status: Check["status"] = "Within work cap";
      const lookback = Math.max(0, a - period / 15);
      const verifiedMajor =
        qualifyingAnchors(period).includes(a) &&
        period >= 1440 &&
        !(bfm && two && period === 1440);
      const verifiedFallback =
        a > 0 &&
        cells[a - 1].kind === "rest" &&
        !unknown(lookback, a) &&
        !cells
          .slice(lookback, a)
          .some((c) => c.kind === "rest" && c.rest === "unknown");
      const established =
        verifiedMajor ||
        verifiedFallback ||
        (bfm &&
          two &&
          period === 1440 &&
          a > 0 &&
          cells[a - 1].kind === "rest");
      const possibleSplitRest =
        bfm &&
        !two &&
        period === 1440 &&
        qualified >= 360 &&
        qualified < 420 &&
        r >= 480;
      const uncertain =
        possibleSplitRest ||
        (period >= 1440 && !established) ||
        unknown(a, b) > 0 ||
        clock ||
        changed ||
        cells
          .slice(a, b)
          .some(
            (c) =>
              period >= 1440 &&
              !(bfm && two && period === 1440) &&
              c.kind === "rest" &&
              c.rest === "unknown",
          ) ||
        a === 0;
      const stationaryMinutes = stationary.map(
        (r) => Math.max(0, Math.min(b, r.end) - Math.max(a, r.start)) * 15,
      );
      let extraRest = "";
      if (
        period === 10080 &&
        two &&
        stationaryMinutes.filter((n) => n >= 420).reduce((n, x) => n + x, 0) <
          2880
      )
        extraRest =
          "24 hours continuous stationary rest plus another 24 hours in stationary blocks of at least 7 hours must be checked.";
      if (period === 20160) {
        if (!nightRequirements(a, b, !(bfm && two)))
          extraRest =
            "Night-rest and consecutive-night requirements are not established in this period.";
        if (
          bfm &&
          !two &&
          stationaryMinutes.reduce((n, x) => n + Math.floor(x / 1440), 0) < 2
        )
          extraRest += " Two 24-hour stationary rest breaks are required.";
      }
      if (limit !== null && w > limit && (period < 1440 || established)) {
        status = "Exceeded";
        let first = a;
        while (first < b && work(a, first + 1) <= limit) first++;
        for (let i = first; i < b; i++)
          mark(
            i,
            `${minutesLabel(period)} window: recorded work exceeds ${minutesLabel(limit)} (counted from ${label(cells[a])}).`,
          );
        reason =
          "Recorded work first exceeds this cap at " +
          label(cells[first]) +
          ".";
      } else if (uncertain) {
        status = "Needs review";
        reason = possibleSplitRest
          ? "Possible split rest: check the BFM split-rest conditions before relying on this period."
          : "Missing history, imported records, clock changes or rest classification.";
      } else if (complete && ((need && qualified < need) || extraRest)) {
        status = "Rest due";
        reason = extraRest || "Required rest was not recorded in this period.";
      } else if (!complete) {
        status = "Open period";
        reason = extraRest;
      }
      const minutesLeft = (intended - end) * 15,
        // If work resumes now, an unfinished continuous break is interrupted.
        restStill =
          period < 1440
            ? Math.max(0, need - qualified)
            : qualified >= need
              ? 0
              : need;
      const remaining = Math.max(
        0,
        Math.min(
          limit === null ? Infinity : limit - w,
          Math.max(0, minutesLeft - restStill),
        ),
      );
      const row: Check = {
        label:
          period < 1440 || period % 1440 !== 0
            ? minutesLabel(period)
            : `${period / 1440} day${period === 1440 ? "" : "s"}`,
        start: label(cells[a]),
        end: new Date(Date.parse(startDate + "T00:00:00Z") + intended * 900000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
        work: w,
        limit,
        rest: Math.max(0, qualified),
        requiredRest: need,
        status,
        remaining,
        date: cells[a]?.date || endDate,
        reason,
      };
      rows.push(row);
      allChecks.push(row);
      if (period === 1440)
        workWindows.push({
          start: row.start,
          end: row.end,
          limit,
          established,
          assessedThrough: new Date(
            Date.parse(startDate + "T00:00:00Z") + b * 900000,
          )
            .toISOString()
            .slice(0, 16)
            .replace("T", " "),
          work: w,
          rest: r,
          remaining,
          status,
          review: uncertain,
        });
    }
    const important = rows.filter(
      (r) => r.status === "Exceeded" || r.status === "Rest due",
    );
    checks.push(...important.slice(-5));
    const open = rows
      .filter((r) => r.status !== "Exceeded" && r.status !== "Rest due")
      .sort(
        (a, b) =>
          Number(b.end > asOf.replace("T", " ")) -
            Number(a.end > asOf.replace("T", " ")) || a.remaining - b.remaining,
      )[0];
    if (open) checks.push(open);
  }
  const nightWork = new Set<number>();
  for (let i = 0; i < end; i++)
    if (cells[i].kind === "work" && cells[i].slot < 24) nightWork.add(i);
  for (const a of anchored(1440)) {
    let count = 0;
    for (let i = a; i < Math.min(end, a + 96); i++)
      if (cells[i].kind === "work") {
        count++;
        if (count > 48) nightWork.add(i);
      }
  }
  const longNight = [...nightWork].filter((i) => i >= end - 672).length * 15;
  if (bfm && !two) {
    const nightPrefix = [0];
    for (let i = 0; i < end; i++)
      nightPrefix.push(nightPrefix.at(-1)! + (nightWork.has(i) ? 15 : 0));
    const candidates = workStarts.filter(
      (a) => a < end && a + 672 > end - range * 96,
    );
    const selected = candidates
      .map((a) => ({
        a,
        used: nightPrefix[Math.min(end, a + 672)] - nightPrefix[a],
      }))
      .sort((a, b) => b.used - a.used)[0];
    // Historical excess remains highlighted after a later counting period starts.
    for (const a of candidates) {
      const b = Math.min(end, a + 672);
      for (let i = a; i < b; i++)
        if (nightWork.has(i) && nightPrefix[i + 1] - nightPrefix[a] > 2160)
          mark(
            i,
            "Recorded long/night work exceeds 36 hours in a seven-day period counted from " +
              label(cells[a]) +
              ".",
          );
    }
    if (selected) {
      const a = selected.a,
        b = Math.min(end, a + 672),
        w = selected.used,
        uncertain = unknown(a, b) > 0 || clock || changed;
      checks.push({
        label: "7 days long/night",
        start: label(cells[a]),
        end: new Date(Date.parse(startDate + "T00:00:00Z") + (a + 672) * 900000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
        work: w,
        limit: 2160,
        rest: 0,
        requiredRest: 0,
        status:
          w > 2160
            ? "Exceeded"
            : uncertain
              ? "Needs review"
              : a + 672 <= end
                ? "Within work cap"
                : "Open period",
        remaining: Math.max(0, 2160 - w),
        date: cells[a].date,
        reason:
          "Long/night work is a union: midnight to 6am, and work above 12 hours in a counted 24-hour period.",
      });
    }
  }
  const last24 = at24.filter((x) => x <= end).at(-1),
    workSince24 = work(last24 ?? Math.max(0, end - 1344), end);
  if (bfm && !two)
    for (let n = 0; n < at24.length; n++) {
      const a = at24[n],
        b = at24[n + 1] ?? end;
      for (let i = a; i < b; i++)
        if (work(a, i + 1) > 5040)
          mark(
            i,
            "Recorded work exceeds 84 hours since the 24-hour stationary rest ending " +
              label(cells[a]) +
              ".",
          );
    }
  if (!last24)
    issues.push(
      "A preceding 24-hour stationary rest has not been established.",
    );
  if (bfm && !two && longNight > 2160)
    issues.push(
      "Recorded long/night work exceeds 36 hours in the displayed seven days; review the relevant counting period.",
    );
  if (bfm && !two && workSince24 > 5040)
    issues.push(
      "More than 84 hours of work is recorded since the last qualifying 24-hour rest.",
    );
  const recentNights = nightEvents.filter(
      (n) => Math.min(end, n.at) - Math.max(end - 1344, n.start) >= n.required,
    ),
    recentDays = [
      ...new Set(recentNights.filter((n) => n.day !== null).map((n) => n.day!)),
    ].sort((a, b) => a - b),
    consecutive = recentDays.some(
      (n, i) => i > 0 && n - recentDays[i - 1] === 1,
    );
  if (recentNights.length < 4 || !bfm || !two) {
    if (recentNights.length < 4)
      issues.push(
        "Fewer than four qualifying night rests identified in the displayed 14 days.",
      );
    if (!(bfm && two) && !consecutive)
      issues.push("Consecutive night rests need review.");
  }
  if (profile.scheme === "AFM" || profile.scheme === "ACH")
    issues.push(
      "Certificate-based hours: record-only until the specific conditions have been configured and validated.",
    );
  if (["WA", "NT"].includes(profile.base))
    issues.push(
      "Confirm the jurisdiction of operation; this helper does not apply WA/NT rules.",
    );
  if (endDate < "2026-08-01")
    issues.push("Historical counting rules require review.");
  if (unknown(Math.max(0, end - 1344), end))
    issues.push(
      "History is incomplete or contains unconfirmed imported records.",
    );
  if (clock)
    issues.push("A daylight-saving clock change needs an elapsed-time review.");
  if (changed)
    issues.push("Rule, mode or base changes fall within this history.");
  if (
    profile.scheme === "BFM" &&
    (!profile.certificate ||
      !profile.certificateExpiry ||
      profile.certificateExpiry < endDate)
  )
    issues.push("Check the BFM accreditation and expiry.");
  if (two && !profile.coDriver) issues.push("Add the co-driver details.");
  const days = [];
  for (let n = range - 1; n >= 0; n--) {
    const date = dateAdd(endDate, -n);
    days.push({
      date,
      ...totals(cells.filter((c) => c.date === date).map((c) => c.kind)),
    });
  }
  const lastWorkRun = runs
      .filter(
        (r) =>
          r.kind === "work" && r.end < end && cells[r.end]?.kind === "rest",
      )
      .at(-1),
    lastMajor = major.at(-1);
  // Detailed long-period requirements are displayed for review, never presented as a legal clearance.
  const assessedAt = new Date(
    Date.parse(startDate + "T00:00:00Z") + end * 900000,
  )
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  const activeChecks = allChecks.filter(
    (c) => c.start <= assessedAt && c.end > assessedAt,
  );
  const allowanceChecks = [...activeChecks];
  if (bfm && !two && last24 !== undefined && activeChecks.length) {
    for (const [labelText, used, cap, start] of [
      ["BFM 84-hour work cap", workSince24, 5040, label(cells[last24])],
      [
        "BFM long/night budget (conservative)",
        longNight,
        2160,
        label(cells[Math.max(0, end - 672)]),
      ],
    ] as const)
      allowanceChecks.push({
        label: labelText,
        start,
        end: assessedAt,
        work: used,
        limit: cap,
        rest: 0,
        requiredRest: 0,
        status: used > cap ? "Exceeded" : "Open period",
        remaining: Math.max(0, cap - used),
        date: endDate,
        reason:
          "Additional BFM budget used by the conservative work-cap estimate.",
      });
  }
  const controlling =
    allowanceChecks.sort((a, b) => a.remaining - b.remaining)[0] || null;
  if (bfm && !two) {
    const last14 = Math.max(0, end - 1344),
      rests = stationary.map(
        (r) =>
          Math.max(0, Math.min(end, r.end) - Math.max(last14, r.start)) * 15,
      );
    if (rests.reduce((n, x) => n + Math.floor(x / 1440), 0) < 2)
      issues.push(
        "Two 24-hour stationary rest breaks need review within the relevant 14-day period.",
      );
  }
  if (two) {
    const a = Math.max(0, end - 672),
      chunks = stationary.map(
        (r) => Math.max(0, Math.min(end, r.end) - Math.max(a, r.start)) * 15,
      );
    if (chunks.filter((x) => x >= 420).reduce((n, x) => n + x, 0) < 2880)
      issues.push(
        "Review the 7-day requirement: 24 hours continuous stationary rest plus 24 hours in stationary blocks of at least 7 hours.",
      );
  }
  const nextBreak =
    !issues.length &&
    ![...allChecks, ...checks].some((c) =>
      ["Exceeded", "Rest due", "Needs review"].includes(c.status),
    ) &&
    activeChecks.length
      ? Math.min(...allowanceChecks.map((c) => c.remaining))
      : null;
  return {
    breachSlots,
    workWindows: supported ? workWindows : [],
    checks: ["AFM", "ACH"].includes(profile.scheme) ? [] : checks,
    issues: [...new Set(issues)],
    days,
    lastWork: lastWorkRun
      ? `${label(cells[lastWorkRun.start])} — ${label(cells[lastWorkRun.end])} · ${minutesLabel((lastWorkRun.end - lastWorkRun.start) * 15)}`
      : "No completed work established",
    majorRest: lastMajor
      ? `${label(cells[lastMajor.start])} · ${minutesLabel((lastMajor.end - lastMajor.start) * 15)}`
      : "Not established",
    nightRests: recentNights.length,
    longNight,
    workSince24,
    nextBreak,
    controlling,
    source: RULE_SOURCE,
    version: RULE_VERSION,
  };
}

/** The assessed part of this counting period; future time earns no rest credit. */
export function windowTotals(_s: Workspace, window: WorkWindow) {
  const start = Date.parse(window.start.replace(" ", "T") + ":00Z");
  const end = Date.parse(window.end.replace(" ", "T") + ":00Z");
  const through = Date.parse(window.assessedThrough.replace(" ", "T") + ":00Z");
  const work = window.work,
    rest = window.rest,
    unknown = Math.max(0, (through - start) / 60000 - work - rest),
    future = Math.max(0, (end - through) / 60000),
    review = window.review;
  return { work, rest, unknown, future, review };
}
export function selectWorkWindow(windows: WorkWindow[], date: string) {
  return windows
    .filter((w) => w.start.slice(0, 10) <= date && w.end > date + " 00:00")
    .sort(
      (a, b) =>
        Number(b.status === "Exceeded") - Number(a.status === "Exceeded") ||
        a.remaining - b.remaining ||
        Number(b.established) - Number(a.established) ||
        b.start.localeCompare(a.start),
    )[0];
}
