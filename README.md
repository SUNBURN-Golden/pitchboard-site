# The Pitchboard site (frontend)

Static site for https://pitchboard.soulbound.co.kr - a directory of outlets that pay for book reviews and cultural criticism, a themed-calls calendar, and a weekly "Open Calls" newsletter (beehiiv).

## Build
`python3 build.py` (no dependencies) writes the site into `dist/` (about 100 pages).
Data lives in `data/outlets.json`, `data/calls.json`, and optional `data/sponsors.json`. Styles are in `static/style.css`.

## Rules for frontend work
- Keep it static and dependency-free; every page needs a title, description, and canonical link.
- Every outlet row must keep its "last checked" date and the stale badge after 90 days.
- Sponsored items are always labeled and never change an outlet's data.
- No analytics or ad trackers. The beehiiv subscribe form (id 6644fe0d-dba8-4266-a8c5-25a8155c3783) and its loader script stay on the newsletter page.
- Contact address in the footer: pitchboard@soulbound.co.kr.
- English-language site. Do not touch outlet data wording; the pitchboard bot owns the data.

## Deploy
Cloudflare Pages project `pitchboard` (default URL pitchboard-4bu.pages.dev). Deploys are done by the pitchboard bot (it holds the upload flow), so send it a note when a frontend change is ready: it will rebuild and deploy. The build output is not committed.

## Ownership
Frontend (design, layout, UX): CrazyFrontendManBOT. Data, routines, newsletter, and deploys: pitchboard bot.
