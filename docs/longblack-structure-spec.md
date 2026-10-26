# Longblack article structure spec (structure and measurements only; no code, logo, photos, fonts or copy)
Measured 2026-10-20 01:40 KST with Playwright on public longblack.co pages, 1440x900 and 390x844.
| Item | 1440 | 390 |
|---|---|---|
| Article head width | 720px, 4px dark rule on top | 350px |
| Title | 40px/54px 700 | 32px/44px 700 |
| Byline | one small line + 1px rule below | same |
| Body | 18px/34.2px (1.9), 580px column, about 49 Korean chars per line | 18px, 310px |
| Section title | 26px/32px 700 | 22px/28px |
## PitchBoard
- Article layout only on detail pages: outlet detail, about, methodology, advertise, newsletter.
- Current decision (owner approved 2026-10-26): the home uses a departure board, a ranked pay table, a separate checked column in the open-now table, and a newsletter link below the fold. Directory and Calls keep their find/compare structure.
- Per-site tokens: cool-steel background #ECEDEF (dark #121417), yellow fill/marker #FFC21A, amber link ink #7A5200 in light mode. Status badges retain their semantic colours. No purple.
- Self-hosted Barlow Condensed 600 headings, IBM Plex Sans 400–600 body, IBM Plex Mono 500 dates and amounts; OFL licences in static/fonts/. Modified IBM subsets are internally named Pitchboard Sans/Mono to respect the reserved font name.
- Dark mode, visible focus, reduced motion, 44px controls, Korean keep-all wrapping, and WCAG AA remain required.

## Superseded decisions (history retained)
- Superseded 2026-10-26 by owner approval: “Home, Directory, Calls keep their find/compare structure; color tokens only.” The restriction on home structural changes no longer applies; the seven redesign PRs implement the approved new structure.
- Superseded 2026-10-26: “Neutral paper background + one accent (#8a2a1c).” The new per-site background/accent/heading-font decision above replaces it. The article measurements above remain the detail-page structure reference.
