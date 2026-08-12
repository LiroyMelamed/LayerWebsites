# Melamedia QA / demo tenant

Wipeable demo for sales walkthroughs and QA. **Do not** copy MelamedLaw (or other production) data here.

## URLs

- SPA: https://melamedia.mela-media.co.il (interim: `https://melamedia.84.46.253.85.sslip.io` until DNS is live)
- API: https://api-melamedia.mela-media.co.il (interim: `https://api-melamedia.37.60.230.148.sslip.io`)

## OTP login phones (seed)

| Name | Phone | Role |
|------|-------|------|
| לירוי מלמד | `0507299064` | Admin + platform admin |
| עו״ד מלמדיה | `0503111110` | Admin + platform admin |
| עו״ד דנה שמש | `0504111111` | Lawyer |
| עו״ד אמיר גולן | `0505111111` | Lawyer |
| יוסי כהן | `0501234567` | Client |
| נועה לוי | `0502222222` | Client |
| דני אברהם | `0503333333` | Client |

OTP is SMS (Smoove). Use real reachable numbers for the demo admins/lawyers you will log in with.

## Sample data

- Cases: חוזה שכירות — מלמדיה, רכישת דירה — כהן, ייעוץ עסקי — לוי
- Calendar: sample appointments tied to demo lawyers/clients (seeded on Melamedia DB only)

## Ops

- Branch: `Melamedia` (merge `main` → `Melamedia` → build/deploy)
- Backend: `/root/Melamedia`, PM2 `melamedia-api`, port `3003`
- Destructive cleanup of the Melamedia demo DB is allowed **only when explicitly requested**. Never wipe MelamedLaw / MorLevi / AshrafEssa.
