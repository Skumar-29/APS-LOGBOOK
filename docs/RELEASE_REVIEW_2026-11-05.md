# APS Logbook beta.12 release review

Base audited: `9e0b0c8d936bf3e1602df0b487947d8cd5390f78` (existing React/TypeScript app, no rebuild from scratch).

## Scope recovered from prior discussions

The exact original numbered 24-item message was not available in retrieval. This is a traceable consolidation of recovered requirements, not a claim to reproduce its wording or numbering. Existing domain rules and saved-record schemas are preserved.

| # | Requirement | Verification |
|---|---|---|
| 1 | Vertical finger scrolling never edits blocks | Genuine Chromium touch-scroll browser regression |
| 2 | Cancelled and diagonal gestures save nothing | Gesture unit and browser tests |
| 3 | Tap, keyboard, horizontal swipe, Undo remain usable | Work/rest and gesture browser journeys |
| 4 | Selected = Work; unselected saved-day blocks = Rest | Domain, monthly and browser totals tests |
| 5 | Full saved-page review and elapsed Driving use explicit cutoffs | Timeline/worker tests and overnight browser journey |
| 6 | Mixed past/future edits retain red breaches; future Work is striped | Work/rest and release-review browser tests |
| 7 | Seven-hour Rest never erases an overlapping earlier cap | Rules, planning and timeline regressions |
| 8 | Midnight, exact timers, rounding and clock changes preserve totals | Timeline, dated-rule and time unit regressions |
| 9 | Effective rule changes preserve prior records | Dated settings and browser tests |
| 10 | Solo/two-up Rest classification and co-driver requirements remain enforced | Rules and two-up browser journey |
| 11 | Short/major Rest and next-limit information remains available | Driving-statistics and compact Stats browser tests |
| 12 | BFM 36h long/night cap is counted once across overlaps | Rules, monthly, fatigue and dashboard tests |
| 13 | Night-rest count and consecutive pair remain visible | Qualification, fatigue-guidance and Stats checks |
| 14 | Yellow protected Rest and red projected conflict remain distinct | Protected-rest unit and browser tests |
| 15 | Qualifying Rest extension suggestions use factual stationary Rest | Rest-extension advisor unit tests |
| 16 | Start-time comparison preserves earlier windows and never edits diary | 3pm/5pm forecast unit case and planner browser tests |
| 17 | Backdating, page navigation, numbering conflicts and Undo preserve Work | Page-numbering unit and work/rest browser tests |
| 18 | Base time, larger readable clock, 12h/24h setting persist | Time-display, dated profile and browser tests |
| 19 | Compact header, grid first, all tools and return navigation | All-page browser review at 320/390/440 pixels |
| 20 | Save state, visible storage errors and safe failure recovery remain | Storage and injected-save-failure browser tests |
| 21 | Form defaults, signatures, signed revisions, original PDFs and share activation remain | Feature-preservation browser journeys |
| 22 | Invoices retain tables, defaults, changeover and export calculations | Invoice domain and browser journey |
| 23 | Backups, old imports, documents and encrypted notes retain data | Domain/storage and feature-preservation journeys |
| 24 | Offline GitHub Pages scope, install name, version and release gate work | Subpath/offline WebKit + Chromium browser journeys |

## Targeted changes

- Shared clock/title row replaces the separate clock row. Existing widened day arrows, date picker, page jump and colour modes are retained.
- Diary blocks and balances precede the optional planner, Rest advice and detailed calculations.
- Future selected Work is striped, retaining the red background for detected breaches and the separate projected-Rest conflict marker.
- Install title is APS Logbook. Manifest identity, start URL and scope remain unchanged.
- PDF preview fonts are built as relative assets, so repository subpaths and offline rendering load the same fonts.
- Tool pages have an explicit Back to tools action.
- Service-worker assets prefer the active release cache before older fallback caches, preventing stale fixed-path manifests/templates after an update.
- Settings displays the installed version; `release.json` identifies the deployed commit.
- Planner labels describe a later start rather than asserting the entire delay is Rest.
- Both CI and Pages publication run the same enforced release browser suite. The build artifact is published only after all checks succeed.

## Rule-source review

Compared existing Standard/BFM solo/two-up tables and counting-period assumptions with the official NHVR work/rest-hours, counting-time and long/night-work pages on 5 November 2026. Existing numeric tables match the reviewed published tables; no numeric fatigue-rule changes were made in this release.

- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/long-night-work-time

## Verification evidence

- Local unit suite: 195 passed in 18 files.
- Local strict TypeScript, production build and offline shell generation: passed.
- Local browser execution: blocked before app execution by host socket restrictions. GitHub Actions provides the release browser execution environment.
- CI browser results and deployment status: recorded in the release commit/workflow run, with screenshots and traces uploaded as workflow artifacts.
- Older browser files retain obsolete removed-control selectors. `npm run test:release` is the enforced current interface suite; historical test files are retained for migration and are not represented as passing.

Browser emulation does not establish physical iPhone native sharing, real GPS reception or NHVR certification. Those limits are unchanged from the existing app.
