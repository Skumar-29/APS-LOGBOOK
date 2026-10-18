# APS Logbook

A local-first PWA combining Truck Work Diary and the truck Invoice Generator. Version **2.0.0-beta.11**. The APS Carpenter invoice app is not included.

## Run and build

Node 24 is used by CI.

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`dist/` is the complete HTTPS-hosted application. It works at a domain root or a repository subpath. Opening `index.html` directly as a local file does not provide PWA or secure browser APIs.

## Features

- Driving timer with saved sessions, base-time-zone handling, quarter-hour rounding and start correction.
- Separate Work and Rest rows with 24-column diary blocks, recorded work-cap highlights, page/window totals, tap/drag selection, precise/overnight ranges, Undo and full stationary-rest entry.
- Change locations, odometers, rest classifications, daily checks, driver snapshots and paper-page photos.
- Book-aware page jumps, automatic page allocation, cancelled snapshots and skipped-page records.
- Original paper-style graph with a complete detail appendix; 7/14/28-day statistics and as-of review.
- Truck invoice v14 layout, fixed C/O rates, overrides, miscellaneous rows, reviewed diary trips, revisions, PDF, real XLSX and CSV exports.
- Original two-page safe-driving / daily-check form, optional branding, saved driver details and reusable signatures. New trips start with fresh inspection/declaration answers. Signed forms are retained as read-only records.
- Text/table notes, tags, favourites, masking and optional AES-GCM encryption of note contents.
- Combined backups with checksum validation, optional passphrase encryption, legacy diary and truck-invoice imports, merge/replace preview and an atomic pre-import recovery checkpoint.
- Offline app caching and staged updates. App cache and personal records are separate.

## Architecture

`src/domain` contains the typed data model and pure diary, invoice, form, migration and hours-review logic. `src/storage.ts` uses IndexedDB transactions with revision checks; `src/context.tsx` serializes UI mutations. A failed transaction cannot replace the previously committed workspace. Another tab cannot silently overwrite a newer revision.

`src/screens` contains the compact React screens. `src/documents` renders the original layouts, PDF pages and XLSX files. Hours calculations run in a worker. Screens and PDF generation load on demand; all production chunks are included in the offline cache.

Driver identity is captured on diary days and timer events. Paper pages have separate IDs and book/number mappings, so cancellation retains a snapshot while a replacement can refer to the same date. Issued invoices and signed forms retain their contents; new revisions/trips have separate IDs.

## October 19 Work/Rest development fixes

- Selected quarters are Work; unselected quarters are Rest. Tapping again restores Rest.
- Future quarters are locked at the driver's base-local time. The save handler rejects any swipe range extending beyond elapsed time.
- Confirmed elapsed-time breaches are solid red; unsupported or uncertain rules remain review items, not false clearance.
- No separate future-time total is calculated, returned by the hours worker or exported in CSV. CSV columns are aligned and tested.
- Earlier stored future selections are not silently erased from user backups. Their safe migration and physical iPhone/PWA verification are release gates.
- Development branch: `fix/work-rest-validation-2026-10-19`; main/GitHub Pages remain unchanged.

## Beta 8 assessed hours

Diary, Graph, Driving, Stats, CSV and active-page PDFs now share the same exact-time timeline and elapsed-time cutoff. The active timer is included without finishing it or changing records. The current quarter and historical pages remain editable, but future quarters are disabled. Elapsed-time calculations never credit future work or rest.

A timer's actual continuous duration is rounded once: work up to a 15-minute multiple, rest down. Raw timestamps are separate from the old grid footprint; an off-quarter 17-minute timer counts 30 work minutes even when it touches three cells. Manual block corrections take precedence over completed timer links; Undo restores the previous exact interpretation.

More → NHVR guide explains break types, overlapping periods, overnight work, rounding, operating scope and official sources in plain language. Both physical rest settings and duration matter. The guide's ordinary tables use the engine catalogue.

[Manual GitHub upload and local checks](docs/MANUAL_UPLOAD.md) gives the steps for the separate APS-LOGBOOK repository. This source has a test-branch Vercel preview. Production release remains separate and requires reviewed tests. See [verification](VERIFICATION.md) for the checks that ran and the browser check that remains blocked.

## Beta 6 calculation changes

Saved diary pages treat unselected work blocks as rest. Erase work restores rest; missing days remain unknown. Existing blank cells are migrated with an audit entry and a pre-migration recovery checkpoint; cancelled page snapshots retain their original contents.

Rest duration labels update automatically across midnight. Settings → Display & diary chooses the physical rest setting for new pages; Day details chooses it for one page. Individual break settings override that default. Duration alone never establishes whether a vehicle was stationary or an approved sleeper was used.

The engine retains overlapping short, 24-hour, 7-day and 14-day counting periods. The diary shows the limiting 24-hour period touching its page, while Driving assesses only elapsed time. Future planned rest earns no live rest credit. Historical BFM long/night and 84-hour excesses remain visible after later rest. See [engine rules and tests](docs/FATIGUE_ENGINE.md) for the rule mapping, assumptions and release limits.

