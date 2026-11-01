# Local review of safe health GET and existing publication receipts

Reviewed locally at 2026-11-01T22:04:38.013523+00:00. No network, server, DB, provider, source mutation or test execution occurred in this subtask.

## Safe health request

Use exactly unauthenticated `GET /health` on the known public API origin, with no tenant headers, request body, query, cookies or authorization; do not follow redirects. `backend/app.js:213` returns only `{ok:true}`. `resolveTenant` does not query a tenant when no alias is supplied; `requireBillingAccess` explicitly exempts `/health` before calling a billing snapshot. `GET /api/platform/v1/health` is a different service-key/DB-ping endpoint and is outside this minimal no-DB probe. Avoid billing UI/API reads because their snapshot path can normalize billing state or expire grace.

The health route and both guard/resolver blobs match in the previously observed four client baseline commits (`5f3a4459`, `ab271c53`, `08f1a988`, `ca31b04e`). They are source inspection, not newly loaded-process binding. The parent must compare with its fresh deployed source observations.

## Existing source/artifact evidence

| Tenant | Parent fresh remote pin | Existing published frontend source | Main JS | Main CSS | Existing public proof UTC |
| --- | --- | --- | --- | --- | --- |
| AshrafEssa | bc964428 | bc964428 | static/js/main.b15bba80.js | static/css/main.42e8b4df.css | 2026-11-01T22:00:40.975661+00:00 |
| Melamedia | 61507869 | 61507869 | static/js/main.ae388fc0.js | static/css/main.9bf17f76.css | 2026-11-01T22:00:52.605680+00:00 |
| MorLevi | f5220552 | f5220552 | static/js/main.15483ae9.js | static/css/main.42e8b4df.css | 2026-11-01T22:00:52.825966+00:00 |
| MelamedLaw | 5e2da32b | 5f3a4459 | static/js/main.93266448.js | static/css/main.42e8b4df.css | 2026-11-01T18:55:37.104295+00:00 |

For each row, the build receipt, publication receipt and full archive SHA256 match the original public proof's immutable inputs. Main JS, main CSS and asset-manifest bytes were read directly from the preserved archive without extraction and independently hash-match the existing public proof. The recorded build exited0 with stable source/dependencies. This is local receipt/artifact integrity validation; live public bytes must still be read by the parent and compared now.

Melamed caveat: fresh remote `5e2da32b` differs from published `5f3a4459` only in `frontend/src/screens/platformSettingsScreen/PlatformSettingsScreen.js` (SMS sender display). No backend file differs. Do not call the new display deployed from Git alone. The latest matching publication receipt found here is the18:55 proof below.

The older Mor public403/live-front-lock hold is temporally stale: a22:00 existing public proof records HTTP200 and exact compiled bytes. It does not remove any current missing-lock requirement; the parent should label its new observation independently.

## Exact sanitized metadata

