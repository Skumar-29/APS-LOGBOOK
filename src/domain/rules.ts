/** APS Logbook fatigue engine v2. The 2026 NHVR engine is the ONLY runtime
 * calculation engine. Historical rules.ts is replaced, not used as fallback.
 *
 * Source: National Driver Work Diary v1.4 (2026), Parts 3–4, pages 19–25.
 * Built-in rules are for 15-minute written-diary-style planning, NOT an
 * NHVR-approved Electronic Work Diary. Unknown history means Needs review.
 */
export type {Check,Finding,RuleReport,WorkWindow} from "./fatigue-v2/contract";
export {analyse,selectCheckSummaries,selectWorkWindow,windowTotals,RULE_VERSION,RULE_SOURCE} from "./fatigue-v2/report";