## Beta 2 changes

Documents holds PDF/JPG/PNG/WebP files offline (8 MB per file, 24 MB total), with expiry dates and pinning. Full backups include the files. Existing installations upgrade their IndexedDB store in place; document bytes are kept separately from frequently saved diary records.

Forms support signing directly and optionally saving that signature. Invoice Load Details and Miscellaneous use the original table columns; saved business/customer/bank defaults can be collapsed. Dates display as dd/mm/yyyy and times as 24-hour driver-base time, with the system picker used while editing. Historical diary and new-form base settings are retained.

Red work blocks identify recorded work-cap exceedances supported by the existing helper. They are not a complete fatigue-breach or truck-safety determination; rest-pattern checks remain in Stats/Driving. The offline truck-route idea is preserved in `ROADMAP.md` and is not included in this release.

## Restoring old records

Records → Restore backup accepts diary schemas 62/63, older compatible full-slot diaries, truck invoice v14 backups, and this app’s combined backup. Nothing is imported until the review step. Merge keeps existing records on conflicting dates or IDs. Replace affects only the selected backup’s module, or the whole workspace for a combined backup. An active timer must be finished before a diary replacement/import.

The old compact diary treated omitted dates as rest. The migration preserves that interpretation within the bounded saved history, marks imported days for review, and retains the original import. Dates outside that history remain unrecorded. An old active timer is retained in the source import for review, rather than restarted from an uncertain legacy clock. Combined backups preserve the new timer exactly.

Same-browser legacy recovery uses the old `truckDiaryPWA` and `aps_invoice_generator_v1` keys only when requested. It leaves those keys intact. Data on another domain, browser, or device requires an exported backup.

## Hours guidance and release limits

This is a **personal record and review tool, not an NHVR-approved Electronic Work Diary**. Keep the required written diary or approved EWD. The helper covers Standard/BFM solo and two-up work-cap and rest-pattern checks. Missing history, unreviewed imports, rule/base changes and daylight-saving days require review. AFM and ACH remain certificate-specific, record-only modes; WA/NT rules are not implemented.

Official sources reviewed for this build:

- [NHVR counting time](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/counting-time)
- [Work and rest hours](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-hours)
- [Written work diary](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-diary)
- [Record keeping](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/record-keeping-requirements)
- [HVNL reform implementation](https://www.nhvr.gov.au/law-policies/hvnl-reform-implementation)

Passing the automated suite is not regulatory certification. Physical iPhone Safari/PWA, Android, actual GPS, native PDF sharing and representative real-backup acceptance remain release checks. See `VERIFICATION.md` for observed evidence and open gates. Production publication is a separate, manually dispatched workflow.

## Privacy and retention

There is no analytics, server account or cloud record upload. Explicit current-location lookup sends coordinates directly to [BigDataCloud](https://www.bigdatacloud.com/docs/article/why-is-reverse-geocoding-api-free), under its client-side policy. Manual and saved places work without it.

Unencrypted records, notes, photos and signatures are local browser data. Masking only hides screen contents. Optional note encryption protects the note body/table; titles and tags remain visible. Encrypted backups protect the entire export. Passphrases are never saved and cannot be recovered. Previously exported unencrypted files remain readable.

Browser storage can be cleared or evicted; exported backups remain essential for retention. No routine automatically deletes diary records. Native sharing opens the device’s share sheet when file sharing is supported; otherwise the app downloads the PDF for attachment.

## Deployment

The `Build and test` workflow validates source and uploads a `truck-workspace-build` artifact. The `Publish reviewed production build` workflow is manual and deploys the tested `dist/` artifact through GitHub Pages Actions. Configure Pages to use GitHub Actions before production promotion; the TypeScript source directory is not a static Pages artifact.

The legacy application remains available in Git history at `1b040348eded789ab9fdb33e0d5c1c5329485acd`. Do not copy real driver backups, signatures, PINs, licences or bank details into this repository.

## Separate repository

Copied from `Skumar-29/Work-Diary`, branch `build/truck-workspace-v2`, commit `9ebef09827f5365d94f5644a13e40151a6123c62` on 2026-10-09. This is a standalone private development repository. The original repository and live applications have not been changed. The former custom-domain CNAME files are intentionally omitted to keep deployment separate. Existing app branding is retained pending a dedicated branding update. Repository creation does not migrate local driver records or reconnect hosting.

### Safe driving form controls (beta.7)

Open More → Forms → Form defaults to save company name, logo, driver details and a reusable form signature. These defaults apply to new forms; saved forms retain their details. The same defaults are accessible from Settings.

Forms save as you type and have a Save form button that returns to the list. Each saved form has Edit, Share / PDF and Delete actions. Editing a signed form creates an unsigned revision while keeping the signed original. Review and sign the revision again before export. Delete requires confirmation.
