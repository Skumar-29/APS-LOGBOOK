# Cumulative breach comparison — beta.13

Reviewed both supplied batches (17 screenshots) against the beta.12 engine. Screenshots show selected pages and several editing stages; they do not include a complete matching 14-day history or exported backups. Dates below identify visible evidence, not an assertion that both apps contain identical records.

## What the screenshots establish

| Date | Work Diary Mate | APS Logbook | Consequence |
|---|---|---|---|
| 12 November | 84-hour checkpoint warning on a selected 06:45 block; one screenshot has 1h daily Work | 12h selected Work, including 20:00–24:00; no 84h warning | Directly reproduces a real class of missed first-checkpoint breach, but the daily inputs differ |
| 13 November | 84-hour warning on a 06:45 block; other editing stages show 5.5h and 14h Work | 10h selected Work, ending about 16:30 | The images depict different amounts/stages of entry |
| 14 November | 14h Work including daytime Work | 4h Work, 20:00–24:00 | The APS schedule leaves about 27.5h continuous Rest since 13 November 16:30, so a stationary 24h checkpoint is possible/qualifying there; the Mate schedule has Work in that interval |
| 16 November | 14h Work, mostly daytime | 14h Work with a different overnight/daytime distribution | Equal calendar totals do not establish equal long/night quantities or counting periods |
| 17 November | Selected 12:15 block reports 144.5h against a 144h cap | No matching complete APS 17 November history supplied | Cannot infer the identical first excess timestamp without the prior matching entries |
| 10/22 November | No matching complete 7-day history shown | Long/night used/remaining varies; top strip says Review/— while the lower panel contains a number | A global history warning was hiding a computed quantity in one view |

## Confirmed defects and repairs

1. **84h detection depended on an earlier confirmed 24h checkpoint.** The old loop iterated only known checkpoints. With no first checkpoint, even more than 84h of subsequently proven Work produced no 84h breach. The new lower-bound calculation checks the initial recorded segment as well as later segments, marks the first excess and every later confirmed Work block, and preserves historical red blocks after subsequent Rest.
2. **Uncertain intervals need conservative treatment.** Missing/uncertain intervals are joined with adjacent eligible Rest to identify where a 24h stationary reset was possible. They are not declared actual qualifying Rest. This prevents false excess across a gap that could contain a checkpoint. A missing earlier checkpoint cannot erase a breach proved by later recorded Work without such a possible reset.
3. **An unconfirmed 14-day period could suppress even the arithmetic excess.** The engine now emits a dated review finding with the recorded excess, while retaining a review status until the period is confirmed. Established 14-day periods retain confirmed red breach blocks. Unconfirmed physical Rest is not silently changed to stationary Rest.
4. **Review status hid quantities in summaries.** Diary and Statistics now show the 84h checkpoint quantity, 7-day Work/long-night quantity as applicable, and 14-day Work quantity separately from permission/remaining estimates. Lower-bound values have a ≥ prefix. Exceeded counters show excess hours. Positive remaining allowances still require evidence; a proven zero balance is not hidden merely because other history needs review.

No limits were changed: BFM solo uses the 84h checkpoint, 36h long/night cap over 7 days, and 144h Work over a 14-day period. Standard/two-up tables and jurisdiction handling are preserved.

## Verification

Synthetic VIC/BFM fixtures explicitly exercise a 06:45 first 84h excess, confirmed 144h excess, dated 144h recorded-excess review, and 7th-day night excess despite missing older history. These fixtures are representative regressions, not invented reconstructions of unseen screenshot history. Additional cases cover exactly 84h, later recovery, missing gaps, reviewed records, unchanged source records and scheme isolation. The full existing unit and release-browser suites remain enforced before Pages publication.

Sources reviewed 6 November 2026:

- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/long-night-work-time
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/split-rest-breaks
