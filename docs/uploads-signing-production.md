# Uploads + Signing (production limits & timeouts)

Date: 2025-12-30

This document defines the production limits for uploads/signing and how to keep them consistent end-to-end for:
- Ubuntu + Nginx
- Node.js/Express API (PM2)
- R2/S3-compatible object storage

## Important architecture note
Most “file uploads” in this app are **direct-to-R2** using a presigned URL.
That means:
- Nginx/Express **does not receive the PDF bytes** for the initial upload.
- The backend *does* receive:
  - `fileKey` references to the uploaded object
  - signature images (`signatureImage`) in JSON
  - requests that trigger PDF download/processing (signature detection, rendering)

Because of that, enforcement is split:
- **PDF max size is enforced server-side** by `HEAD`ing the object in R2 before accepting signing flows.
- **API request size/timeouts are enforced** at Nginx and Express.

---

## Limits (recommended defaults)

### 1) Max signing PDF size (R2 object)
Backend env:
- `MAX_SIGNING_PDF_BYTES` (default: 25MB)

Where it is enforced:
- Signing upload flow: rejects too-large `fileKey` before DB insert.
- Signature detection: rejects too-large `fileKey` before downloading PDF to memory.

Failure shape:
- HTTP `413`
- JSON `{ code: 'REQUEST_TOO_LARGE', message: 'File is too large' }`

### 2) Max signature image size (API JSON)
Backend env:
- `MAX_SIGNATURE_IMAGE_BYTES` (default: 512KB)

Where it is enforced:
- `/api/SigningFiles/:signingFileId/sign`

Failure shape:
- HTTP `413`
- JSON `{ code: 'REQUEST_TOO_LARGE', message: 'Signature image is too large' }`

### 3) API body limits (Express)
Backend env:
- `API_JSON_LIMIT` (default: `50mb`)
- `API_URLENCODED_LIMIT` (default: `50mb`)

Failure shape:
- HTTP `413`
- JSON `{ code: 'REQUEST_TOO_LARGE', message: 'Request too large' }`

### 4) Server-side timeouts (Express + Node)
Backend env:
- `API_REQUEST_TIMEOUT_MS` (default: `30000`)
- `SIGNING_PDF_OP_TIMEOUT_MS` (default: `20000`) (R2 HEAD/GET + PDF processing guard)
- `SERVER_REQUEST_TIMEOUT_MS` (default: `60000`)
- `SERVER_HEADERS_TIMEOUT_MS` (default: `65000`)
- `SERVER_KEEPALIVE_TIMEOUT_MS` (default: `5000`)

Timeout failure shape (when the server can respond):
- HTTP `504`
- JSON `{ code: 'REQUEST_TIMEOUT', message: 'Request timed out' }`

---

## Nginx settings (API reverse proxy)
Your Nginx config must allow request bodies at least as large as your Express limits.

Minimal example for `/api/` (adapt to your server block):

```nginx
# API uploads (JSON payloads like signatureImage)
client_max_body_size 50m;

location /api/ {
  proxy_pass http://127.0.0.1:5000;

  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # Timeouts for slower PDF operations
  proxy_connect_timeout 15s;
  proxy_send_timeout 60s;
  proxy_read_timeout 60s;
  send_timeout 60s;
}
```

Guidance:
- Set `client_max_body_size` to **match or exceed** `API_JSON_LIMIT`.
- Set proxy timeouts to **match or exceed** `SERVER_REQUEST_TIMEOUT_MS`.

---

## Allowed file types
- PDFs are expected for signing documents.
- Signature images are expected as PNG/JPEG.

If you expand allowed types later, update both:
- frontend upload validation
- backend presign endpoint validation (if you add it)

---

## Logging (no secrets / minimal PII)
- Avoid logging full `fileKey` values in production.
- Avoid logging signer names / phone numbers.

Backend behavior:
- Signing debug logs are only enabled when `SIGNING_DEBUG_LOGS=true` **and** `IS_PRODUCTION!=true`.

---

## Quick verification

### Verify API 413 JSON shape
Run from server (or locally) with an oversized JSON request:

```bash
curl -sS -X POST http://127.0.0.1:5000/api/Auth/RequestOtp \
  -H 'Content-Type: application/json' \
  --data '{"phoneNumber":"'"$(python3 - <<'PY'
print('x' * 200000)
PY
)'"}'
```

Expected:
- HTTP 413
- JSON includes `code: REQUEST_TOO_LARGE`

### Verify PDF max size enforcement
Upload a PDF larger than `MAX_SIGNING_PDF_BYTES` to R2, then attempt the signing upload flow.
Expected:
- HTTP 413
- `{ code: 'REQUEST_TOO_LARGE', message: 'File is too large' }`
