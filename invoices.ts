import {
  clone,
  uid,
  type Invoice,
  type InvoiceRow,
  type MiscRow,
  type Workspace,
} from "./model";
import { validDate } from "./time";
export const isCO = (type: string) =>
  /(^|[^A-Z0-9])C\s*\/?\s*O([^A-Z0-9]|$)/i.test(type);
function fraction(v: string) {
  const s = String(v).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(s))
    throw Error("Enter a non-negative number with up to six decimal places.");
  const [a, b = ""] = s.split(".");
  return { n: BigInt(a + b), d: 10n ** BigInt(b.length) };
}
export function multiplyMoney(a: string, b: string) {
  const x = fraction(a),
    y = fraction(b),
    n = x.n * y.n * 100n,
    d = x.d * y.d;
  const cents = (n + d / 2n) / d;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Amount is too large.");
  return Number(cents) / 100;
}
export function moneyValue(s: string) {
  return multiplyMoney(s, "1");
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    n,
  );
export function blankLoad(): InvoiceRow {
  return {
    id: uid(),
    loadDate: "",
    from: "",
    to: "",
    type: "",
    odoStart: "",
    odoFinish: "",
    km: "",
    rate: "",
    fixedAmount: "",
    amount: "",
    manualAmount: false,
  };
}
export function blankMisc(): MiscRow {
  return {
    id: uid(),
    date: "",
    item: "",
    quantity: "",
    rate: "",
    amount: "",
    manualAmount: false,
  };
}
export function newInvoice(s: Workspace): Invoice {
  const p = s.invoiceSettings.profile;
  return {
    id: uid(),
    invoiceNo: String(s.invoiceSettings.nextInvoiceNo).padStart(2, "0"),
    nameSg: p.nameSg || s.profile.name,
    billTo: p.billTo || "",
    mobile: p.mobile || s.profile.contact,
    email: p.email || "",
    bsb: p.bsb || "",
    accountNo: p.accountNo || "",
    abnAcn: p.abnAcn || "",
    dateFrom: "",
    dateTo: "",
    yellowDate: "",
    loads: [blankLoad()],
    misc: [],
    notes: "",
    status: "Draft",
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function activeLoad(r: InvoiceRow) {
  return [
    r.loadDate,
    r.from,
    r.to,
    r.odoStart,
    r.odoFinish,
    r.km,
    r.amount,
  ].some((v) => String(v ?? "").trim() !== "");
}
export function activeMisc(r: MiscRow) {
  return [r.date, r.item, r.quantity, r.amount].some(
    (v) => String(v ?? "").trim() !== "",
  );
}
export function calculateLoad(row: InvoiceRow) {
  const r = clone(row);
  if (r.odoStart !== "" || r.odoFinish !== "") {
    if (!r.odoStart || !r.odoFinish) throw Error("Enter both odometers.");
    fraction(r.odoStart);
    fraction(r.odoFinish);
    const km =
      Number(r.odoFinish.replace(/[$,\s]/g, "")) -
      Number(r.odoStart.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(km)) throw Error("Invalid odometer.");
    if (km < 0) throw Error("Finish odometer must be at least the start.");
    r.km = String(Math.round(km * 1000) / 1000);
  }
  if (r.manualAmount) r.amount = moneyValue(r.amount).toFixed(2);
  else if (isCO(r.type))
    r.amount = moneyValue(r.fixedAmount || r.rate).toFixed(2);
  else r.amount = multiplyMoney(r.km, r.rate).toFixed(2);
  return r;
}
export function calculateMisc(row: MiscRow) {
  const r = clone(row);
  r.amount = (
    r.manualAmount ? moneyValue(r.amount) : multiplyMoney(r.quantity, r.rate)
  ).toFixed(2);
  return r;
}
export function calculateInvoice(inv: Invoice) {
  const i = clone(inv);
  i.loads = i.loads.filter(activeLoad).map(calculateLoad);
  i.misc = i.misc.filter(activeMisc).map(calculateMisc);
  const main =
      i.loads.reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0) / 100,
    misc =
      i.misc.reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0) / 100;
  return {
    invoice: i,
    main,
    misc,
    total: Math.round((main + misc) * 100) / 100,
  };
}
export function validateInvoice(i: Invoice) {
  if (!i.invoiceNo.trim() || !i.billTo.trim())
    throw Error("Enter the invoice number and Bill to.");
  if (!validDate(i.dateFrom) || !validDate(i.dateTo) || i.dateTo < i.dateFrom)
    throw Error("Check the invoice period.");
  if (!i.loads.some(activeLoad) && !i.misc.some(activeMisc))
    throw Error("Add a load or miscellaneous row.");
  for (const r of i.loads.filter(activeLoad)) {
    if (!r.from.trim() || !r.to.trim() || !validDate(r.loadDate))
      throw Error("Complete every load date and route.");
    if (r.loadDate < i.dateFrom || r.loadDate > i.dateTo)
      throw Error("A load date is outside the invoice period.");
  }
  for (const r of i.misc.filter(activeMisc)) {
    if (
      !r.item.trim() ||
      !validDate(r.date) ||
      r.date < i.dateFrom ||
      r.date > i.dateTo
    )
      throw Error("Check miscellaneous descriptions and dates.");
  }
  return calculateInvoice(i);
}
const cities: Record<string, string[]> = {
  MEL: [
    "melbourne",
    "laverton",
    "laverton north",
    "truganina",
    "tarneit",
    "derrimut",
    "altona",
    "altona north",
    "dandenong",
    "dandenong south",
    "somerton",
    "campbellfield",
    "tullamarine",
    "epping",
    "brooklyn",
  ],
  BNE: [
    "brisbane",
    "rocklea",
    "larapinta",
    "acacia ridge",
    "richlands",
    "wacol",
    "heathwood",
    "lytton",
    "port of brisbane",
    "pinkenba",
  ],
  SYD: [
    "sydney",
    "eastern creek",
    "wetherill park",
    "smithfield",
    "ingleburn",
    "minchinbury",
    "erskine park",
    "prestons",
    "chullora",
    "botany",
    "port botany",
  ],
  ADL: ["adelaide", "wingfield", "regency park", "gillman", "dry creek"],
  PER: ["perth", "kewdale", "welshpool"],
  CBR: ["canberra"],
  DAR: ["darwin"],
  HOB: ["hobart"],
};
export function cityFor(place: string, custom: Record<string, string> = {}) {
  const p = place.toLowerCase().trim().split(",")[0].trim();
  if (custom[p]) return custom[p];
  for (const [city, list] of Object.entries(cities))
    if (p === city.toLowerCase() || list.includes(p)) return city;
  return place;
}
export function tripChoices(s: Workspace, from: string, to: string) {
  return Object.values(s.days)
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) =>
      Object.values(d.changes)
        .sort((a, b) => a.slot - b.slot)
        .filter((c) => c.location || c.odometer)
        .map((c) => ({
          ...c,
          date: d.date,
          key: `${d.date}:${c.slot}`,
          revision: d.revision,
          vehicle: c.vehicle || d.vehicle,
        })),
    );
}
export function tripLoad(s: Workspace, startKey: string, endKey: string) {
  const rows = tripChoices(s, "0000-01-01", "9999-12-31"),
    a = rows.findIndex((r) => r.key === startKey),
    b = rows.findIndex((r) => r.key === endKey);
  if (a < 0 || b <= a) throw Error("Choose a finish after the start.");
  const start = rows[a],
    end = rows[b];
  if (
    new Set(
      rows
        .slice(a, b + 1)
        .map((r) => r.vehicle)
        .filter(Boolean),
    ).size > 1
  )
    throw Error(
      "Truck changed. Split the trip at that point and check odometers.",
    );
  if (!start.vehicle || !end.vehicle)
    throw Error("Add the truck registration to both diary changes.");
  fraction(start.odometer);
  fraction(end.odometer);
  if (!start.location || !end.location || !start.odometer || !end.odometer)
    throw Error("Add both locations and odometers first.");
  if (Number(end.odometer) < Number(start.odometer))
    throw Error("Check the odometer readings.");
  return {
    ...blankLoad(),
    loadDate: start.date,
    from: cityFor(start.location, s.routeMap),
    to: cityFor(end.location, s.routeMap),
    odoStart: start.odometer,
    odoFinish: end.odometer,
    km: String(Number(end.odometer) - Number(start.odometer)),
    sourceId: startKey + "|" + endKey,
    sourceRevision: rows
      .slice(a, b + 1)
      .map((r) => r.key + "@" + r.revision)
      .join("|"),
  };
}
export function invoiceCsv(i: Invoice) {
  const calc = validateInvoice(i),
    rows = [
      ["Invoice", i.invoiceNo],
      [
        "Load date",
        "From",
        "To",
        "Type",
        "Start",
        "Finish",
        "KM",
        "Rate",
        "Amount",
      ],
      ...calc.invoice.loads.map((r) => [
        r.loadDate,
        r.from,
        r.to,
        r.type,
        r.odoStart,
        r.odoFinish,
        r.km,
        isCO(r.type) ? "FIX RATE" : r.rate,
        r.amount,
      ]),
      ["Loads total", String(calc.main)],
      [],
      ["Date", "Item", "Quantity", "Rate", "Amount"],
      ...calc.invoice.misc.map((r) => [
        r.date,
        r.item,
        r.quantity,
        r.rate,
        r.amount,
      ]),
      ["Miscellaneous total", String(calc.misc)],
      ["Combined total", String(calc.total)],
      ["Notes", i.notes],
    ];
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
