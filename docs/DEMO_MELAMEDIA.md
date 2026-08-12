# Melamedia QA / demo tenant

Wipeable demo for sales walkthroughs and QA. **Do not** copy MelamedLaw (or other production) data here.

## URLs

Preferred (Cloudflare):

- SPA: https://melamedia.mela-media.co.il
- API: https://api-melamedia.mela-media.co.il

Native app (`LawyerApp-Melamedia`) uses the same hosts via `app.json` `extra.apiBaseUrl` / `websiteUrl`.

## OTP login phones

| Name | Phone | Role |
|------|-------|------|
| לירוי מלמד | `0507299064` | Admin + **platform admin** |
| יוסי כהן | `0501234567` | **Primary demo client** (full dataset) |
| עו״ד דנה שמש | `0504111111` | Lawyer / case manager |
| עו״ד אמיר גולן | `0505111111` | Lawyer / case manager |
| עו״ד מלמדיה | `0503111110` | Extra Admin |
| נועה לוי / דני אברהם | `0502222222` / `0503333333` | Extra clients |

## Feature walkthrough checklist (seeded)

Reseed with (on API host, Melamedia only):

```bash
cd /root/Melamedia/backend
# optional: place /tmp/melamedia-demo.pdf first
node scripts/seed-melamedia-demo.js
```

### Admin (`0507299064`)

- Case types + stage labels (נדל״ן, תאונת דרכים, כללי, חוזים מסחריים)
- Cases list / my cases / tagged / closed
- Clients + managers lists
- Case stages + stage notes + stage PDFs + uploaded files
- Signing manager (pending file for יוסי כהן)
- Calendar (appointment, hearing, leave, reminder)
- Reminders (template + scheduled email)
- Notifications
- Platform settings (Melamedia branding)
- Billing (PRO subscription on admin tenant)

### Client (`0501234567`)

- Home / cases (4 cases including one closed)
- Case detail with stages and documents
- Signing queue (unsigned agreement)
- Notifications inbox
- Profile / ticket surfaces backed by same user

## Storage

Demo PDFs live under R2 prefix `melamedia/demo/` (bucket currently `morlevy-files` until a dedicated Melamedia bucket exists). DB backups: `db-backups/melamedia/`.

## Ops

- Branch: `Melamedia` (merge `main` → `Melamedia` → build/deploy)
- Backend: `/root/Melamedia`, PM2 `melamedia-api`, port `3003`
- Destructive cleanup of Melamedia demo DB is allowed **only when explicitly requested**
