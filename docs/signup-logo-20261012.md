# Business logo on new-office signup — 2026-10-12

Owner requested a required signup logo reused by the new website and retained for future app-store build automation. This change does not build or publish store applications.

PNG/JPEG, square 1,024–4,096px, up to 2MiB; server decodes and strips metadata, preserves transparency, caps output at 2,048px. Project-scoped R2 `signup-logos/<intent UUID>/<SHA-256>.png` holds the sanitized image. Signup stores durable asset metadata; successful provisioning copies it to `tenants.branding.logoAsset` and `logoUrl`. Existing signup intents without an asset remain recoverable. No existing tenant branding is overwritten.

## Validation

Source baseline 877043d9 plus logo patch. Synthetic isolated signup_legal_qa test passed missing-logo denial, idempotent single upload, real schema provisioning with mocked card/storage provider, retained tenant branding and source metadata. Gate HTTP suite: 1 passed. Sharp 0.35.4. Evidence private: ~/.codex/signup-logo-20261012/legal-db-r3.log and legal-gate-r4.log.

Legacy production frontend build passed with existing repository lint warnings (CI strict build rejects those warnings; logs preserved). The shared legal runtime receives only logo read routes, image dependency, and UI/branding resolution. No new provisioning code, migration, payment behavior, or tenant-isolation changes are deployed there. New-office signup remains disabled pending the existing tenant-isolation blocker. Maintained source includes the future additive schema and provisioning contract; those are not claimed production active.
