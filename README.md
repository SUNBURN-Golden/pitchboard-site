# The Pitchboard site (frontend)

Static site for https://pitchboard.soulbound.co.kr - a directory of outlets that pay for book reviews and cultural criticism, a themed-calls calendar, and a weekly "Open Calls" newsletter (beehiiv).

## Build
`python3 build.py` (no dependencies) writes the site into `dist/` (about 100 pages).
Data lives in `data/outlets.json`, `data/calls.json`, and optional `data/sponsors.json`. Styles are in `static/style.css`.

## App and offline access
`/app/` searches outlet names and notes, filters status/region/minimum top rate (`pay_usd_max`), and lists calls with local reminders and calendar downloads. The build copies both JSON feeds, the manifest, and the service worker into `dist/`, and generates 192px/512px PNG icons using Python's standard library alongside the SVG source. No additional build tools are needed.

For local testing, run `python3 -m http.server 8000 --directory dist` and visit `http://localhost:8000/app/`. Installation and notifications require HTTPS in production (localhost works for development). Use the browser's Install app/Add to Home Screen command; on iPhone/iPad use Safari's Share menu.

Reminders live in localStorage under `pitchboard-reminders-v1`, with a service-worker cache copy for background checks and delivery deduplication. Enable notifications explicitly. A saved call sends one notification per deadline when the local calendar date is 0–3 days before the deadline; passed and rolling deadlines do not notify. Checks run on site launch, focus, and every minute while visible. Supported browsers can also grant periodic background sync, requested at a 12-hour minimum interval; its timing is controlled by the browser. For a scheduled alert while the app is closed, download `.ics` and import it into a calendar that supports event alarms. Calendar events are all-day with a three-day alarm; verify the outlet's closing time and time zone.

Static assets use cache-first delivery; JSON feeds and page navigation use network-first delivery with saved responses when offline. Asset/data/app-shell changes generate a new cache version. Cache updates keep reminders, and the app works offline after the first successful service-worker installation. Outlet links that have not been visited fall back to the app when offline.

Run the dependency-free service-worker behavior checks with `node --test tests/sw.test.js` (Node 18+). They cover deadline boundaries, cancellation and changed deadlines, duplicate prevention, permission failures, offline caches, and cache updates.

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
