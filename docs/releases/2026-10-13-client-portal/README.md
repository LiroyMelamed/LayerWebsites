# Client personal area — 13 October 2026

The released personal area prioritizes pending actions, offers one document library with All / Waiting for me / I signed filters, and preserves the existing navigation shell and case progress.

- [Hebrew illustrated PDF guide](guide/client-personal-area-guide-he.pdf)
- [Interactive Hebrew guide](guide/client-personal-area-guide-he.html)
- [Customer update draft — not sent](CUSTOMER-UPDATE-DRAFT.md)
- [Deployment and verification snapshot](RELEASE.md)
- [Exact runtime candidate map](SOURCE-RUNTIME-MAP.md)
- [Prepared rollback record](ROLLBACK.md)

The deployment snapshot was frozen before Git publication and therefore explicitly leaves remote branch/tag confirmation to the final coordinator receipt. The common annotated release tag is `PROD_13_10_2026_LIROY_CLIENT_PORTAL`; tenant tags identify exact runtime commits in the map.

Native verification used the installed iOS application in an iPhone simulator with synthetic data. Figma’s nine editable views were verified locally and backed up; cloud synchronization remained unconfirmed because the desktop app reported a reconnect warning. No customer update was sent.
