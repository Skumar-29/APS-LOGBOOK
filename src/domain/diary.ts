import {
  audit,
  clone,
  ensureDay,
  uid,
  recordProfile,
  type Workspace,
  type Activity,
  type Day,
  type PaperPage,
  type RestType,
} from "./model";
import {
  civil,
  clockChange,
  dateAdd,
  hhmm,
  instantFor,
  QUARTER,
  validDate,
} from "./time";
export function changeStarts(d: Day) {
  return d.slots.flatMap((k, i) =>
    k && (i === 0 || d.slots[i - 1] !== k) ? [i] : [],
  );
}
export function changes(d: Day) {
  const keys = [
    ...new Set([...changeStarts(d), ...Object.keys(d.changes).map(Number)]),
  ].filter((i) => i >= 0 && i <= 96);
  return keys
    .sort((a, b) => a - b)
    .map(
      (slot) =>
        d.changes[slot] || {
          slot,
          location: "",
          odometer: "",
          restType: "unknown" as RestType,
          note: "",
          vehicle: d.vehicle,
        },
    );
}
export function editRange(
  s: Workspace,
  date: string,
  from: number,
  to: number,
  kind: Activity,
  nextDay = false,
) {
  if (
    !validDate(date) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= 96 ||
    to < 0 ||
    to > 96 ||
    (!nextDay && to <= from)
  )
    throw Error("Check the date and time range.");
  const d = ensureDay(s, date),
    before = clone(d);
  for (let i = from; i < (nextDay ? 96 : to); i++) d.slots[i] = kind;
  d.revision++;
  d.clockReview = clockChange(date, d.profile.zone);
  audit(s, "Record " + (kind || "unrecorded"), date, before, d);
  if (nextDay && to > 0) {
    const next = ensureDay(s, dateAdd(date, 1)),
      old = clone(next);
    for (let i = 0; i < to; i++) next.slots[i] = kind;
    next.revision++;
    next.clockReview = clockChange(next.date, next.profile.zone);
    audit(s, "Overnight " + (kind || "unrecorded"), next.date, old, next);
  }
}
export const normalizePage = (v: string) =>
  /^\d+$/.test(v.replace(/\s/g, ""))
    ? v.replace(/\s/g, "").replace(/^0+(?=\d)/, "")
    : "";
