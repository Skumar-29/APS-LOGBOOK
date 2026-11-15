/** NHVR National Driver Work Diary v1.4 (2026), pages 19–25.
 * Rule definitions are independent of diary UI, colours and historical records.
 * Durations are integer minutes. Intervals are [start, end), UTC epoch ms.
 */
export type DriverMode="standard-solo"|"standard-two-up"|"standard-bus"|"bfm-solo"|"bfm-two-up"|"certificate";
export type RestObligation=
  |"short-15"|"short-30"|"short-60"
  |"stationary"|"stationary-or-approved-moving-sleeper"
  |"two-up-seven-day"|"night-four-paired"|"night-four"|"night-six"
  |"bfm-solo-fourteen"|"bus-28-day"|"none";
export interface WindowRule {
  id:string;
  periodMinutes:number;
  maxWorkMinutes:number|null;
  minimumRestMinutes:number;
  rest:RestObligation;
  /** Eligible long-period starts are ends of a qualifying major break,
   * not arbitrary sliding instants or midnight. */
  anchor:"any-rest"|"major-24"|"major-10"|"major-7"|"major-5"|"night-or-24"|"fallback-any-rest";
}
export interface DriverRules {
  id:DriverMode;
  label:string;
  windows:readonly WindowRule[];
  /** Seven-day union of midnight–06:00 Work and hours above 12h in 24h. */
  longNightCapMinutes?:number;
  /** Separate 24h stationary Rest after at most 84h Work, BFM Solo only. */
  checkpoint84?:boolean;
  requiresCertificate:boolean;
  sourcePage:24|25|"certificate";
}
export interface RuleDecision {
  ruleId:string;
  start:number;
  end:number;
  assessedThrough:number;
  workMinutes:number;
  restMinutes:number;
  maxWorkMinutes:number|null;
  minimumRestMinutes:number;
  status:"ok"|"open"|"breach"|"review";
  reason:string;
  breachAt?:number;
  uncertain:boolean;
}
