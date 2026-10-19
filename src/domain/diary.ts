import { restTypeAt } from "./rest";
import { buildTimeline, summarizeDay, atBase } from "./timeline";
import type { RuleReport } from "./rules";
import {
  audit,
  clone,
  ensureDay,
  uid,
  recordProfile,
  profileOn,
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
          restType: d.restDefault || ("unknown" as RestType),
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
  kind ||= "rest";
  const d = ensureDay(s, date),
    before = clone(d);
  for (let i = from; i < (nextDay ? 96 : to); i++) {
    if (d.timerMap) delete d.timerMap[i];
    if (d.slots[i] === "work" && kind === "rest" && d.changes[i])
      d.changes[i].restType = d.restDefault || "unknown";
    d.slots[i] = kind;
  }
  d.revision++;
  d.clockReview = clockChange(date, d.profile.zone);
  audit(s, "Record " + (kind || "unrecorded"), date, before, d);
  if (nextDay && to > 0) {
    const next = ensureDay(s, dateAdd(date, 1)),
      old = clone(next);
    for (let i = 0; i < to; i++) {
      if (next.timerMap) delete next.timerMap[i];
      if (next.slots[i] === "work" && kind === "rest" && next.changes[i])
        next.changes[i].restType = next.restDefault || "unknown";
      next.slots[i] = kind;
    }
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
/** Printed page numbers follow the dates written in the paper book, not entry order.
 * A cancelled page remains reserved but may not anchor chronology: historic
 * wrong-number corrections must not prevent allocating their proper page.
 */
export function suggestedPaperPage(s: Workspace, date: string, bookId: string): string {
  const book=s.books.find(b=>b.id===bookId);
  if(!book || book.closed) throw Error("Choose an open diary book.");
  if(!validDate(date)) throw Error("Choose a valid diary date.");
  if(book.firstDate && date<book.firstDate)
    throw Error("This date is before the diary book starts. Check the book start date.");
  const first=BigInt(normalizePage(book.firstPage)||"1");
  const pages=s.pages.filter(p=>p.bookId===bookId);
  const numbered=pages.map(p=>({p,n:BigInt(normalizePage(p.number)||"0")}));
  const anchors=numbered.filter(x=>x.p.status!=="Cancelled");
  const earlier=anchors.filter(x=>x.p.date<date).map(x=>x.n);
  const later=anchors.filter(x=>x.p.date>date).map(x=>x.n);
  const prior=earlier.length ? earlier.reduce((a,b)=>a>b?a:b) : null;
  const next=later.length ? later.reduce((a,b)=>a<b?a:b) : null;
  const lower=prior!==null&&prior>=first ? prior+1n:first;
  const sameDate=numbered.filter(x=>x.p.date===date).map(x=>x.n);
  const lastOnDate=sameDate.length?sameDate.reduce((a,b)=>a>b?a:b):null;
  // Cancelled/replaced pages normally advance the printed number. If an old
  // incorrect cancellation sits *after* the next day's page, ignore it as a
  // chronological anchor while still reserving its physical number.
  const afterCorrection=lastOnDate!==null && lastOnDate>=lower &&
    (next===null || lastOnDate+1n<next) ? lastOnDate+1n:null;
  const candidate=afterCorrection??(prior!==null?lower:next!==null?next-1n:first);
  const taken=new Set(numbered.map(x=>String(x.n)));
  if(candidate<lower || next!==null&&candidate>=next || taken.has(String(candidate)))
    throw Error("No unused paper page fits this diary date. Review the book and existing page numbers; saved pages were not changed.");
  return String(candidate);
}
export function allocatePage(
  s: Workspace,
  date: string,
  bookId: string,
  number?: string,
) {
  const b=s.books.find(x=>x.id===bookId);
  if(!b || b.closed) throw Error("Choose an open diary book.");
  if(!validDate(date)) throw Error("Choose a valid diary date.");
  if(b.firstDate && date<b.firstDate)
    throw Error("This date is before the diary book starts. Check the book start date.");
  if(s.pages.some(p=>p.date===date&&p.status==="Active"))
    throw Error("This date already has an active paper page. Cancel it before allocating a replacement.");
  const n=number?.trim()?normalizePage(number):suggestedPaperPage(s,date,bookId);
  if(!n) throw Error("Enter a numeric page number.");
  const pageNo=BigInt(n),start=BigInt(normalizePage(b.firstPage)||"1");
  if(pageNo<start) throw Error("This page is before the book's first page.");
  const sameBook=s.pages.filter(p=>p.bookId===bookId);
  if(sameBook.some(p=>normalizePage(p.number)===n))
    throw Error("This page number already exists in the book.");
  const chronological=sameBook.filter(p=>p.status!=="Cancelled");
  const earlier=chronological.filter(p=>p.date<date);
  const later=chronological.filter(p=>p.date>date);
  if(earlier.some(p=>BigInt(normalizePage(p.number))>=pageNo)
    ||later.some(p=>BigInt(normalizePage(p.number))<=pageNo))
    throw Error("Page number is out of date order. Earlier dates need lower page numbers.");
  const page: PaperPage={
    id:uid(),bookId,number:n,date,status:"Active",reason:"",
  };
  s.pages.push(page);
  ensureDay(s,date);
  audit(s,"Allocate page",page.id,undefined,page);
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
  if(now===t.start) {
    s.timer=null;
    audit(s,"Finish "+t.kind,t.id,clone(t),{end:now});
    return;
  }
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
  // Link the full footprint to exact timestamps. Grid padding earns no extra work/rest.
  for (let at=Math.floor(t.start/QUARTER)*QUARTER; at<Math.ceil(now/QUARTER)*QUARTER && now>t.start; at+=QUARTER) {
    const c=civil(at,t.zone), d=ensureDay(s,c.date), i=Math.floor(c.slot);
    d.timerMap ||= {};
    d.timerMap[i] ||= [];
    d.timerMap[i].push(t.id);
    recordedDates.add(c.date);
  }
  s.activities.push({ ...t, end: now });
  s.timer = null;
  if (s.settings.autoPages)
    for (const date of recordedDates) {
      if (!s.days[date]?.slots.includes("work") || s.pages.some((p) => p.date === date && p.status === "Active"))
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
  if (s.timer?.kind === kind && (kind !== "rest" || s.timer.restType === restType)) return;
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
/** Exact assessed intervals and counted totals, shared with Diary and Stats. */
/** CSV contains only elapsed work/rest records and unrecorded history. */
export function diaryCsv(s: Workspace, from: string, to: string, report?: RuleReport) {
  if (!validDate(from) || !validDate(to) || from>to) throw Error("Check export dates.");
  const timeline=report ? null : buildTimeline(s,to+"T24:00");
  const rows: Array<Array<string|number>> = [[
    "Date","Book","Page","From","To","Activity","Location","Odometer","Rest type",
    "Vehicle","Driver","Comments","Interval work minutes","Interval rest minutes",
    "Day work minutes","Day rest minutes","Unrecorded minutes","Counted through",
    "Hours option","Company","Accreditation"
  ]];
  for (let date=from;date<=to;date=dateAdd(date,1)) {
    const d=s.days[date], profile=d?.profile || profileOn(s,date);
    const summary=report?.days.find(x=>x.date===date) || (timeline&&summarizeDay(timeline,date,profile));
    if(!summary) throw Error("Refresh hours before exporting.");
    const page=s.pages.find(p=>p.date===date&&p.status==="Active"),book=s.books.find(b=>b.id===page?.bookId);
    rows.push([
      date,book?.number || "",page?.number || "","","Daily total","","","","",
      d?.vehicle || "",profile.name,"",0,0,summary.work,summary.rest,summary.unknown,
      summary.through,profile.scheme,profile.operator,profile.certificate
    ]);
    for (const f of summary.fragments) {
      const c=d&&changes(d).filter(c=>c.slot<=f.startSlot).at(-1);
      rows.push([
        date,book?.number || "",page?.number || "",atBase(f.start,profile.zone),atBase(f.end,profile.zone),
        f.kind || "unrecorded",c?.location || "",c?.odometer || "",
        f.kind==="rest"?f.rest:"",c?.vehicle || d?.vehicle || "",profile.name,c?.note || "",
        f.work,f.restMinutes,"","", "",summary.through,f.profile.scheme,f.profile.operator,f.profile.certificate
      ]);
    }
  }
  return rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(",")).join("\r\n");
}
