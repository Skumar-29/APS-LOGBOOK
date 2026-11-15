# APS Logbook: NHVR work/rest calculation engine rebuild (draft architecture)

**Status:** Experimental; MUST NOT be merged or deployed. This code is a calculation prototype, not an NHVR-approved Electronic Work Diary (EWD). CI has unresolved regressions.

## Authoritative source and counting units

Primary source: user's uploaded **National Driver Work Diary, v1.4 | 2026**, pages 4–5 (terms), 7–8 (record keeping), 9–18 (diary sheet), 19–22 (counting rules and diagrams), 23 (switching and rest sharing), 24–25 (five tables), 31 (unplanned split-rest defence).

Secondary current regulator source: https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time

**Critical:** Written Work Diary (WWD) uses 15-minute rounding (Work up; Rest down). Approved EWD counting is in whole minutes. The APS quarter-hour grid is a WWD-style planner; do not label it as an approved EWD.

## Design principles

1. The source diary's **recorded Work/Rest**, raw timer events, physical Rest classification, dated profile history, base time, recorded changes and auditable corrections remain immutable to evaluation. The engine only reads a normalised interval timeline.
2. Five **independent NHVR policy modules** correspond to each table in the 2026 diary: Standard Solo, Standard Two-up, Standard Bus/Coach, BFM Solo, BFM Two-up.
3. AFM / ACH / exemption policies must come from an actual operator certificate or applicable legal notice. Do not automatically substitute built-in Standard/BFM limits.
4. Count forward **from the end of rest**; short windows from every qualifying Rest end; periods of 24h or more from the applicable longest/relevant major Rest end. When the relevant Rest is absent, follow the NHVR fallback rule and mark uncertain history for review. The next major Rest does **not** cancel an earlier open counting period.
5. Check **every overlapping period** and retain past violations through subsequent rest periods and across calendar boundaries.
6. Work limits and Rest minimums are distinct tests. Rest type matters: stationary Rest, moving approved sleeper (eligible for some Standard Two-up requirements), unconfirmed Rest, unknown history.
7. After a rule-/base-/Solo-/Two-up change, earlier counting periods remain in force; an hours-option switch may require compliance with the new option or a verified 48h continuous Rest reset. Never reassign yesterday's option retroactively.
8. Red denotes a proven or explicitly projected **breach Work selection**. Yellow proposes the final continuous major-Rest opportunity. Rest is blue. No separate conflict category. A completed qualifying major Rest removes its yellow proposal.
9. A future itinerary check overlays proposed Work/Rest on a *clone* of the diary, runs all affected rules, and never edits actual records.
10. Unknown or incomplete history must produce **Needs review**, not permission to drive.

## Rule modules

| Mode | Work / Rest rules per 2026 booklet |
|---|---|
| Standard Solo (p24) | 5h30m: max 5h15/15m Rest; 8h: 7h30/30m in 15m blocks; 11h: 10h/60m in 15m blocks; 24h: max 12h + 7h stationary; 7d: max 72h + 24h stationary; 14d: max 144h + 4 night rests, including pair |
| Standard Two-up (p24) | Same short caps; 24h: max 12h + 5h stationary **or approved moving sleeper**; 52h: 10h stationary; 7d: max 60h + 24h continuous stationary AND a different 24h stationary in blocks of at least 7h; 14d: max 120h + 4 night rests including pair |
| Standard Bus/Coach (p24) | Standard short/daily; 7d: six night rests; 28d: max 288h + four separate 24h stationary rests |
| BFM Solo (p25) | 6h15: max 6h/15m; 9h: max 8h30/30m; 12h: max 11h/60m; 24h: max 14h + 7h stationary; 7d: max 36h long/night; 14d: max 144h + 24h stationary after at most 84h Work **and a separate** 24h stationary + 4 night rests including pair |
| BFM Two-up (p25) | 24h max 14h; 82h: 10h stationary; 7d: max 70h + two distinct stationary rest requirements as for Standard Two-up; 14d: max 140h + four night rests |

### Night/long work and stationarity

- Night Work: Work between local **00:00–06:00 in the driver's BASE timezone**, independent of geographic location.
- Long Work: Work beyond 12h in qualifying 24h counting periods.
- BFM Solo 7d 36h: count the **union** of the two kinds; never double-count a quarter that satisfies both.
- Night Rest: 7h continuous stationary contained in 22:00–08:00 base-local band, OR 24h continuous stationary. For the 14d consecutive rule, the four counted night rests are distinct and include a pair on consecutive days.
- BFM Solo split Rest **is not a scheduled alternative**; the booklet describes a limited defence for unplanned irregular activity. The planner must continue to require seven continuous stationary hours.

## New source modules

- src/domain/fatigue-v2/types.ts: typed rule and decision contracts
- src/domain/fatigue-v2/{standard-solo,standard-two-up,standard-bus,bfm-solo,bfm-two-up}.ts: independent policies
- src/domain/fatigue-v2/registry.ts: dispatch to the current effective option
- src/domain/fatigue-v2/rest-and-anchors.ts: continuous Rest, night rest, rest-end counting, disjoint weekly breaks
- src/domain/fatigue-v2/checkpoint.ts: proof-based 84-hour boundary with possible missing-history rest
- src/domain/fatigue-v2/evaluate.ts: per-rule windows, breach decisions, 7d long/night and 84h
- src/domain/fatigue-v2/report.ts: compatibility projection for existing UI/statistics/export consumers
- src/domain/rules.ts: **only** public facade; old calculation implementation has been removed from this branch

## Unresolved blockers before a release

The CI suite currently reports failures against cumulative rules, prior long/night limits, rest qualification, exact short-break breach positions, night-rest counting, 24h overlapping windows, plan forecasts and dated mode changes. Some are output-message differences; many involve correctness and require true fixes. In particular:

- Prove every new Rest anchor is NHVR-valid and avoid false clearance with missing history.
- Correct and test 84h checkpoint across every possible/confirmed 24h rest and after later resets.
- Restore exact 7d/14d checks and an accurate 36h long/night union.
- Restore non-mutating **next-break** and trip forecasts; this experimental adapter deliberately returns null until its proof is sound.
- Correct/verify mode switches, including existing phase boundaries, 48h reset and carry-forward work.
- Validate predicted seven-hour yellow Rest and red Work using independent 32-day screenshots.
- Fully test 52h/82h Two-up, 7d two-part rests, Standard Bus/Coach and certificate-specific modes.
- Verify DST repeated/missing local hours, base-time changes, partial timed Work and day-crossing exact rounding.
- Re-run all historical tests rather than weakening their legal assertions.
- Confirm the new reporting projection preserves original diary form, change table, backups, invoices, PDFs, page numbering and UI touch safeguards.

**Release gate:** CI TypeScript/Vite build, unit tests, complete phone/desktop browser release suite, cross-mode NHVR example checks and independent human review must all pass. No live deployment and no EWD-approval claim before then.

This is a shareable technical reference for an independent reviewer (including Claude) without allowing an outside model to alter source-of-truth NHVR rules or bypass failing tests.
