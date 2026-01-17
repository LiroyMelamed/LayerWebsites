# Evidence & Electronic Signature Disclosures (REQUIRES LOCAL COUNSEL)

**REQUIRES LOCAL COUNSEL — DO NOT RELY ON THIS AS LEGAL ADVICE.**

## Scope (Template)
These disclosures are intended for inclusion in:
- an **Evidence Certificate (PDF)**,
- an **Evidence Package README**,
- and/or terms shown to users.

## Signature Type (Template)
**REQUIRES LOCAL COUNSEL:** The signature produced by this system is an electronic signature captured and stored by the platform.

Example language (template only):
- This is **not** a PKI-based digital signature.
- This is **not** a qualified electronic signature (QES) unless explicitly stated.
- This system does not itself certify identity beyond the configured verification steps (e.g., OTP), if any.

## OTP / Verification (Template)
If OTP is enabled and required for this signing:
- A one-time code was sent via SMS to the configured phone number.

If OTP is waived:
- The platform records that OTP verification was waived by an authorized user.

## Evidence Package Contents (Template)
Typical evidence bundle may include:
- signed PDF document,
- document hash values,
- event timeline (audit trail),
- signer identifiers as configured,
- plan/retention snapshot at signing.

## Retention Snapshot at Signing (Template)
The evidence package may include:
- plan key at signing,
- retention days at signing (core + PII),
- retention policy hash.

## Required Local Changes
- Confirm required disclosures for your jurisdiction and use case.
- Confirm whether additional identity verification statements are required.
- Confirm any required formatting for evidentiary certificates.
