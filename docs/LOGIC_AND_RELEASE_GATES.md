# APS Logbook — Logic and Release Gates

The app is a **personal check against an Australian heavy-vehicle paper diary**, not an NHVR-approved electronic work diary. Treat the paper diary, the applicable NHVR rules, and verified physical rest facts as authoritative.

## Invariants to preserve in every change

1. **Binary activity:** Each visible 15-minute diary cell is Work when selected and Rest when unselected. Toggling a selected cell back off records Rest. There is no third "missing cell" state. An entirely absent **historical day** is different: complete prior history may not be available for a fatigue assessment.
2. **Record regardless of clock:** Past, current and later diary cells are editable and saved without future locks. Selected Diary, Graph and Statistics can assess the full entered day, including later-entered Work. Live Driving timers must stop their assessment at the actual current time. No parallel future-planning ledger.
3. **Fatigue rules:** Use rolling NHVR periods across midnight, rule-specific rest requirements, the correct driver's base time zone and daylight-saving transitions. Do not infer a 7-hour *stationary* break merely from seven unselected cells. AFM/ACH require certificate-specific conditions and remain record-only unless supported explicitly by a verified rules engine.
4. **Effective settings:** A dated profile update must update matching inherited existing diary days from its effective date, not alter earlier dates or deliberately customised days. Past, present and future Work/Rest selections remain unchanged. Exact timed activity instants must not be silently reinterpreted during a base-zone change.
5. **Physical diary-book numbering:** Within a book, page numbers follow the dates of recorded entries, not data-entry order. Backdated Work before page 26 can receive page 25 if it is available. Never invent a duplicate number or silently renumber, overwrite or delete an existing physical page. Preserve cancelled/skipped pages, first page, first book date and book boundaries.
6. **Rest-only dates:** Automatic paper-page allocation happens only for recorded Work days. An explicit paper-page allocation may exist for a recorded exception. Never silently delete an older or manually allocated physical page merely because activity cells were unselected.
7. **Safety-critical save priority:** Work/Rest edits and completed timer intervals must be preserved even if automatic paper-page numbering cannot find a valid number. Skip the auxiliary allocation and show an actionable manual page-review message. Explicit *manual* allocation still reports the numbering error.
8. **Undo scope:** Undo reverses the last Work/Rest edit and, only if the same edit newly created an automatic page that is still untouched and active, reverses that page too. Never delete other pages or change earlier recorded days through Undo.
9. **Storage and backup:** Never silently clear existing browser data, overwrite driver history, or perform a destructive migration. Preserve backup/restore compatibility and audit important corrections. The production site URL stays the same when deploying to protect access to origin-scoped stored records.

## Release gates

- Run `npm test`, `npm run build`, and focused desktop/phone Playwright Work/Rest tests.
- Test selection/reversal, current/past/future dates, a cross-midnight Standard/BFM breach, effective-dated base/scheme changes, zero-book recovery, chronological auto/manual page allocation, an impossible page gap, and immediate Undo.
- Confirm no invalid page-number assignment rolls back work or a completed timer.
- Retain the previous production commit for rollback, verify the production GitHub Pages deployment, and do not publish to `main` without user approval.
- Physical iPhone Safari/PWA verification and matching against paper diary remain essential; automated tests alone do not certify NHVR compliance.

## Known quality issues and next audit targets

- The original all-app browser suite contains obsolete future-planning expectations and has not become a clean release gate. Replace obsolete tests with current-feature checks rather than deleting safety coverage.
- **Physical rest qualification:** existing page defaults can treat unlabelled solo Rest as stationary in some settings. Review this policy with the driver before changing historical records or claiming a confirmed stationary-rest reset.
- Review mixed two-up driver schemes, weekly/night rest calculations, cross-zone clock transitions and the exact PDF/paper diary layout against official NHVR references and paper examples.
- Add restore/import, CSV/PDF, form and invoice end-to-end tests to supplement focused diary tests.
