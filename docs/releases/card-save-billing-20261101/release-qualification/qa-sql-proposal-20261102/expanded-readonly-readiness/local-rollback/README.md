# Expanded local rollback evidence — 2026-11-02

**New evidence found; three complete inactive rollback versions per component remain unproved.**

This expands the earlier two-archive MelamedLaw review. The declared local frontend cache contains 32 complete build archives with 32 distinct SHA-256 hashes. All were stable during inspection, had no unsafe/private-like headers, contained index/asset-manifest, JS/CSS and logo/icon headers, and had zero missing local references from the public HTML/asset manifest.

| Target | Distinct full-build archives | Public reference closure | Independent historical publication-review tuples | Complete inactive versions newly certified |
|---|---:|---:|---:|---:|
| Melamedia | 20 | 20 | 0 | 0 |
| AshrafEssa | 6 | 6 | 1 | 0 |
| MorLevi | 3 | 3 | 1 | 0 |
| MelamedLaw | 3 | 3 | 1 | 0 |

The archives are under `/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/`. Exact paths, whole archive digests, member/reference counts, build receipts and source commits are in `archive-evidence.json`. Most compile receipts explicitly label the result NOT_PUBLISHED. They remain candidates; they do not count as verified historical rollback versions.

The Oct26 publication-review archive index matches an independent successful public verify receipt exactly for each of three clients:

- MelamedLaw: source `0631caf7b1c829673887e12c1d2e3ffc36c1715b`; qualified full archive SHA `87ca059ff527910d23493e23e45dde6425c48daa3dc1fea14e91319adca6b147`; review archive SHA `bcb19d40121a22ff32a0121759028a6380f04b10b49710afce8bf671de6dec55`.
- AshrafEssa: source `596aa5b7eb9b40f8cd5f6927132955ff6caf2175`; qualified full archive SHA `adf60d21756b002aa784f3f38af288ea3592c8daa2143f2b084e032de7a5ff5a`; review archive SHA `596dcb62f4ca5b51baea306e71a3801ee11bd26a8178a51533917bcf2bb7ec2e`.
- MorLevi: source `a50afb3fccaaee17633328ef62b5695336d73090`; full archive SHA `92005ece34155c2c5c4c9c42ad8556edda845bc6d6c7590f1c8621b243b43057`; review archive SHA `96d87be2554fcdb04ce8d85aef493167e029030deda70fb8fdf35008c3219c96`.

The publisher retained incumbent protected/root files and merged public HTML, so full-build index bytes differ from published index bytes. These are useful historical publication tuples; they do not prove each full-build archive is an exact complete historical deployed tree or inactive today. The third MelamedLaw qualified03 archive is a distinct Oct26 build, not a duplicate of the two Nov1 candidate archives.

New declared remote rollback locations were found in committed Oct6 DEPLOYED_VERIFIED receipts: `/root/reminder-layout-backups-20261006/{melamedia,morlevy,ashrafessa}.tar.gz` on the frontend VPS. Exact expected backup hashes and receipt paths are in `summary.json`; this local subtask did not connect to that host. The parent was notified so it can inspect those exact existing paths under its own authorized remote scope.

Bounded archive-filename inventory also covered existing `Projects/ops`, `Projects/LayerWebsites`, `Projects/melamedlaw-frontend-build`, `Projects/LawyerApp` and `Projects/LawyerApp-Melamedia`, excluding dependency/native build/cache/Git directories. No additional backend or frontend rollback archive appeared there. Five entrypoint-only tar archives were hashed/header-inspected in the declared visual/mobile cache roots; they lack a full static tree and cannot count as complete frontend rollback versions. No new complete backend runtime/dependency/configuration/inactivity version was established.

Remaining proof: identify three distinct complete inactive versions for each backend/frontend component; bind preserved root branding/assets and runtime/dependency/configuration recovery; verify historical provenance and inactivity. Current local findings do not close that gate.

Only local metadata, opaque archive hashes/headers, operational JSON receipt metadata and public index/asset-manifest streams were read. No archive file was extracted; no private archive member, credential or `.env` value was read. No network, SSH, storage/provider/database call, product change, new environment/schema/role, cleanup, restore or deployment occurred. A transient local exec transport failure happened before process creation, then a successful recovery probe allowed one unchanged retry; all work completed without denial or uncertain mutation.
