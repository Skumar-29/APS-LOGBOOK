import type { Profile } from "./model";
import { modeTable } from "./modes";
import type { PeriodRule } from "./modes/types";
export type { PeriodRule } from "./modes/types";

export const RULE_VERSION = "NHVR-2026-11-15-v8";
export const REVIEW_DATE = "15 November 2026";
export const RULE_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time";
export const HOURS_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours";
export const DIARY_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-diary";
export const LAW_SOURCE = "https://www.legislation.qld.gov.au/view/whole/html/inforce/2026-08-01/sl-2013-0078";
export const LONG_NIGHT_LIMIT=36*60;
export const BFM_84_LIMIT=84*60;

/** Source-derived rules are defined independently per driving mode. */
export function tableFor(p: Pick<Profile, "scheme" | "twoUp">): PeriodRule[] {
  return modeTable(p);
}

export function operatingRules(p: Profile) {
  return p.operation || (["WA","NT"].includes(p.base) ? "unknown" : "HVNL");
}

export function restRequirement(r:PeriodRule,p:Pick<Profile,"scheme"|"twoUp">) {
  const amount=(n:number)=>n%60===0 ? `${n/60}h` : `${n}m`;
  if(r.type==="breaks") return r.rest===15 ? "15m continuous" : `${amount(r.rest)} total, breaks ≥15m`;
  if(r.type==="weekly") return "24h continuous + another 24h in stationary breaks ≥7h";
  if(r.type==="nights") return `${p.scheme==="BFM"&&!p.twoUp?"Two 24h stationary rests + ":""}4 night rests${p.scheme==="BFM"&&p.twoUp?"":", including a consecutive pair"}`;
  if(r.type==="stationary-or-sleeper") return `${amount(r.rest)} continuous, stationary or approved moving sleeper`;
  return r.rest ? `${amount(r.rest)} continuous stationary rest` : "No minimum set for this period";
}