export function findPage(s: Workspace, bookId: string, num: string) {
  const n = normalizePage(num);
  if (!n) throw Error("Enter a valid page number.");
  const matches = s.pages.filter(
    (p) => p.bookId === bookId && normalizePage(p.number) === n,
  );
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? "Duplicate page number. Review this book."
        : "Page not recorded in this book.",
    );
  return matches[0];
}
export function allocatePage(
  s: Workspace,
  date: string,
  bookId: string,
  number?: string,
) {
  const b = s.books.find((x) => x.id === bookId);
  if (!b || b.closed) throw Error("Choose an open diary book.");
  if (s.pages.some((p) => p.date === date && p.status === "Active"))
    throw Error(
      "This date already has an active paper page. Cancel it before allocating a replacement.",
    );
  let n = number?.trim();
  if (!n) {
    const max = s.pages
      .filter((p) => p.bookId === bookId)
      .reduce(
        (m, p) => {
          const k = normalizePage(p.number);
          return k && BigInt(k) > m ? BigInt(k) : m;
        },
        BigInt(normalizePage(b.firstPage) || "1") - 1n,
      );
    n = String(max + 1n);
  }
  if (!normalizePage(n)) throw Error("Enter a numeric page number.");
  if (
    s.pages.some(
      (p) =>
        p.bookId === bookId && normalizePage(p.number) === normalizePage(n!),
    )
  )
    throw Error("This page number already exists in the book.");
  const page: PaperPage = {
    id: uid(),
    bookId,
    number: n,
    date,
    status: "Active",
    reason: "",
  };
  s.pages.push(page);
  ensureDay(s, date);
  audit(s, "Allocate page", page.id, undefined, page);
  return page;
}
export function cancelPage(s: Workspace, pageId: string, reason: string) {
  if (!reason.trim()) throw Error("Enter a correction reason.");
  const p = s.pages.find((p) => p.id === pageId);
  if (!p) throw Error("Page not found.");
  p.snapshot = clone(ensureDay(s, p.date));
  p.status = "Cancelled";
  p.reason = reason;
  audit(s, "Cancel page", p.id, undefined, p);
}
export function finishTimer(s: Workspace, now = Date.now()) {
  const t = s.timer;
  if (!t) return;
  if (now < t.start)
    throw Error("The finish time is before the start. Check the device clock.");
  if (now - t.start > 31 * 86400000)
    throw Error(
      "Timer is over 31 days. Correct its start or finish before saving.",
    );
  const before = clone(t),
    recordedDates = new Set<string>();
  const a =
    t.kind === "work"
      ? Math.floor(t.start / QUARTER) * QUARTER
      : Math.ceil(t.start / QUARTER) * QUARTER;
  const b =
    t.kind === "work"
      ? Math.ceil(now / QUARTER) * QUARTER
      : Math.floor(now / QUARTER) * QUARTER;
  for (let instant = a; instant < b; instant += QUARTER) {
    const c = civil(instant, t.zone),
      d = ensureDay(s, c.date);
    if (!Object.keys(d.changes).length && !d.revision) {
      d.profile = clone(t.profile);
      d.vehicle = t.vehicle;
    }
    d.vehicle ||= t.vehicle;
    const i = Math.floor(c.slot);
    if (t.kind === "work" || d.slots[i] !== "work") d.slots[i] = t.kind;
    d.clockReview ||= clockChange(c.date, t.zone);
    d.revision++;
    recordedDates.add(c.date);
  }
  if (b > a) {
    const c = civil(a, t.zone),
      d = ensureDay(s, c.date),
      i = Math.floor(c.slot);
    d.changes[i] = {
      ...(d.changes[i] || {
        slot: i,
        location: "",
        odometer: "",
        note: "",
        vehicle: t.vehicle,
      }),
      restType: t.restType,
    };
  }
  s.activities.push({ ...t, end: now });
  s.timer = null;
  if (s.settings.autoPages)
    for (const date of recordedDates) {
      if (s.pages.some((p) => p.date === date && p.status === "Active"))
        continue;
      const book = s.books
        .filter((b) => !b.closed && b.firstDate <= date)
        .at(-1);
      if (book) allocatePage(s, date, book.id);
    }
  audit(s, "Finish " + t.kind, t.id, before, { end: now });
}
export function switchTimer(
  s: Workspace,
  kind: "work" | "rest" | null,
  vehicle: string,
  restType: RestType = "unknown",
  now = Date.now(),
) {
  if (s.timer?.kind === kind) return;
  finishTimer(s, now);
  if (kind) {
    s.timer = {
      id: uid(),
      kind,
      start: now,
      zone: s.profile.zone,
      vehicle,
      restType,
      profile: recordProfile(s.profile),
    };
    audit(s, "Start " + kind, s.timer.id, undefined, s.timer);
  }
}
export function correctTimerStart(s: Workspace, local: string, occurrence = 0) {
  if (!s.timer) return;
  const times = instantFor(local.slice(0, 10), local.slice(11), s.timer.zone);
  if (!times.length)
    throw Error("This local time does not exist. Check daylight saving time.");
  if (times.length > 1 && occurrence < 0)
    throw Error("Choose the first or second occurrence of this time.");
  const chosen = times.length === 1 ? times[0] : times[occurrence];
  if (chosen === undefined)
    throw Error("Choose a valid occurrence of this time.");
  if (chosen > Date.now()) throw Error("Start time cannot be in the future.");
  const before = clone(s.timer);
  s.timer.start = chosen;
  audit(s, "Correct timer start", s.timer.id, before, s.timer);
}
export function diaryCsv(s: Workspace, from: string, to: string) {
  const rows = [
    [
      "Date",
      "Book",
      "Page",
      "Time",
      "Activity",
      "Location",
      "Odometer",
      "Rest type",
      "Vehicle",
      "Driver",
      "Comments",
    ],
  ];
  for (const d of Object.values(s.days)
    .filter((x) => x.date >= from && x.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const p = s.pages.find((p) => p.date === d.date && p.status === "Active");
    for (const c of changes(d))
      rows.push([
        d.date,
        s.books.find((b) => b.id === p?.bookId)?.number || "",
        p?.number || "",
        hhmm(c.slot),
        d.slots[c.slot] || "unrecorded",
        c.location,
        c.odometer,
        c.restType,
        c.vehicle,
        d.profile.name,
        c.note,
      ]);
  }
  return rows
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(v)
              .replace(/^[=+@-]/, "'$&")
              .replace(/"/g, '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
