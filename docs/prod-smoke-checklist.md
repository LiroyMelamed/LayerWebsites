# Production smoke checklist (post-deploy)

Goal: confirm the system is alive immediately after deploy with the *minimum* manual checks.

## 1) Service status (server)
- `pm2 status`
- `sudo systemctl status nginx --no-pager`
- `curl -sS http://127.0.0.1:5000/health`

## 2) App login (OTP)
- Open the site over HTTPS.
- Request OTP.
- Verify OTP.
- Confirm you land on the main screen.

## 3) Cases (CRUD)
- List cases.
- Open a case details page.
- Create a new case (if allowed in your role).
- Edit a case name (or another safe field) and confirm it persists.

## 4) WhatsApp group link
- As Admin, set a WhatsApp group link on a case.
- Refresh the case and confirm the link is persisted.

## 5) Notifications
- Ensure the device token can be saved (mobile client).
- Trigger a notification event (e.g. WhatsApp link update or signing upload).
- Confirm it appears in the notifications list.

## 6) Signing (basic happy path)
- Upload a small PDF for signing.
- Detect signature spots.
- Send to a signer.
- Sign a single spot.
- Confirm status progresses and the lawyer receives a “file signed” notification when complete.
- Download signed PDF link and open it.

## 7) Quick log sanity
- PM2 logs show no repeated crashes.
- No secrets printed in logs.
