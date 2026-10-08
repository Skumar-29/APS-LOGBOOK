import { readDocumentData } from "../storage";
import {
  validateDocument,
  fileHash,
  decodeDocument,
  MAX_DOCUMENT_TOTAL,
} from "./documents";
import {
  audit,
  clone,
  emptyState,
  ensureDay,
  uid,
  zones,
  upgradeWorkspace,
  type Workspace,
  type Profile,
  type Invoice,
  type PaperPage,
} from "./model";
import { dateAdd, parseSlot, validDate } from "./time";
import { normalizePage } from "./diary";
import { blankLoad, blankMisc } from "./invoices";
type Obj = Record<string, any>;
function safe(value: any, depth = 0): any {
  if (depth > 40) throw Error("Backup is too deeply nested.");
  if (Array.isArray(value)) {
    if (value.length > 1000000) throw Error("Backup array is too large.");
    return value.map((v) => safe(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(k))
        throw Error("Unsupported backup field.");
      out[k] = safe(v, depth + 1);
    }
    return out;
  }
  return value;
}
export async function digest(text: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function exportBackup(state: Workspace) {
  const documents = await Promise.all(
    (state.documents || []).map(async (d) => ({
      ...d,
      data: d.data || (await readDocumentData(d.hash)),
    })),
  );
  const payload = JSON.stringify({ ...state, documents });
  return JSON.stringify({
    format: "truck-workspace-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    sha256: await digest(payload),
    payload,
  });
}
export function validateState(s: Workspace) {
  if (
    s.app !== "Truck Workspace" ||
    s.schema !== 2 ||
    !s.profile ||
    !s.settings ||
    !s.invoiceSettings ||
    !s.days ||
    !s.routeMap ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0
  )
    throw Error("Unsupported combined backup.");
  upgradeWorkspace(s);
  if (
    !Array.isArray(s.documents) ||
    s.documents.reduce((n, d) => n + d.size, 0) > MAX_DOCUMENT_TOTAL
  )
    throw Error("Invalid document storage size.");
  s.documents.forEach(validateDocument);
  if (new Set(s.documents.map((d) => d.id)).size !== s.documents.length)
    throw Error("Duplicate document IDs.");
  const text = (v: unknown) => typeof v === "string";
  const asset = (v: unknown) =>
    v === "" ||
    (typeof v === "string" &&
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v));
  const profile = (p: Profile) => {
    if (
      !p ||
      !text(p.id) ||
      !text(p.name) ||
      !text(p.licence) ||
      !["Standard", "BFM", "AFM", "ACH"].includes(p.scheme) ||
      !asset(p.signature) ||
      !asset(p.logo)
    )
      throw Error("Invalid driver profile.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: p.zone });
    } catch {
      throw Error("Invalid driver time zone.");
    }
  };
  for (const k of [
    "profileHistory",
    "pages",
    "books",
    "activities",
    "registry",
    "invoices",
    "forms",
    "notes",
    "places",
    "audit",
    "imports",
  ] as const)
    if (!Array.isArray(s[k])) throw Error("Invalid " + k);
  profile(s.profile);
  s.profileHistory.forEach(profile);
  for (const [key, d] of Object.entries(s.days)) {
    if (
      !validDate(key) ||
      d.date !== key ||
      !Array.isArray(d.slots) ||
      d.slots.length !== 96 ||
      d.slots.some((v) => !["work", "rest", null].includes(v)) ||
      !d.changes ||
      !asset(d.pagePhoto)
    )
      throw Error("Invalid diary on " + key);
    profile(d.profile);
    for (const c of Object.values(d.changes))
      if (
        !Number.isInteger(c.slot) ||
        c.slot < 0 ||
        c.slot > 96 ||
        !text(c.location) ||
        !text(c.odometer) ||
        !["stationary", "sleeper-moving", "unknown"].includes(c.restType)
      )
        throw Error("Invalid work/rest change.");
  }
  if (s.timer) {
    if (
      !Number.isFinite(s.timer.start) ||
      !["work", "rest"].includes(s.timer.kind) ||
      !s.timer.profile
    )
      throw Error("Invalid active timer.");
    profile(s.timer.profile);
  }
  for (const p of s.pages)
    if (
      !p.id ||
      !validDate(p.date) ||
      !normalizePage(p.number) ||
      !s.books.some((b) => b.id === p.bookId) ||
      !["Active", "Cancelled", "Skipped", "Closed"].includes(p.status)
    )
      throw Error("Invalid page record.");
  for (const k of [
    "pages",
    "books",
    "invoices",
    "forms",
    "notes",
    "registry",
  ] as const)
    if (new Set(s[k].map((x) => x.id)).size !== s[k].length)
      throw Error("Duplicate " + k + " IDs.");
  for (const n of s.notes)
    if (
      !text(n.title) ||
      !text(n.body) ||
      !text(n.tags) ||
      !Array.isArray(n.rows) ||
      n.rows.some((r) => !Array.isArray(r) || r.some((c) => !text(c))) ||
      (n.sealed !== undefined && !text(n.sealed))
    )
      throw Error("Invalid note.");
  for (const i of s.invoices)
    if (
      !i.id ||
      !text(i.invoiceNo) ||
      !text(i.billTo) ||
      !text(i.updatedAt) ||
      !["Draft", "Issued"].includes(i.status) ||
      !Array.isArray(i.loads) ||
      !Array.isArray(i.misc)
    )
      throw Error("Invalid invoice.");
  for (const f of s.forms)
    if (
      !f.id ||
      !f.values ||
      !f.checks ||
      !f.declarations ||
      !asset(f.signature) ||
      !asset(f.logo) ||
      !["Draft", "Signed"].includes(f.status) ||
      !Object.values(f.values).every(text)
    )
      throw Error("Invalid driving form.");
  for (const k of ["types", "cities", "miscItems"] as const)
    if (
      !Array.isArray(s.invoiceSettings[k]) ||
      !s.invoiceSettings[k].every(text)
    )
      throw Error("Invalid invoice settings.");
  return s;
}

