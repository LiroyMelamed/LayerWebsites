# Contact correction and link renewal — local checkpoint, 8 October 2026

An authorized office user can correct only the delivery profile for the same person in the selected current package revision. A reason and exact revision/profile version are required. This preserves client records, immutable package content and existing signatures. Saving alone sends nothing; Save and review opens an explicit send review. A custom role needs manage plus the new delivery_contact_correct permission. Renewal requires upload plus explicit access_link_renew; catalog v5 does not infer either from old permissions.

Correction and renewal increment the selected profile version and revoke consent sessions containing that revision. Shared grants retain their other packages; frozen consent never silently shrinks. New consent and acceptance serialize with profile changes. OTP challenge/verify recheck current grant scope. Renewal requires an explicit channel and freezes only current ready tasks; it does not extend a business deadline, invite future-stage work or bypass authority checks. The durable queue rechecks sender permission, profile, link, task set and deadline after competing locks. Uncertain sends remain quarantined.

A review discovered that the prior public acceptance path recorded authority snapshots but did not recheck current authority heads at final acceptance. This checkpoint adds that fence, ordered consistently across selected revisions, and proves post-OTP revocation rejects acceptance with zero actions. Earlier authority activation tests did not prove this case.

## Evidence and limits

Outer TEST-LEDGER and workflow-ux-20261008/contact-* retain every passed and failed run. Current focused suites: contact7 children; follow-up10 children; renewal4 children; catalog10; authority activation1; incumbent public signing main and5completed-copy children. Tests use the exact source/dependency mirror and isolated local55442, fake transport only. UI contact8 and existing workspace33 pass; lint02/build03 pass.

Actual browser: Hebrew1280 Save only and Arabic390 Save and review create no message until explicit renewal confirmation. One current PDF is reviewed and delivered once to the fake provider. A fresh incumbent consent/Arabic-digit OTP session accepts only that task; the previous person's accepted action and immutable package snapshot stay unchanged. Finish only routes the intentionally anonymous harness to Login. The later task is not accepted; this harness does not run post-public-accept background jobs. Separate realPDF/returning-stage regression covers those workers. English1280/Arabic390 have correct reason-field direction, no overflow and44px inputs/buttons plus60px textarea. Owned8135/tab36 are closed. No actual outbound sends.

Initial fixture count/expiry failures, missed test-label query and mobile field-size/direction failures are preserved, not omitted. The final two server refinements (selected-only consent package locks and412 CAS) were reverified by contact/public integration; browser UI source is unchanged from build03.

## Outstanding production gates

Internal approval, cancellation/replacement/assignment and pending projection integration; actual multiple-person Excel upload; exact representative200people/600+ and1200realPDF performance; focused current MelamediaQA. Historical PDF time failure remains open. No production approval, push, deployment or production tag. Owner restrictions still prohibit customer tenant deployments.
