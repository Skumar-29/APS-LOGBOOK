import type { Profile } from "./model";

export const RULE_VERSION = "NHVR-2026-10-14-v5";
export const REVIEW_DATE = "14 October 2026";
export const RULE_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time";
export const HOURS_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours";
export const DIARY_SOURCE = "https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-diary";
export const LAW_SOURCE = "https://www.legislation.qld.gov.au/view/whole/html/inforce/2026-08-01/sl-2013-0078";
export const LONG_NIGHT_LIMIT=36*60;
export const BFM_84_LIMIT=84*60;

export interface PeriodRule {
  minutes: number;
  limit: number | null;
  rest: number;
  type: "breaks" | "stationary" | "stationary-or-sleeper" | "weekly" | "nights";
  label: string;
}
const rule = (minutes: number, limit: number | null, rest: number, type: PeriodRule["type"]): PeriodRule => ({
  minutes, limit, rest, type,
  label: minutes % 1440 === 0 ? `${minutes / 1440} day${minutes === 1440 ? "" : "s"}` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2,"0")}m`,
});
/** Truck tables only. AFM/ACH and exemptions depend on the actual certificate. */
export function tableFor(p: Pick<Profile, "scheme" | "twoUp">): PeriodRule[] {
  if (p.scheme === "AFM" || p.scheme === "ACH") return [];
  const bfm = p.scheme === "BFM", two = p.twoUp;
  return [
    ...(bfm ? two ? [] : [rule(375,360,15,"breaks"),rule(540,510,30,"breaks"),rule(720,660,60,"breaks")]
      : [rule(330,315,15,"breaks"),rule(480,450,30,"breaks"),rule(660,600,60,"breaks")]),
    rule(1440,bfm ? 840 : 720,two ? bfm ? 0 : 300 : 420,two && !bfm ? "stationary-or-sleeper" : "stationary"),
    ...(two ? [rule(bfm ? 4920 : 3120,null,600,"stationary")] : []),
    ...(!bfm || two ? [rule(10080,two ? bfm ? 4200 : 3600 : 4320,1440,two ? "weekly" : "stationary")] : []),
    rule(20160,two ? bfm ? 8400 : 7200 : 8640,0,"nights"),
  ];
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
