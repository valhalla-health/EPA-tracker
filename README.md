# Newborn Chula Fellow EPA Tracker — v1 rebuild

**This is now the only version being maintained.** The legacy production GAS
script (local clasp clone at `nicu-tools/epa-tracker/`) was retired
2026-07-11 — its local files were deleted. The legacy script itself is still
live on Google's servers until this rebuild is deployed, tested, and its data
migrated (see below) — don't undeploy it before that.

Real GAS+Sheets backend built from the `EPA Tracker and milestone app` prototype
(dc.html — UI mock only, no backend) + the fix list in
`handoff-newborn-chula-epa-tracker.md`. Same visual design as the prototype,
now wired to real data, email, and PDF generation.

## Migrating data from the legacy system

The legacy spreadsheet has real graded assessments (real fellows, patient
data, signed PDFs) that must not be silently lost. After deploying this
rebuild (steps below) and adding fellows/faculty in Admin:

1. Find the legacy Spreadsheet ID: open the legacy Apps Script project →
   the Sheet it's bound to → the ID is the `/d/<ID>/edit` segment of that
   Sheet's URL.
2. In this project's Apps Script editor, run
   `importFromLegacySpreadsheet_('<legacy spreadsheet id>')` once.
3. Check the Logger output / `Audit_Log` sheet's `legacy_import` row for the
   report: fellows/faculty imported, records imported, any
   `unmatchedAssessments` (category+subtype pairs that didn't match one of
   the 17 seeded items — investigate before trusting the import is complete),
   and `pendingSkipped` count (legacy requests that were never graded — these
   are **not** migrated, since their one-time links point at the old
   deployment URL; ask the fellow to resubmit those from the new app).
4. This matches fellows/faculty by email and assessment items by
   (category, subtype) rather than raw ID strings, since the legacy ID
   scheme wasn't confirmed while writing this — spot-check a few migrated
   records against the legacy Sheet before treating this as done.

## Deploy

1. New Apps Script project (script.google.com/create), rename it.
2. Extensions-equivalent: paste `Code.gs`, `WebApp.html`, `Grade.html`,
   `appsscript.json` (Project Settings → check "Show appsscript.json") in.
3. Run `setupSpreadsheet()` once (Run ▶ in the editor) — creates a new Google
   Sheet, seeds the 17 EPA items + all domain/checklist labels. Approve the
   permission prompts. Note the Sheet URL Logger prints.
4. Deploy → New deployment → Web app → Execute as **Me** → Who has access
   **Anyone** → Deploy → copy the `/exec` URL.
5. Open the URL → Admin tab → Fellows & Faculty → add real fellows and
   faculty (name, email, training year, signature). **Nothing is seeded here
   on purpose** — the prototype had fictional Thai names, don't reuse them.
6. Every code change → New deployment (not "Manage deployments → Edit"),
   same rule as the other nicu-tools projects.

## What's implemented vs. the handoff wishlist

| Item | Status |
|---|---|
| Fellow submit request → email assessor with one-time link | ✅ |
| Faculty grade via one-time link (`?page=grade&token=`) | ✅ |
| PDF generation (DocumentApp → PDF) + email to fellow | ✅ |
| **Live** signature-pad at grading time (handoff 3.2) | ✅ — assessor signs live every submit; fellow signature is on-file (captured once in Admin), see note below |
| CC unit email `newbornchula@redcross.or.th` | ✅ |
| Admin panel: add/edit fellow & faculty + signature | ✅ |
| Year-end portfolio export (merged PDF) | ✅ — regenerates one consolidated PDF from all completed records, not a binary merge of the individual PDFs (GAS has no native PDF-merge) |
| Checkpoint report (freeze 6mo/1yr snapshot) | ✅ — "Freeze checkpoint" button per fellow in Admin; snapshots stored in `Checkpoints` sheet, no UI to browse old checkpoints yet |
| Auth (`Session.getActiveUser()` + role-gated dropdowns) | ❌ **deliberately deferred** — same residual risk as current production: anyone with the link can switch the "Signed in as" dropdown |

## Deviation from the prototype (security, not cosmetic)

The prototype's Faculty → Grading Queue let you click "Grade" inline and see
full patient PHI for whichever faculty you'd selected in the dropdown — that
recreates exactly the hole flagged in the handoff (§3.1: anyone can view any
fellow's patient data via dropdown). In this build, the in-app queue only
shows category/subtype/fellow name/date — **no patient name, HN, or
diagnosis**. Real grading (and the only place PHI is visible to faculty)
happens through the one-time emailed link only, same as current production.

## Signature model

- **Assessor**: draws a live signature on canvas every time they submit a
  grading (Grade.html). This is the actual fix for handoff 3.2 — it's no
  longer a pasted static image, but a canvas signature is still not
  cryptographically bound to a login, since there is no auth yet.
- **Fellow**: signs once in Admin → Fellows & Faculty, stored on file and
  reused on every PDF (fellow isn't present at grading time, so a live
  per-record signature isn't achievable without auth to confirm who's
  looking at the async result — kept as-is until auth ships).

## Data model (`Settings`/`Users`/`Fellows`/`Faculty`/`Assessments`/`Domains`/
`Submissions`/`Checkpoints`/`Audit_Log` sheets, auto-created by
`setupSpreadsheet()`)

