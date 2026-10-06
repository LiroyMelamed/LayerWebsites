# HTTP runtime dependency patches

The release audit identified compression 1.8.1 and proxy-addr 2.0.7. The lockfile now resolves compression 1.8.2 and proxy-addr 2.0.8; compression's declared minimum is also updated.

- [Compression advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95): an interrupted compressed response did not release its zlib stream. The application enables this middleware above 1024 bytes.
- [Proxy address advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): incorrectly trusted IPv4 peers for certain IPv6 trust subnets. This application's current trust-proxy configuration is Boolean, so the specific subnet trigger was not established here. The compatible dependency patch is included.

Validation uses only a local HTTP server and synthetic text. A single aborted response checks compressor disposal; no load or denial-of-service test is performed. A separate test exercises bounded IPv4/IPv6 trust decisions, including valid loopback and mapped subnets. Both regression cases fail against the previous dependencies and pass against the patched dependencies. Normal compressed Hebrew text remains byte-identical after decompression.

Run from backend:

```sh
node --require ./tests/helpers/settingsIsolation.js --test tests/httpDependencyRegression.test.js tests/rateLimiter.test.js tests/authMiddleware.shape.test.js tests/signingFinalArtifact.test.js
npm audit --omit=dev
```

Result: 22 checks pass; the production dependency audit reports zero findings at the time of verification. This is not a claim that all application vulnerabilities are absent. Native and frontend build-tool advisories are tracked separately. QA deployment and customer rollout remain independent gates.
