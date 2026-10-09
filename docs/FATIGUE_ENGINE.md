# Fatigue engine beta 6

Reviewed 9 October 2026. Rule identifier: NHVR-2026-10-09-review-2.

## Source mapping

The ordinary Standard and transitional BFM truck-driver tables are implemented for solo and two-up arrangements. Sources reviewed:

- [NHVR counting time](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time): short periods begin at the end of rest; longer periods use the applicable major rest; overlapping periods remain in force. Where the required break is absent, the fallback is an ordinary rest ending. Missing history cannot establish that absence.
- [NHVR work and rest hours](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours): Standard/BFM maximum work and minimum rest tables, night-rest definitions, and long/night work.
- [National Driver Work Diary, December 2025](https://www.nhvr.gov.au/files/media/document/251/202512-0704-national-driver-work-diary.pdf): quarter-hour recording and relevant major rest examples. Post-August-2026 counting guidance above takes precedence for current periods.

| Option | Short periods: period / maximum work / minimum rest |
| --- | --- |
| Standard solo and two-up | 5h30 / 5h15 / 15m; 8h / 7h30 / 30m; 11h / 10h / 60m |
| BFM solo | 6h15 / 6h / 15m; 9h / 8h30 / 30m; 12h / 11h / 60m |
| BFM two-up | No short-period table |

| Option | 24-hour cap and continuous rest | Longer requirements |
| --- | --- | --- |
| Standard solo | 12h work; 7h stationary rest | 72h work / 7 days with 24h stationary rest; 144h work / 14 days with four night rests including two consecutive |
| Standard two-up | 12h work; 5h stationary or approved moving-sleeper rest | 10h stationary / 52h; 60h work / 7 days with 24h continuous plus another 24h stationary in blocks of at least 7h; 120h work / 14 days with four night rests including two consecutive |
| BFM solo | 14h work; 7h stationary rest | 36h long/night work / 7 days; 144h work / 14 days, two 24h stationary rests, no more than 84h work before a 24h rest, four night rests including two consecutive |
| BFM two-up | 14h work | 10h stationary / 82h; 70h work / 7 days with 24h continuous plus another 24h stationary in blocks of at least 7h; 140h work / 14 days with four night rests |

## Data and counting behavior

- A saved page has 96 fifteen-minute entries. Unselected work means rest. An absent page is unknown, never silently rest. Imported legacy assumptions remain marked for review.
- Work timers round outwards; rest timers round inwards. A current partial rest quarter earns no completed rest credit. Work wins a timer boundary overlap.
- Physical rest settings apply only to the continuous break. A rest setting cannot leak through intervening work. A new-page default is explicitly selected by the user and captured on that page.
- Duration-derived labels distinguish ordinary rest, major stationary rest, night rest and 24-hour rest. A moving-sleeper label never turns into stationary rest from duration alone.
- The engine checks all applicable overlapping anchors. It retains all rows internally for the conservative work-cap estimate, even when the screen summarizes repetitive rows.
- Confirmed work-cap highlights require a supported ruleset and an established long-period anchor. Continuous short-period work can establish an excess from recorded work alone. Uncertain long-period starts produce review rather than a false confirmed breach.
- Rest totals are independent of review flags. Review does not subtract recorded work twice.
- Long/night work uses a set union, so a quarter qualifying both ways counts once. Historical long/night and 84-hour excesses are not erased by a later rest.
- The diary is a whole-page assessment and can include planned entries. Its unused cap is specific to the displayed period. Driving is the elapsed-time assessment; future default-rest cells earn no credit there.
- The live estimate reserves required continuous rest if work resumes before a break qualifies. It is deliberately conservative, including the remaining BFM long/night budget even when some future daytime work might not use that budget. It is not an earliest lawful restart calculation or clearance to drive.

## Screenshot regression

With established stationary rest before 00:00 on 9 October: work 00:00–06:00, 06:30–11:30, 12:00–15:00 and 22:00–24:00 gives 16h work and 8h rest. The 00:00 counting period exceeds 14h during all eight quarters from 22:00. The new 22:00 period also exists but does not cancel the older period. Without the preceding history, the engine does not invent a confirmed midnight anchor.

## Explicit review boundaries

AFM/ACH certificate-specific conditions, WA/NT operation, historical pre-August-2026 rules, daylight-saving transitions, rule/base/mode changes, uncertain rest type and unconfirmed imports require review. A possible BFM split-rest pattern is marked for condition review; split-rest eligibility and exemptions are not automatically approved. This release does not cover bus-specific 28-day concessions or exemptions.

This remains a personal recording and review tool, not an NHVR-approved EWD or regulatory certification. Complete numerical tests do not establish approval or physical fitness to drive.

## Verification

`tests/rules-engine.test.ts` covers the screenshot, exact caps, midnight rest, missing history, automatic labels, migration and archived snapshots, interruption, partial quarters, reviewed totals, long/night overlap, historical 84-hour excess and a complete-history allowance. Existing domain/storage tests cover backups, timers, exports and transaction safety. The browser suite includes the screenshot schedule, 320px layout, erase-to-rest, persistence and a live total that excludes future planned work.
