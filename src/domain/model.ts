export type Activity = "work" | "rest" | null;
export type RestType = "stationary" | "sleeper-moving" | "unknown";
export type Scheme = "Standard" | "BFM" | "AFM" | "ACH";
export interface Profile {
  id: string;
  name: string;
  licence: string;
  licenceExpiry: string;
  contact: string;
  base: string;
  zone: string;
  scheme: Scheme;
  twoUp: boolean;
  coDriver: string;
  coLicence: string;
  coScheme: Scheme;
  coBase: string;
  operator: string;
  certificate: string;
  certificateExpiry: string;
  recordKeeper: string;
  recordAddress: string;
  effectiveFrom: string;
  signature: string;
  logo: string;
  [key: string]: unknown;
}
export interface Change {
  slot: number;
  location: string;
  odometer: string;
  restType: RestType;
  note: string;
  vehicle: string;
  [key: string]: unknown;
}
export interface Day {
  date: string;
  slots: Activity[];
  changes: Record<string, Change>;
  profile: Profile;
  vehicle: string;
  comments: string;
  revision: number;
  review: boolean;
  clockReview: boolean;
  submittedAt: string;
  pagePhoto: string;
  [key: string]: unknown;
}
export interface PaperPage {
  id: string;
  bookId: string;
  number: string;
  date: string;
  status: "Active" | "Cancelled" | "Skipped" | "Closed";
  reason: string;
  snapshot?: Day;
  replaces?: string;
  [key: string]: unknown;
}
export interface Book {
  id: string;
  number: string;
  firstDate: string;
  firstPage: string;
  closed: boolean;
  [key: string]: unknown;
}
export interface Timer {
  id: string;
  kind: Exclude<Activity, null>;
  start: number;
  zone: string;
  vehicle: string;
  restType: RestType;
  profile: Profile;
}
export interface Registry {
  id: string;
  name: string;
  type: "vehicle" | "driver";
  details: Record<string, string>;
}
export interface InvoiceRow {
  id: string;
  loadDate: string;
  from: string;
  to: string;
  type: string;
  odoStart: string;
  odoFinish: string;
  km: string;
  rate: string;
  fixedAmount: string;
  amount: string;
  manualAmount: boolean;
  sourceId?: string;
  sourceRevision?: string;
  [key: string]: unknown;
}
export interface MiscRow {
  id: string;
  date: string;
  item: string;
  quantity: string;
  rate: string;
  amount: string;
  manualAmount: boolean;
  [key: string]: unknown;
}
export interface Invoice {
  id: string;
  invoiceNo: string;
  nameSg: string;
  billTo: string;
  mobile: string;
  email: string;
  bsb: string;
  accountNo: string;
  abnAcn: string;
  dateFrom: string;
  dateTo: string;
  yellowDate: string;
  loads: InvoiceRow[];
  misc: MiscRow[];
  notes: string;
  status: "Draft" | "Issued";
  revision: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
export interface InvoiceSettings {
  profile: Record<string, string>;
  nextInvoiceNo: number;
  types: string[];
  cities: string[];
  miscItems: string[];
  typeRates: Record<string, string>;
  miscItemRates: Record<string, string>;
  [key: string]: unknown;
}
export interface FormRecord {
  id: string;
  driverId: string;
  values: Record<string, string>;
  checks: Record<string, Record<string, string>>;
  declarations: Record<string, string>;
  company: string;
  logo: string;
  showCompany: boolean;
  showLogo: boolean;
  signature: string;
  signedName: string;
  reviewed: boolean;
  status: "Draft" | "Signed";
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface SavedDocument {
  id: string;
  title: string;
  category: string;
  filename: string;
  mime: string;
  size: number;
  hash: string;
  addedAt: string;
  expiry: string;
  pinned: boolean;
  /** Present only during upload/backup import; device storage separates file bytes. */
  data?: string;
}
export interface Note {
  sealed?: string;
  id: string;
  title: string;
  body: string;
  rows: string[][];
  tags: string;
  favourite: boolean;
  private: boolean;
  updatedAt: string;
}
export interface Audit {
  id: string;
  at: string;
  action: string;
  recordId: string;
  before?: unknown;
  after?: unknown;
}
export interface Workspace {
  app: "Truck Workspace";
  schema: 2;
  revision: number;
  onboarded: boolean;
  profile: Profile;
  profileHistory: Profile[];
  days: Record<string, Day>;
  pages: PaperPage[];
  books: Book[];
  timer: Timer | null;
  activities: Array<Timer & { end: number }>;
  registry: Registry[];
  invoices: Invoice[];
  invoiceSettings: InvoiceSettings;
  forms: FormRecord[];
  notes: Note[];
  documents: SavedDocument[];
  places: string[];
  routeMap: Record<string, string>;
  audit: Audit[];
  imports: Array<{ id: string; at: string; source: string; raw: unknown }>;
  settings: {
    theme: "system" | "light" | "dark";
    fullDay: boolean;
    diaryLayoutVersion?: number;
    locationPicker: boolean;
    autoPages: boolean;
    backupDays: number;
    lastBackup: string;
    ruleReviewAcknowledged: boolean;
  };
  legacy?: Record<string, unknown>;
}
export const uid = () => crypto.randomUUID();
export const clone = <T>(v: T): T => structuredClone(v);
export const zones: Record<string, string> = {
  ACT: "Australia/Sydney",
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  WA: "Australia/Perth",
  NT: "Australia/Darwin",
  TAS: "Australia/Hobart",
};
export function emptyProfile(): Profile {
  return {
    id: uid(),
    name: "",
    licence: "",
    licenceExpiry: "",
    contact: "",
    base: "NSW",
    zone: zones.NSW,
    scheme: "Standard",
    twoUp: false,
    coDriver: "",
    coLicence: "",
    coScheme: "Standard",
    coBase: "",
    operator: "",
    certificate: "",
    certificateExpiry: "",
    recordKeeper: "",
    recordAddress: "",
    effectiveFrom: "",
    signature: "",
    logo: "",
  };
}
export function emptyState(): Workspace {
  return {
    app: "Truck Workspace",
    schema: 2,
    revision: 0,
    onboarded: false,
    profile: emptyProfile(),
    profileHistory: [],
    days: {},
    pages: [],
    books: [],
    timer: null,
    activities: [],
    registry: [],
    invoices: [],
    invoiceSettings: {
      profile: {},
      nextInvoiceNo: 1,
      types: ["BD", "RT", "BT", "AB", "C/O"],
      cities: ["MEL", "BNE", "SYD", "ADL", "PER", "DAR", "HOB", "CBR"],
      miscItems: ["Pick-up", "Delivery", "Waiting"],
      typeRates: {},
      miscItemRates: {},
    },
    forms: [],
    notes: [],
    documents: [],
    places: [],
    routeMap: {},
    audit: [],
    imports: [],
    settings: {
      theme: "system",
      fullDay: true,
      diaryLayoutVersion: 1,
      locationPicker: true,
      autoPages: true,
      backupDays: 0,
      lastBackup: "",
      ruleReviewAcknowledged: false,
    },
  };
}
export function profileOn(s: Workspace, date: string) {
  return (
    [...s.profileHistory, s.profile]
      .filter((p) => !p.effectiveFrom || p.effectiveFrom <= date)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
      .at(-1) || s.profile
  );
}
export function recordProfile(p: Profile): Profile {
  return { ...clone(p), signature: "", logo: "" };
}
export function emptyDay(s: Workspace, date: string): Day {
  return {
    date,
    slots: Array(96).fill(null),
    changes: {},
    profile: recordProfile(profileOn(s, date)),
    vehicle: s.registry.find((r) => r.type === "vehicle")?.name || "",
    comments: "",
    revision: 0,
    review: false,
    clockReview: false,
    submittedAt: "",
    pagePhoto: "",
  };
}
export function ensureDay(s: Workspace, date: string) {
  return s.days[date] ?? (s.days[date] = emptyDay(s, date));
}
function compact(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:"))
    return `[image asset: ${value.length} characters]`;
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, compact(v)]),
    );
  return value;
}
function delta(a: unknown, b: unknown): [unknown, unknown] {
  if (a && b && typeof a === "object" && typeof b === "object") {
    const before: Record<string, unknown> = {},
      after: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = (a as any)[k],
        y = (b as any)[k];
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      const [old, next] = delta(x, y);
      before[k] = old;
      after[k] = next;
    }
    return [before, after];
  }
  return [compact(a), compact(b)];
}
export function audit(
  s: Workspace,
  action: string,
  recordId: string,
  before?: unknown,
  after?: unknown,
) {
  const [a, b] = delta(before, after);
  s.audit.push({
    id: uid(),
    at: new Date().toISOString(),
    action,
    recordId,
    before: a,
    after: b,
  });
}

/** Additive migration: keep all v2 records and their IDs intact. */
export function upgradeWorkspace(s: Workspace): Workspace {
  s.documents ||= [];
  if (!s.settings.diaryLayoutVersion) {
    s.settings.fullDay = true;
    s.settings.diaryLayoutVersion = 1;
  }
  return s;
}
