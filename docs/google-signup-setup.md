# Google sign-up (Cloudflare Pages + D1)

- Code: `worker/_worker.js`, copied to `dist/_worker.js` by `build.py` (Pages advanced mode). Routes: `GET /api/auth/google`, `GET /api/auth/callback`, `GET|POST /api/auth/logout`, `GET|POST /api/me`. Everything else is served from static assets.
- Database: D1 `pitchboard-members` (id b1a9b41f-8e75-48c8-84e4-ea6572fff56b), bound as `DB`. Schema in `migrations/0001_members.sql`.
- Pages env (production): `GOOGLE_CLIENT_ID` (plain), `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (secrets). Session is an HMAC-signed, HttpOnly cookie, 30 days.
- Google client "pitchboard" (GCP project soulbound-auth) must list the redirect URI `https://pitchboard.soulbound.co.kr/api/auth/callback`.
- The newsletter box on /signup/ is pre-checked; the choice is stored on first sign-in and editable on /account/.
