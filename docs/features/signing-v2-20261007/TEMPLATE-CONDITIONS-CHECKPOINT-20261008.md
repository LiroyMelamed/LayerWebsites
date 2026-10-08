# Typed defaults and document conditions — local checkpoint, 8 October

The existing template editor now authors optional defaults for text, identifiers, exact decimals, dates, booleans and choice lists. Date entry uses the incumbent platform control. Defaults remain editable per package and retain their source in the immutable snapshot. Explicit removal does not turn false into an absent value. A choice removed from an enum remains visible as unavailable until corrected; it is never silently replaced.

A document can always be included or use one typed `present`, `equals` or `in` rule. The authoring control preserves source PDFs, geometry and original publications. Data keys referenced by document or existing role conditions cannot be deleted or have their type changed accidentally. The preparation review shows actual inclusion/exclusion counts for the complete batch plus excluded documents in the sample. The source PDF content is never translated or changed by a condition.

Review against PRODUCT-PLAN §4 uncovered a pre-existing semantic defect: missing comparison data was being interpreted as false, silently excluding a document or participant. `equals`/`in` now block on unknown data and report the relevant input field; only explicit `present` may evaluate absence as false. Empty comparison constants are rejected. This changes admission for invalid/unknown new inputs; it does not rewrite existing immutable package snapshots.

Focused evidence on this candidate:

- 54 UI scenarios: native editing/defaults/conditions in he/ar/en, incumbent date values, false/exact decimal preservation, explicit removal, protected references, publish/draft/stage/geometry regressions, translated conditional preview and legacy builder.
- 23 unique backend scenarios: compiler/unknown conditions, defaults/publication, eight actual conditional PDFs without cross-recipient data mixing, original data regression, scoped authoring APIs and 200-package concurrent-idempotent creation. Local duration is not performance approval.
- Actual Hebrew authoring → Arabic390px private-draft recovery/publication → direct creation → DB readback and protected real two-page PDF hash. Decimal/false defaults retain default provenance; excluded annex has no document/task; original publication/signature geometry unchanged. English1280px/Arabic390px direction and arrow spacing corrected after a failed visual check. No horizontal overflow or console errors.
- Archive/restore's earlier browser gap is also closed on unchanged6819308; see supplemental lifecycle evidence.

All attempts, including failed tests and the failed English visual check, are in the outer workspace TEST-LEDGER and `workflow-ux-20261008/template-conditions-*` evidence. Compiler/creation changes invalidate dependent conditional/preview/submission results; builder/value/condition/select/locales edits invalidate related UI and visual evidence. Historical evidence is preserved.

Remaining F1 includes nested all/any and role-conditional authoring, multiple people/capacity/authority, client-card entry, decline/clarification/completed-copy, frozen bulk management, exact current QA and representative performance. Comparison currently preserves exact typed string equality (e.g. decimal scale is not normalized); numeric comparison semantics should be resolved with the remaining condition model, without rounding stored values. Do not describe this checkpoint as full condition-model completion.

No schema migration, liveQA/customer deployment, real test message, push or production tag. Application rollback can restore the preceding source while preserving immutable versions/evidence; no data rollback or destructive cleanup is required. LiveQA remains product1d031cc/QAa3061dc. Production readiness remains blocked.
