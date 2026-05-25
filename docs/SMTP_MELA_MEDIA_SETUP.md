# SMTP setup for `mela-media.co.il` (Mor Levy + Ashraf Essa)

## Current state (checked May 2026)

| Item | Status |
|------|--------|
| `mela-media.co.il` MX | **None** — mail cannot work until MX/SPF/DKIM exist |
| Mor Levy API SMTP | Uses `mail.melamedlaw.co.il` + `noreply@melamedlaw.co.il` |
| Ashraf Essa API SMTP | Same MelamedLaw server (wrong domain for branding) |
| App expects | `noreply@morlevy.mela-media.co.il`, `noreply@ashrafessa.mela-media.co.il` |

The backends are **separate** (`/root/MorLevi`, `/root/AshrafEssa`). Each has its own `backend/.env` SMTP block. They do **not** share config — only the mail server was shared.

**Important:** With cPanel-style SMTP, `SMTP_USER` and `SMTP_FROM_EMAIL` must be the **same mailbox** (the app enforces this in code).

---

## Recommended layout

Create **two mailboxes** (same mail host, different addresses):

| Tenant | Mailbox | Display name (SMTP_FROM_NAME) |
|--------|---------|-------------------------------|
| Mor Levy | `noreply@morlevy.mela-media.co.il` | משרד עו"ד מור לוי |
| Ashraf Essa | `noreply@ashrafessa.mela-media.co.il` | משרד עורכי דין אשראף עיסא |

Alternative (simpler DNS): one domain mailbox `noreply@mela-media.co.il` per tenant is **not** possible on strict cPanel without aliases — use two addresses as above.

---

## Step 1 — Mail hosting (pick one)

### A) Same host as MelamedLaw (easiest if you have cPanel)

1. Log in to the hosting panel where `mail.melamedlaw.co.il` lives.
2. **Addon domain:** add `mela-media.co.il`.
3. **Subdomains** (for email accounts): `morlevy.mela-media.co.il`, `ashrafessa.mela-media.co.il` (if the panel requires subdomain for `noreply@morlevy...`).
4. Create email accounts:
   - `noreply@morlevy.mela-media.co.il` + strong password
   - `noreply@ashrafessa.mela-media.co.il` + strong password
5. Note SMTP settings from the panel (usually):
   - Host: `mail.mela-media.co.il` or `mail.melamedlaw.co.il`
   - Port: `465` (SSL) or `587` (STARTTLS)

### B) Cloudflare Email **Sending** (domain on Cloudflare, no classic SMTP)

- Dashboard → **Email** → **Email Sending** → onboard `mela-media.co.il`
- Add DNS records Cloudflare provides (SPF, DKIM, DMARC)
- Sending uses **API**, not `SMTP_HOST` in `.env` — would need a small code change (not configured today).

### C) Transactional provider (Resend, SendGrid, Amazon SES)

- Verify domain `mela-media.co.il`
- Create two sender identities or one domain with multiple from-addresses
- Use their SMTP relay host/user/pass in each tenant `.env`

---

## Step 2 — DNS (Cloudflare for `mela-media.co.il`)

After choosing host (example for cPanel on `mail.mela-media.co.il`):

```
Type  Name    Content                    Priority
MX    @       mail.mela-media.co.il      10
A     mail    <your-mail-server-IP>
TXT   @       v=spf1 a mx ip4:<IP> -all   (panel often gives exact SPF)
TXT   default._domainkey   (DKIM — from mail panel)
TXT   _dmarc  v=DMARC1; p=none; rua=mailto:you@...
```

For **subdomain** mailboxes, some panels also need MX on `morlevy` / `ashrafessa` subdomains — follow the host’s wizard.

Wait for DNS propagation (up to 24h, often minutes).

---

## Step 3 — Backend `.env` (per tenant, on `37.60.230.148`)

### Mor Levy — `/root/MorLevi/backend/.env`

```env
SMTP_HOST=mail.mela-media.co.il
SMTP_PORT=465
SMTP_USER=noreply@morlevy.mela-media.co.il
SMTP_PASS=<mailbox-password>
SMTP_FROM_EMAIL=noreply@morlevy.mela-media.co.il
SMTP_FROM_NAME=משרד עו"ד מור לוי
```

### Ashraf Essa — `/root/AshrafEssa/backend/.env`

```env
SMTP_HOST=mail.mela-media.co.il
SMTP_PORT=465
SMTP_USER=noreply@ashrafessa.mela-media.co.il
SMTP_PASS=<mailbox-password>
SMTP_FROM_EMAIL=noreply@ashrafessa.mela-media.co.il
SMTP_FROM_NAME=משרד עורכי דין אשראף עיסא
```

Then restart **only** that API:

```bash
pm2 restart morlevy-api      # Mor Levy only
pm2 restart ashrafessa-api   # Ashraf only
```

---

## Step 4 — Platform settings (optional override in UI)

In **הגדרות פלטפורמה → messaging**, set:

- `SMTP_FROM_EMAIL` — same as mailbox address
- `SMOOVE_EMAIL_FROM_NAME` / sender display name if shown

Env vars are the source of truth if DB value is NULL.

---

## Step 5 — Test

From repo:

```bash
cd backend
SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... SMTP_FROM_EMAIL=... \
  node scripts/test-smtp.js you@gmail.com
```

Or send a test notification from the app after restart.

---

## What we will **not** do automatically

- Creating mailboxes in your registrar/hosting (needs your panel login)
- Changing Mor Levy production `.env` until you confirm mail host + passwords
- Touching `melamedlaw` DB or `melamed-backend`

Once mailboxes exist, share SMTP host + the two `noreply@...` passwords (secure channel) and we can apply `.env` + restart + test.