function legacyProfile(raw: Obj, base: Profile): Profile {
  return {
    ...base,
    ...raw,
    name: String(raw.driverName ?? raw.name ?? base.name),
    licence: String(raw.licenceNumber ?? raw.licence ?? base.licence),
    base: String(raw.baseTimeZone ?? raw.base ?? base.base),
    zone: zones[raw.baseTimeZone ?? raw.base] || raw.zone || base.zone,
  };
}
function importDiary(raw: Obj) {
  const s = emptyState();
  if (!raw.slots && !raw.slotsCompact && !raw.dayDetails)
    throw Error("No diary records found.");
  s.onboarded = true;
  s.profile = legacyProfile(raw.profile || {}, s.profile);
  s.profile.scheme = raw.scheme || "BFM";
  s.legacy = clone(raw);
  const bookSettings = raw.bookSettings || {};
  function book(
    number: string,
    firstDate = "",
    firstPage = "1",
    extra: Obj = {},
  ) {
    let b = s.books.find((b) => b.number === number);
    if (!b) {
      b = {
        ...extra,
        id: uid(),
        number,
        firstDate,
        firstPage,
        closed: Boolean(
          extra.endDate || extra.closed || extra.status === "closed",
        ),
      };
      s.books.push(b);
    }
    return b;
  }
  for (const b of raw.diaryBooks || [])
    book(
      String(b.diaryNo || b.workDiaryNo || b.number || ""),
      b.startDate || b.firstPageDate || "",
      String(b.firstPageNumber || b.firstPageNo || "1"),
      b,
    );
  if (bookSettings.defaultWorkDiaryNo)
    book(
      bookSettings.defaultWorkDiaryNo,
      bookSettings.firstPageDate || "",
      String(bookSettings.firstPageNumber || "1"),
    );
  s.profileHistory = (raw.settingsHistory || [])
    .map((h: Obj) => ({
      ...legacyProfile(h.profile || h, s.profile),
      effectiveFrom: h.effectiveDate || h.fromDate || h.date || "",
      id: uid(),
    }))
    .filter((p: Profile) => validDate(p.effectiveFrom));
  const slots = { ...raw.slotsCompact, ...raw.slots },
    keys = [
      ...new Set([...Object.keys(slots), ...Object.keys(raw.dayDetails || {})]),
    ].sort();
  const historyDates = [
    ...(raw.settingsHistory || []).map((x: Obj) => x.effectiveDate),
    ...(raw.ruleHistory || []).map((x: Obj) => x.effectiveDate),
  ].filter((x: string) => validDate(x));
  for (const date of [...new Set(historyDates)].sort()) {
    const setting =
      (raw.settingsHistory || [])
        .filter((x: Obj) => x.effectiveDate <= date)
        .sort((a: Obj, b: Obj) =>
          a.effectiveDate.localeCompare(b.effectiveDate),
        )
        .at(-1) || {};
    const rule =
      (raw.ruleHistory || [])
        .filter((x: Obj) => x.effectiveDate <= date)
        .sort((a: Obj, b: Obj) =>
          a.effectiveDate.localeCompare(b.effectiveDate),
        )
        .at(-1) || {};
    const p = legacyProfile(setting, s.profile);
    p.effectiveFrom = date;
    p.scheme = rule.scheme || raw.scheme || "BFM";
    p.twoUp = rule.mode === "twoUp";
    p.coScheme = rule.coDriverScheme || "Standard";
    s.profileHistory = s.profileHistory.filter((p) => p.effectiveFrom !== date);
    s.profileHistory.push(p);
  }
  if (keys.length) {
    const first = [
        keys[0],
        raw.calculationHistory?.startDate,
        ...s.books.map((b) => b.firstDate),
      ]
        .filter(validDate)
        .sort()[0],
      last = [keys.at(-1), raw.selectedDate].filter(validDate).sort().at(-1)!;
    const count = Math.round((Date.parse(last) - Date.parse(first)) / 86400000);
    if (count >= 0 && count <= 3660)
      for (let i = 0; i <= count; i++) {
        const date = dateAdd(first, i);
        if (!keys.includes(date)) keys.push(date);
      }
    keys.sort();
  }

  for (const date of keys) {
    if (!validDate(date)) throw Error("Invalid diary date " + date);
    const d = ensureDay(s, date),
      detail = raw.dayDetails?.[date] || {};
    const a = slots[date];
    if (a !== undefined && !(Array.isArray(a) || typeof a === "string"))
      throw Error("Invalid blocks on " + date);
    if (a && a.length > 96) throw Error("Too many blocks on " + date);
    d.slots = Array.from({ length: 96 }, (_, i) => {
      const x = a?.[i];
      if (["W", "w", 1, true, "work", "1"].includes(x)) return "work";
      if (["R", "r", 0, false, "rest", "0", undefined, null, ""].includes(x))
        return "rest";
      throw Error("Invalid block value on " + date);
    });
    const historical = clone(
      [...s.profileHistory]
        .filter((p) => p.effectiveFrom <= date)
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
        .at(-1) || s.profile,
    );
    d.profile = legacyProfile(
      {
        driverName: detail.driverNameSnapshot || historical.name,
        licenceNumber: detail.licenceNumberSnapshot || historical.licence,
        baseTimeZone: detail.baseStateSnapshot || historical.base,
      },
      historical,
    );
    d.profile.scheme = detail.ruleScheme || historical.scheme;
    d.profile.twoUp =
      detail.twoUpEnabled === undefined
        ? historical.twoUp
        : Boolean(detail.twoUpEnabled);
    d.profile.coDriver = detail.twoUpDriverName || "";
    d.profile.coLicence = detail.twoUpLicenceNumber || "";
    d.profile.coScheme = detail.twoUpScheme || "BFM";
    d.profile.coBase = detail.twoUpBaseState || "";
    d.legacyAssumedRest = a === undefined;
    d.vehicle = detail.numberPlate || bookSettings.defaultNumberPlate || "";
    d.comments = detail.comments || "";
    d.dailyCheckTime = detail.dailyCheckTime || "";
    d.fitForDuty = !!detail.fitForDuty;
    d.review = true;
    d.legacyDetails = clone(detail);
    for (const c of detail.changeRows || []) {
      const slot = c.time === "24:00" ? 96 : parseSlot(c.time || "00:00");
      d.changes[slot] = {
        ...c,
        slot,
        location: String(c.location || ""),
        odometer: String(c.odometer || ""),
        note: c.note || "",
        vehicle: c.numberPlate || d.vehicle,
        restType: /stationary/i.test(c.restType)
          ? "stationary"
          : /sleeper|moving/i.test(c.restType)
            ? "sleeper-moving"
            : raw.restAsStationary !== false
              ? "stationary"
              : "unknown",
      };
    }
    if (!d.changes[0] && d.slots[0] === "rest")
      d.changes[0] = {
        slot: 0,
        location: "",
        odometer: "",
        note: "Imported rest assumption — verify",
        vehicle: d.vehicle,
        restType: raw.restAsStationary !== false ? "stationary" : "unknown",
      };
    let b = s.books.find(
      (b) =>
        (!b.firstDate || b.firstDate <= date) &&
        (!b.endDate || String(b.endDate) >= date),
    );
    if (detail.workDiaryNo) b = book(detail.workDiaryNo, date);
    b ||= s.books[0];
    let number = String(detail.pageNo || "");
    if (!number && b && detail.usePage) {
      const used = s.pages.filter((p) => p.bookId === b!.id).length;
      number = String(BigInt(normalizePage(b.firstPage) || "1") + BigInt(used));
    }
    if (number && b) {
      const page: PaperPage = {
        id: uid(),
        bookId: b.id,
        number,
        date,
        status:
          detail.pageStatus === "cancelled"
            ? "Cancelled"
            : detail.pageStatus === "skipped"
              ? "Skipped"
              : "Active",
        reason: detail.pageStatusReason || "",
      };
      if (page.status !== "Active") page.snapshot = clone(d);
      s.pages.push(page);
    }
  }
  for (const [type, records] of [
    ["vehicle", raw.vehicles || []],
    ["driver", raw.savedDrivers || []],
  ] as const)
    for (const r of records)
      s.registry.push({
        id: r.id || uid(),
        type,
        name: String(r.numberPlate || r.rego || r.driverName || r.name || ""),
        details: Object.fromEntries(
          Object.entries(r).map(([k, v]) => [k, String(v ?? "")]),
        ),
      });
  s.settings.theme = ["light", "dark"].includes(raw.uiSettings?.themeMode)
    ? raw.uiSettings.themeMode
    : "system";
  s.settings.locationPicker = raw.uiSettings?.locationPickerEnabled !== false;
  s.settings.autoPages = bookSettings.autoPageNumber !== false;
  s.settings.backupDays =
    ({ daily: 1, weekly: 7, monthly: 30 } as Obj)[
      raw.backupReminder?.frequency
    ] || 0;
  s.settings.lastBackup = raw.backupReminder?.lastBackupAt || "";
  s.places = [
    ...new Set(
      Object.values(s.days).flatMap((d) =>
        Object.values(d.changes)
          .map((c) => c.location)
          .filter(Boolean),
      ),
    ),
  ];
  return s;
}
function importInvoices(raw: Obj) {
  const b = raw.state || raw;
  if (!b.settings || !Array.isArray(b.invoices))
    throw Error("Not a truck invoice backup.");
  const s = emptyState();
  s.invoiceSettings = {
    ...s.invoiceSettings,
    ...b.settings,
    profile: { ...b.settings.profile },
  };
  s.invoices = b.invoices.map((i: Obj) => {
    if (!i.id || !Array.isArray(i.loads) || !Array.isArray(i.misc))
      throw Error("Invalid invoice record.");
    return {
      ...i,
      status: i.status || "Draft",
      invoiceNo: String(i.invoiceNo || ""),
      billTo: String(i.billTo || ""),
      createdAt: i.createdAt || new Date().toISOString(),
      updatedAt: i.updatedAt || i.createdAt || new Date().toISOString(),
      revision: i.revision || 1,
      loads: i.loads.map((r: Obj) => ({ ...blankLoad(), ...r })),
      misc: i.misc.map((r: Obj) => ({ ...blankMisc(), ...r })),
    } as Invoice;
  });
  return s;
}
export interface ImportPlan {
  state: Workspace;
  kind: "combined" | "diary" | "invoices";
  hash: string;
  source: string;
  warnings: string[];
}
export async function inspectBackup(text: string): Promise<ImportPlan> {
  if (text.length > 50 * 1024 * 1024)
    throw Error("Choose a backup smaller than 50 MB.");
  const input = safe(JSON.parse(text)),
    hash = await digest(text);
  let state: Workspace,
    kind: ImportPlan["kind"],
    warnings: string[] = [];
  if (input.format === "truck-workspace-backup") {
    if (
      input.version !== 2 ||
      typeof input.payload !== "string" ||
      (await digest(input.payload)) !== input.sha256
    )
      throw Error("Backup checksum failed. No records changed.");
    state = validateState(safe(JSON.parse(input.payload)));
    for (const d of state.documents) {
      if (!d.data || (await fileHash(decodeDocument(d.data))) !== d.hash)
        throw Error("Document backup checksum failed. No records changed.");
    }
    kind = "combined";
  } else if (
    input.app === "Invoice Generator" ||
    input.state?.invoices ||
    (input.invoices && input.settings)
  ) {
    state = importInvoices(input);
    kind = "invoices";
  } else {
    state = importDiary(input);
    kind = "diary";
    warnings.push(
      "Imported records require review. Blank dates inside the saved history retain the old app’s assumed-rest interpretation and are marked for checking; dates outside that history remain unrecorded.",
    );
    if (input.activeTimer)
      warnings.push(
        "The old active timer is preserved in the original import for review; it has not been restarted.",
      );
  }
  validateState(state);
  return {
    state,
    kind,
    hash,
    source: String(input.app || input.format || "Legacy diary"),
    warnings,
  };
}
export function applyImport(
  current: Workspace,
  plan: ImportPlan,
  replace = false,
): Workspace {
  if (current.imports.some((i) => i.id === plan.hash))
    throw Error("This exact backup has already been imported.");
  if (current.timer && plan.kind !== "invoices")
    throw Error("Finish the active timer before importing diary records.");
  let s = clone(current);
  const conflicts = new Set(
    Object.keys(current.days).filter((k) => !!plan.state.days[k]),
  );
  if (replace) {
    if (plan.kind === "combined") s = clone(plan.state);
    else if (plan.kind === "diary") {
      for (const k of [
        "profile",
        "profileHistory",
        "days",
        "pages",
        "books",
        "timer",
        "activities",
        "registry",
        "places",
        "legacy",
      ] as const)
        (s as any)[k] = clone(plan.state[k]);
    } else {
      s.invoices = clone(plan.state.invoices);
      s.invoiceSettings = clone(plan.state.invoiceSettings);
    }
  } else {
    const hadInvoices = s.invoices.length > 0;
    for (const [k, d] of Object.entries(plan.state.days))
      if (!s.days[k]) s.days[k] = clone(d);
    const bookMap = new Map<string, string>();
    for (const book of plan.state.books) {
      const old = s.books.find(
        (b) => b.id === book.id || b.number === book.number,
      );
      if (old) bookMap.set(book.id, old.id);
      else {
        s.books.push(clone(book));
        bookMap.set(book.id, book.id);
      }
    }
    for (const page of plan.state.pages) {
      const p = {
        ...clone(page),
        bookId: bookMap.get(page.bookId) || page.bookId,
      };
      if (
        !conflicts.has(p.date) &&
        !s.pages.some(
          (x) =>
            x.id === p.id ||
            (x.bookId === p.bookId &&
              normalizePage(x.number) === normalizePage(p.number)),
        )
      )
        s.pages.push(p);
    }
    for (const k of ["registry", "invoices", "forms", "notes"] as const) {
      const list = s[k] as Array<{ id: string }>;
      for (const item of plan.state[k])
        if (!list.some((x) => x.id === item.id)) list.push(clone(item));
    }
    for (const document of plan.state.documents || [])
      if (
        !s.documents.some(
          (d) => d.id === document.id || d.hash === document.hash,
        )
      )
        s.documents.push(clone(document));
    s.places = [...new Set([...s.places, ...plan.state.places])];
    s.routeMap = { ...plan.state.routeMap, ...s.routeMap };
    if (!s.profile.name && plan.state.profile.name) {
      s.profile = clone(plan.state.profile);
      s.settings = { ...s.settings, ...plan.state.settings };
      s.profileHistory = clone(plan.state.profileHistory);
    }
    if (!hadInvoices && plan.kind !== "diary")
      s.invoiceSettings = clone(plan.state.invoiceSettings);
    else
      s.invoiceSettings.nextInvoiceNo = Math.max(
        s.invoiceSettings.nextInvoiceNo,
        plan.state.invoiceSettings.nextInvoiceNo || 1,
      );
    if (plan.state.legacy) s.legacy = clone(plan.state.legacy);
    if (plan.kind === "combined")
      for (const a of plan.state.activities)
        if (!s.activities.some((x) => x.id === a.id))
          s.activities.push(clone(a));
  }
  s.onboarded = Boolean(s.profile.name) || current.onboarded;
  s.revision = current.revision;
  s.imports = s.imports.filter((i) => i.id !== plan.hash);
  s.imports.push({
    id: plan.hash,
    at: new Date().toISOString(),
    source: plan.source,
    raw:
      plan.kind === "diary"
        ? clone(plan.state.legacy)
        : plan.kind === "invoices"
          ? {
              invoiceSettings: clone(plan.state.invoiceSettings),
              invoices: clone(plan.state.invoices),
            }
          : { schema: plan.state.schema, revision: plan.state.revision },
  });
  audit(s, "Import " + plan.kind, plan.hash, undefined, {
    replace,
    days: Object.keys(plan.state.days).length,
    invoices: plan.state.invoices.length,
    keptCurrentDates: replace ? [] : [...conflicts],
  });
  return validateState(s);
}