```json
[
  {
    "tenant": "AshrafEssa",
    "remotePinSuppliedByParent": "bc964428a38bfa63a62b3ef6a5782c9b2e86d28a",
    "publishedFrontendCandidate": "bc964428a38bfa63a62b3ef6a5782c9b2e86d28a",
    "publicProofFinishedAtUtc": "2026-11-01T22:00:40.975661+00:00",
    "existingPublicProofResult": "PASS_PUBLIC_HTTPS_COMPILED_ARTIFACTS_AND_TWO_HEALTH_READS",
    "frontendOrigin": "https://ashrafessa.mela-media.co.il/",
    "healthUrls": [
      "https://api-ashrafessa.mela-media.co.il/health"
    ],
    "integrityChecks": {
      "buildReceiptHash": true,
      "publicationReceiptHash": true,
      "compiledArchiveHash": true
    },
    "buildExitCode": 0,
    "sourceStableInRecordedBuild": true,
    "dependenciesStableInRecordedBuild": true,
    "sourceHeadAtBuildFinish": "bc964428a38bfa63a62b3ef6a5782c9b2e86d28a",
    "publicProofPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/final/PUBLIC-ashrafessa-20261101T220036103023Z.json",
    "publicProofSha256": "fa5e8e4a38634ec2695f807b8818b36733670852cd79d0e92e14949ac72a4e65",
    "buildReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs/word-stage-candidate-20261026/build/ashrafessa-sms-number-hidden-20261101/build.json",
    "publicationReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/sms-sender-ui/STATIC-ashrafessa-apply-20261101T215946735922Z.json",
    "compiledArchivePath": "/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/ashrafessa-sms-number-hidden-20261101/full-build.tar.gz",
    "compiledArchiveSha256": "c8b68e6467b45f47b6d1cfae05735d6a1345ba7dc250c0d5005ab67a540feca8",
    "assets": {
      "main.js": {
        "path": "static/js/main.b15bba80.js",
        "sha256": "7e948bc3de129c8417db4cd7fb4da5c3952c1b0be7d3d7a530fb2c5c3bd7fd3d",
        "bytes": 1905456,
        "matchesExistingPublicProof": true
      },
      "main.css": {
        "path": "static/css/main.42e8b4df.css",
        "sha256": "1f46257b0dc85897caf35388b1d6898e330e126aa4c9fec75f3df0486f0afcd2",
        "bytes": 243695,
        "matchesExistingPublicProof": true
      },
      "manifest": {
        "path": "asset-manifest.json",
        "sha256": "4cbb0e7150688d038a174fe922b4bae50316a437a16bcc893edfcd8815993529",
        "bytes": 16083,
        "matchesExistingPublicProof": true
      }
    }
  },
  {
    "tenant": "Melamedia",
    "remotePinSuppliedByParent": "615078693afd117e2d488f5c5355f1338d622ad8",
    "publishedFrontendCandidate": "615078693afd117e2d488f5c5355f1338d622ad8",
    "publicProofFinishedAtUtc": "2026-11-01T22:00:52.605680+00:00",
    "existingPublicProofResult": "PASS_PUBLIC_HTTPS_COMPILED_ARTIFACTS_AND_TWO_HEALTH_READS",
    "frontendOrigin": "https://melamedia.mela-media.co.il/",
    "healthUrls": [
      "https://api-melamedia.mela-media.co.il/health"
    ],
    "integrityChecks": {
      "buildReceiptHash": true,
      "publicationReceiptHash": true,
      "compiledArchiveHash": true
    },
    "buildExitCode": 0,
    "sourceStableInRecordedBuild": true,
    "dependenciesStableInRecordedBuild": true,
    "sourceHeadAtBuildFinish": "615078693afd117e2d488f5c5355f1338d622ad8",
    "publicProofPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/final/PUBLIC-melamedia-20261101T220047189931Z.json",
    "publicProofSha256": "6befb541662385585afecc85bc93ea1183c4b4cc46a4afbf69ab197818cf96a6",
    "buildReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs/word-stage-candidate-20261026/build/melamedia-sms-number-hidden-20261101/build.json",
    "publicationReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/sms-sender-ui/STATIC-melamedia-apply-20261101T215616147603Z.json",
    "compiledArchivePath": "/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/melamedia-sms-number-hidden-20261101/full-build.tar.gz",
    "compiledArchiveSha256": "de93b045c89b9406ca49b18d7a2c4dbc090b47393c9b7133226bab5c6fce909e",
    "assets": {
      "main.js": {
        "path": "static/js/main.ae388fc0.js",
        "sha256": "fc1ad2bdaed19addd19554da0c451d8f346d28edfa17eaa272bc9afea3cbf5fd",
        "bytes": 1912587,
        "matchesExistingPublicProof": true
      },
      "main.css": {
        "path": "static/css/main.9bf17f76.css",
        "sha256": "4d30484d8b3bf5ac6030c336ce9c97efa411319e591023a9cc00253399d04b3b",
        "bytes": 243719,
        "matchesExistingPublicProof": true
      },
      "manifest": {
        "path": "asset-manifest.json",
        "sha256": "caf65131a5c99f25a624954fb1a7a7252972f23a729644e3a930c29904acaed7",
        "bytes": 16083,
        "matchesExistingPublicProof": true
      }
    }
  },
  {
    "tenant": "MorLevi",
    "remotePinSuppliedByParent": "f5220552918507a8b34b30cb7fb0cc41f3f0710b",
    "publishedFrontendCandidate": "f5220552918507a8b34b30cb7fb0cc41f3f0710b",
    "publicProofFinishedAtUtc": "2026-11-01T22:00:52.825966+00:00",
    "existingPublicProofResult": "PASS_PUBLIC_HTTPS_COMPILED_ARTIFACTS_AND_TWO_HEALTH_READS",
    "frontendOrigin": "https://morlevy.mela-media.co.il/",
    "healthUrls": [
      "https://api-morlevy.mela-media.co.il/health"
    ],
    "integrityChecks": {
      "buildReceiptHash": true,
      "publicationReceiptHash": true,
      "compiledArchiveHash": true
    },
    "buildExitCode": 0,
    "sourceStableInRecordedBuild": true,
    "dependenciesStableInRecordedBuild": true,
    "sourceHeadAtBuildFinish": "f5220552918507a8b34b30cb7fb0cc41f3f0710b",
    "publicProofPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/final/PUBLIC-morlevy-20261101T220047189931Z.json",
    "publicProofSha256": "1f4de1b511bd36670291804fc2f62822eb2390ef5525534232028eec3a4752dc",
    "buildReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs/word-stage-candidate-20261026/build/morlevy-sms-number-hidden-20261101/build.json",
    "publicationReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/sms-sender-ui/STATIC-morlevy-apply-20261101T215956284077Z.json",
    "compiledArchivePath": "/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/morlevy-sms-number-hidden-20261101/full-build.tar.gz",
    "compiledArchiveSha256": "87d5782148f1c61224e8d7bf5d17de5d65c0b1ef3c5d13bebff94e7e3baf89a6",
    "assets": {
      "main.js": {
        "path": "static/js/main.15483ae9.js",
        "sha256": "9a7e53efcc315979251fdfd5215161e0a00751331ba0bb80db1917833e661281",
        "bytes": 1920836,
        "matchesExistingPublicProof": true
      },
      "main.css": {
        "path": "static/css/main.42e8b4df.css",
        "sha256": "1f46257b0dc85897caf35388b1d6898e330e126aa4c9fec75f3df0486f0afcd2",
        "bytes": 243695,
        "matchesExistingPublicProof": true
      },
      "manifest": {
        "path": "asset-manifest.json",
        "sha256": "701c12dea0b77a2823415d6a36de9bb0d29f55a10ae37327632e37db147da9aa",
        "bytes": 15913,
        "matchesExistingPublicProof": true
      }
    }
  },
  {
    "tenant": "MelamedLaw",
    "remotePinSuppliedByParent": "5e2da32b3ebad7b77ace52d50227584a94e1e3ed",
    "publishedFrontendCandidate": "5f3a4459256c225be14386178e3cec827e3c79e2",
    "publicProofFinishedAtUtc": "2026-11-01T18:55:37.104295+00:00",
    "existingPublicProofResult": "PASS_PUBLIC_HTTPS_COMPILED_ARTIFACTS_AND_TWO_HEALTH_READS",
    "frontendOrigin": "https://client.melamedlaw.co.il/",
    "healthUrls": [
      "https://api.calls.melamedlaw.co.il/health"
    ],
    "integrityChecks": {
      "buildReceiptHash": true,
      "publicationReceiptHash": true,
      "compiledArchiveHash": true
    },
    "buildExitCode": 0,
    "sourceStableInRecordedBuild": true,
    "dependenciesStableInRecordedBuild": true,
    "sourceHeadAtBuildFinish": "5f3a4459256c225be14386178e3cec827e3c79e2",
    "publicProofPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/final/PUBLIC-melamedlaw-20261101T185533620101Z.json",
    "publicProofSha256": "62b1e30faeca3e3dca9fc5da4c45801161f45c808d775d579eddda89134ba50d",
    "buildReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs/word-stage-candidate-20261026/build/melamedlaw-common-r5-ready-20261101/build.json",
    "publicationReceiptPath": "/Users/liroymelamed/Documents/Codex/2026-10-25/melamedlaw/outputs/cursor-reconciliation-20261101/fleet-rollout/production-tools/FTPS-publish-20261101T185404684619Z.json",
    "compiledArchivePath": "/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/melamedlaw-common-r5-ready-20261101/full-build.tar.gz",
    "compiledArchiveSha256": "5db07c3b92d57eec318bf824cb98681f0239a88e32aa9ff53c73bd9096b01cc8",
    "assets": {
      "main.js": {
        "path": "static/js/main.93266448.js",
        "sha256": "e51a99a317131fe2816cb518617ad5332e9b28e0ca9005309fbd61c9c60b77ed",
        "bytes": 1921633,
        "matchesExistingPublicProof": true
      },
      "main.css": {
        "path": "static/css/main.42e8b4df.css",
        "sha256": "1f46257b0dc85897caf35388b1d6898e330e126aa4c9fec75f3df0486f0afcd2",
        "bytes": 243695,
        "matchesExistingPublicProof": true
      },
      "manifest": {
        "path": "asset-manifest.json",
        "sha256": "51c5d0f452d6d695da115473bb0e9bf07f56f8a906222cf46056fe702d8312a1",
        "bytes": 15913,
        "matchesExistingPublicProof": true
      }
    },
    "pinCaveat": "Fresh GitHub pin has one newer frontend-only SMS sender display change; this older published frontend receipt is not proof that newer UI is live. Backend tree unchanged between5f3 and5e2."
  }
]
```

No actual production health request or current frontend download was made by this local-review subtask. No source/branch/ledger/environment/access was modified. Idm is retired and excluded.
