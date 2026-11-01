# MelamedLaw-specific billing review patch

Captured 2026-11-01T21:56:28.405225+00:00.
Immutable target: `5f3a4459256c225be14386178e3cec827e3c79e2`; shared-main base: `e3ab31d3ef6ee94d375eaf5df5bdf57d2c14715a`.
Candidate input: `c21c897b00fb3a969bd977d62615e6325879a1fc` with the two final test edits recorded in [shared evidence](compatibility.json).

**PASS:** the adapted 24-path patch passes `git apply --check` on the MelamedLaw export. After applying only to that disposable export, all nine billing JavaScript files and 12 test files exactly match the candidate working tree. All three locales match their surgical merge; every old locale value is unchanged.

The [shared patch](billing-application-tests.patch) still has the truthful **4/5** result: MelamedLaw fails only because its locale key order differs. This [Melamed-specific patch](melamed-billing-application-tests.patch) replaces only those three locale hunks. Its other 21 patch sections are byte-identical to the shared patch. Each locale change adds `billing.paymentUnconfirmed` from the candidate by one contiguous byte-sequence insertion (including the necessary comma), retaining all pre-existing bytes and key order. No whole-file JSON serialization is used.

Adapted patch SHA256: `c41df4476d61e022aad82e1959b051b3937130a72845590eb75f34bb40c9414a` (207120 bytes).
Shared patch SHA256: `08391d921d4f5c85071705be571c96dff3204565f1d40b4d368e320194403258`.

Only 19 existing selected files were archived; five new tests were intentionally absent before checking/applying. The parent authorized application exclusively to this owned temporary export. It was removed afterward. No actual source checkout, branch/ref, customer data, server or provider was changed; no network operation occurred.

**This verifies patch context and resulting source bytes, not functional QA or release approval.** Preserve tenant branding/configuration/data and run the coordinated shared-main integration/release checks separately. Changed source bytes, base or target pins require a new proof.

[Machine evidence](melamed-adapted.json) · [Reproduction script](check-melamed-adapted.py) · [All-target shared result](README.md)
