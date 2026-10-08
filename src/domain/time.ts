import type { Activity } from "./model";
export const MINUTE = 60000,
  QUARTER = 900000,
  DAY = 86400000;
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s + "T12:00:00Z")) &&
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s
  );
}
export function dateAdd(date: string, n: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + n * DAY)
    .toISOString()
    .slice(0, 10);
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function civil(instant: number, zone: string) {
  const p = Object.fromEntries(
    (
      formatters.get(zone) ||
      (() => {
        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        });
        formatters.set(zone, fmt);
        return fmt;
      })()
    )
      .formatToParts(new Date(instant))
      .map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    slot: Number(p.hour) * 4 + Number(p.minute) / 15,
    serial: Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    ),
  };
}
export const today = (zone: string) => civil(Date.now(), zone).date;
export function instantFor(date: string, time: string, zone: string): number[] {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return [];
  const target = Date.parse(date + "T" + time + ":00Z"),
    offsets = new Set<number>();
  for (const h of [-36, -12, 0, 12, 36]) {
    const t = target + h * 3600000;
    offsets.add(civil(t, zone).serial - t);
  }
  return [...offsets]
    .map((o) => target - o)
    .filter((t) => {
      const c = civil(t, zone);
      return c.date === date && c.time === time;
    })
    .sort((a, b) => a - b);
}
export function clockChange(date: string, zone: string) {
  const a = instantFor(date, "00:00", zone),
    b = instantFor(dateAdd(date, 1), "00:00", zone);
  return a.length !== 1 || b.length !== 1 || b[0] - a[0] !== DAY;
}
export function hhmm(slot: number) {
  return `${String(Math.floor(slot / 4)).padStart(2, "0")}:${String((slot % 4) * 15).padStart(2, "0")}`;
}
export function minutesLabel(n: number) {
  return `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, "0")}m`;
}
export function parseSlot(value: string) {
  if (!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(value))
    throw Error("Use 15-minute steps.");
  return Number(value.slice(0, 2)) * 4 + Number(value.slice(3)) / 15;
}
export function totals(slots: Activity[], end = 96) {
  const x = slots.slice(0, end);
  const work = x.filter((v) => v === "work").length * 15,
    rest = x.filter((v) => v === "rest").length * 15;
  return { work, rest, unknown: x.length * 15 - work - rest };
}
export function segments(slots: Activity[]) {
  const out: Array<{ start: number; end: number; kind: Activity }> = [];
  slots.forEach((kind, i) => {
    const prev = out.at(-1);
    if (prev?.kind === kind) prev.end = i + 1;
    else out.push({ start: i, end: i + 1, kind });
  });
  return out;
}

export function displayDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4)
    : value;
}
export function displayCivil(value: string) {
  return value
    .replace(/\d{4}-\d{2}-\d{2}/g, (date) => displayDate(date))
    .replace("T", " · ");
}
export function displayInstant(value: string | number, zone: string) {
  const at = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(at)) return "";
  const c = civil(at, zone);
  return displayDate(c.date) + " · " + c.time;
}
