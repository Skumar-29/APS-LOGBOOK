# Verification — 2.0.0-beta.5

## Beta 5 update — 8 October 2026

- Compared the supplied older-app screen recording and current phone screenshot. A compact sticky header now contains the diary title, weekday/date/time, date navigation and recorded state/scheme. Blocks come before page and work-window totals; detailed window information expands when needed.
- Day, Night and device-controlled appearance apply immediately and persist. Settings return to the diary with refreshed state and remembered scroll position. The refresh control reloads committed local records after queued writes without reloading the page.
- Vertical touch gestures on blocks scroll without editing records. Horizontal selection remains confined to the same work/rest row and six-hour group. Undo remains available.
- Production build, 40 domain/storage tests and 26 phone/desktop Chromium journeys pass. New checks exercise native touch scrolling/selection, sticky-header position, immediate appearance, settings persistence and 320-pixel layout. Light/dark phone screenshots were visually reviewed. Physical iPhone acceptance remains open.

## Beta 4 correction — 8 October 2026

- Restored the supplied Safe Driving Plan and Vehicle Daily-Checklist PDF pages as the export template. Original wording (including spelling), typography, table geometry, page dimensions and signature/comment areas are retained. Beta 3's reconstructed form and edited wording are superseded.
- Filled values and the existing signature are drawn into the original spaces. Company/logo preferences affect only the existing header branding areas; the printed ETA note, declarations and return instructions are never rewritten.
- The original template is copied as native PDF content with its embedded fonts. Preview pages are scalable SVG renditions of the same artwork. Both assets are cached for offline exports. Empty interactive signing placeholders are removed from these completed static copies; the original source file remains untouched.
- Download checks compare native Form XObject stream bytes and exact page dimensions against the preserved template, guarding against accidental future redesign. Both filled pages are visually compared against the source.
- Compact diary block sizing from beta 3 is unchanged.

## Beta 3 update — 8 October 2026

- PDF export now draws native selectable text and vector lines. Safe-driving/checklist labels are rebuilt at 9-point body size with complete table borders; normal forms remain two A4 pages. Long fields/comments continue onto extra pages.
- Embedded, licensed fonts and PDF dependencies are included in the offline shell. Existing signature ink is cropped only to remove empty margins; logos and signatures remain images. Original records/answers are preserved.
- All pages of generated safe-driving, diary and invoice PDFs were rendered and visually reviewed. Text extraction confirms labels and values; no whole-page raster image remains. A font subsetting defect found during visual review was fixed by embedding the pre-reduced font files whole.
- Diary grid width is capped at the original 430 pixels with 44-pixel row labels and 24 contiguous slots. Existing breach colours, selection and Undo remain active.
- Browser checks verify compact slot widths and offline two-page PDF downloads with real embedded fonts, in addition to the existing phone/desktop journeys. Physical-device acceptance below remains open.

## Beta 2 update — 8 October 2026

- Strict TypeScript and production build pass. 40 domain/storage tests and 24 Chromium phone/desktop journeys pass.
- Additive IndexedDB v1 → v2 migration preserves the existing workspace. Document contents live in a separate store; full backups restore their exact bytes. Missing/checksum-mismatched files reject the whole save. Recovery checkpoints retain their referenced files. Duplicate imports are rejected without duplicating documents.
- UI checks cover offline document display and backup restore, fresh form signing without a saved signature, optional signature reuse, original invoice table columns/calculations, remembered and collapsed invoice details, base-state clocks, historical diary base retention, red work-cap blocks, and 320-pixel layouts.
- Visual review found an unanchored hidden table label causing horizontal overflow; it is corrected. The date navigator now displays Australian date order outside the native editing picker. A compact work-window card and non-wrapping table actions complete the layout fixes; affected phone/desktop checks were rerun.
- Red blocks reflect recorded work-cap exceedances from the existing helper. Rest-pattern checks remain in Stats/Driving. No unsupported rules or absent data are treated as clearance.
- Files: PDF/JPG/PNG/WebP, up to 8 MB each and 24 MB total. Offline preview/download was checked in Chromium; native file sharing and iPhone PDF handling still need device acceptance below.
- The deferred no-paid-maps truck planner is recorded in `ROADMAP.md`; no routing service or paid dependency has been added.

## Recovery verification — 7 October 2026

The interrupted upload was recovered from the original working directory. All 57 source files matched the Git blob hashes in the preserved upload manifest before further changes. The strict TypeScript/production build, 31 domain/storage tests and all 16 Chromium journeys passed again in the continuation session.

Visual inspection then found a clipped date at 320 pixels. A narrow-screen CSS adjustment keeps the full date and calendar control visible without adding a row. The production build and both affected narrow-screen browser journeys passed after this change; the resulting screenshot was inspected. No domain logic changed. The physical-device and acceptance gates below remain open.

## Observed checks

- TypeScript strict build and Vite production build pass.
- 31 domain/storage tests pass: atomic commits and stale-tab rejection, recovery checkpoint, backup checksums/encryption, compact and full record semantics, exact timer persistence, rounding, midnight/DST handling, page lookup/cancellation, invoice arithmetic and overflow pagination, form all-clear semantics and signature ownership, unknown-history handling, major/night-rest anchors and overlapping 24-hour periods.
- 16 end-to-end Chromium journeys pass across phone (440 × 956) and desktop (1280 × 900) contexts. Tests also exercise 320-pixel layout, drag selection/Undo, full stationary rest, offline reload and lazy screens, a repository subpath, legacy import, page 87 → 56, diary-to-invoice route/odometer entry, PDF downloads, real XLSX output, signature drawing/reuse, fresh next-trip answers, table notes, encrypted-note recovery and active timers after reload.
- A simulated storage-full exception is shown to the driver; reloading retains the prior committed record.
- Exported invoice and safe-driving PDFs were rendered and visually inspected. Diary labels were corrected to avoid book/page and location collisions. Long contents continue on added pages rather than disappearing.
- Exported `.xlsx` files reopen with openpyxl and retain the expected 940.50 test invoice total.
- No real customer records are included. Test names, vehicles, codes and signatures are synthetic.

## Open release gates

This is a tested beta, not a claim of universal reliability or NHVR approval.

1. Physical iPhone 16 Pro Max Safari and installed-PWA use: keyboard, finger gestures, screen lock/return, file import/download, camera upload and application update.
2. Physical Android browser/PWA and native email, Messages and WhatsApp PDF hand-off. Local tests verify PDF generation/download; they do not send messages.
3. Real GPS and live reverse-geocoder behavior, including permission refusal and weak reception. Manual location entry is the fallback.
4. Acceptance against the driver’s own representative backups and company-required documents. Synthetic fixtures cannot establish the correctness of every historical backup variation or company acceptance.
5. Independent review of jurisdiction/certificate conditions, rare fatigue/rest combinations and daylight-saving elapsed-time records before relying on planning advice. AFM/ACH are deliberately record-only; historical or incomplete cases remain flagged.

The source and preview can be reviewed now. Production replacement should follow these acceptance checks. The GitHub deployment workflow is manual.
