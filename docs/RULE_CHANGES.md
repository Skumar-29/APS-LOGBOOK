# Dated hours-option changes — beta 9 candidate

Settings records explicit Standard/BFM intervals in driver-base time. Whole-day changes have an exclusive end at the next midnight; timed changes can be open-ended or temporary. Original dated profiles, activities and audit history remain intact. Overlapping corrections preserve both surrounding intervals and an audit of the original assignment. Certificate details belong to the recorded operator/period; Standard clears BFM certificate fields.

The read-only timeline splits at effective timestamps without restarting continuous work/rest rounding. Every screen, worker report, CSV and PDF uses those same intervals. Stationary rest remains continuous across an hours-option change. Supported Standard/BFM transitions in the same base zone and solo/two-up arrangement count earlier work under the destination table. A confirmed 48-hour stationary reset permits counting forward from its end. Missing history, clock changes, accreditation gaps, AFM/ACH and incompatible rule/mode changes remain review items rather than a new allowance.

BFM long/night assessments stop at the end of each BFM phase. Later Standard work cannot retrospectively create a BFM breach. The 84-hour checkpoint includes earlier work, but a BFM breach is attached to actual BFM work. Temporary changes revert to the dated baseline or surrounding preserved assignment. Saving a setting is a record of the selected option, not permission to drive.

Solo timer rest suggests stationary; two-up suggests the previous recorded two-up rest type, or asks for confirmation. Physical rest type stays visible and correctable. Changing it during a break records a separate factual interval without losing continuous rest totals. Old uncertain pages are preserved; new solo pages use a visible stationary default unless confirmation was requested.

CSV exports include the actual hours option, company and accreditation per interval. Mid-day changes produce separate PDF graph/appendix previews; additional written-diary page numbers are unallocated rather than invented. A personal PDF preview is not an approved electronic work diary. The next physical daily sheet must be recorded/assigned according to NHVR guidance.

Source audit: the live repository had newer uploaded copies at its root, while the active nested source still used the previous engine. This candidate updates the canonical `src/`, `tests/`, and `docs/` paths. Root upload duplicates are preserved and ignored. `app-source.html` remains the rebuild entry; its compiled output is renamed `index.html` for Pages.

NHVR references reviewed 13 October 2026:
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours
- https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time
- https://www.nhvr.gov.au/files/202010-1174-swapping-between-bfm-and-standard-hours.pdf
- https://www.legislation.qld.gov.au/view/whole/html/inforce/2026-08-01/sl-2013-0078

Verification at branch preparation: 119 unit/regression/worker/storage tests pass; TypeScript and production build pass. Full browser acceptance is a separate GitHub Actions gate and has not yet passed for this candidate. No certification or zero-error claim is made. Do not deploy until the gate and any failures are resolved.