- 17 EPA items seeded exactly as in current production (4 Mini-CEX, 2 CBD, 10
  DOPS, 1 COMMU) — MINI_CEX/CBD/DOPS domain labels and all 6 COMMU checklist
  sections ported verbatim from the prototype.
- `Users` sheet exists with `role`/`linked_id` columns but nothing reads it
  yet — it's there so wiring up real auth later is additive, not a rewrite.
- Patient identifiers (name + HN + diagnosis) are still stored in full —
  the handoff's open question ("full name vs. HN-only") was never answered
  by Pp, so this build didn't unilaterally decide it.

## Scrutinize + verify pass (2026-07-11)

Traced the fellow→email→grade→PDF→email flow, admin CRUD, and the migration
function end-to-end. Found and fixed:

- **Grading form used a 1–9 scale for the overall entrustment level** instead
  of the correct 1–5 scale (L1–L5, "Completed" at L4 per the handoff) — was
  conflating it with the separate 1–9 per-domain scoring scale. Fixed before
  first commit of this pass.
- **Grade.html always told the assessor "fellow received the email + PDF"**
  even when PDF/email generation had failed server-side (`api_submitGrading`
  swallows that error and still returns `ok:true`). Fixed — now shows a
  distinct warning screen telling the assessor to flag it to admin.
- **Overall-level buttons in Grade.html never showed a selected/active
  state** (dead ternary) — assessor had no visual confirmation of which
  level they'd picked. Fixed.
- **`sendAssessorEmail_` interpolated fellow-typed patient name/diagnosis/
  location unescaped into an HTML email** sent to faculty — HTML-injection
  risk if a fellow puts markup in those fields. Fixed with an
  `escapeHtml_()` helper (Grade.html already escaped the same fields
  correctly, this email path didn't).
- **`importFromLegacySpreadsheet_` was not idempotent** — running it twice
  would duplicate every previously-imported graded record, inflating
  completion counts. Fixed by checking for the `legacy_<record_id>` token
  before inserting.
- Minor: submit-form's generic field binder used `oninput` for `<select>`
  elements (training year / assessor / location); switched to `change`,
  the reliable event for selects.

## Pre-publish review pass (2026-07-11, before pushing to GitHub)

- **Admin "Add/Edit fellow" training year was a free-text `<input>`** while
  the fellow's own Submit Assessment form uses a restricted F1/F2/F3
  `<select>`. An admin typing anything other than the literal `1`/`2`/`3`
  (e.g. "F1", "1st year") silently broke the pre-selected value in the
  submit form dropdown. Changed to a matching `<select>`. No other new
  issues found — traced fellow/faculty/admin flows again and confirmed the
  fixes from the pass above are all still in place.

**Verified correct (traced, not just read):**
- `LockService` usage in `api_submitGrading` does a proper check → lock →
  recheck → write sequence — no double-grading race condition on concurrent
  submits of the same token.
- Domain-score keys generated at grading time (`api_getGradingByToken`,
  e.g. `MINI_CEX_0`, `COMMU_0_1`) match the keys `domainLabelMap_` looks up
  when building PDFs/portfolios — confirmed by reading both generators, key
  schemes are identical.
- Ran the client-side dashboard completion logic against synthetic data
  (out-of-order graded attempts, still-pending items, partial COMMU passes)
  — L4/L5 → Completed, COMMU requires 2 PASS, pending items show Pending.
  All matched expected output.

**Noted but not changed (inherited from the prototype's design, not a
regression):** completion status is based on *any* graded attempt ever
reaching the passing level, while the "Latest: ..." label shown next to it
is the *most recent* attempt regardless of score — so a fellow who passed
early and was re-assessed lower later will show "✓ Completed" next to
"Latest: Level 3". This matches the prototype and the handoff's simple
"L4 → Completed" rule as written, but if program directors expect "latest
attempt must pass," that's a real business-rule question for Pp, not a bug
to silently fix.

**Not independently verifiable without a live deployment:** end-to-end
browser testing (fellow submit → real email → real grading link → real PDF)
needs a deployed Web App URL and a live Google session — out of reach in
this pass. Static tracing + logic simulation only.

## Not done / explicitly out of scope this pass

- Real authentication (next planned step per Pp's instruction — "leave auth
  last").
- UI to browse historical checkpoint snapshots (data is captured, no viewer
  yet).
- Auto-resend of legacy PENDING (ungraded) requests — see migration section
  above, these need manual resubmission instead.
