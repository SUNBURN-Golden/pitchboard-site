# Excalifont typography — build

Stage: build. Prepared 2026-11-05 on `feat/excalifont-headings`, based on `origin/main` at `66899dd`. Read both earlier-stage documents: `design.md` and `design_review.md`.

## Implemented

- Vendored all seven official Excalifont WOFF2 shards unchanged from Excalidraw revision `7ded689cad49331167e29fd88b38f38d3736d576`. Preserved the upstream filenames and exact Unicode ranges. The separate `excalidraw/excalifont` repository was unavailable; the official monorepo source correction from the design is retained.
- Added Excalifont's standalone OFL license extracted from its upstream manifest header, including copyright and attribution. Added Gaegu's unchanged upstream OFL from Google Fonts revision `bbda7253fc363238b05d97515ca71f8ae49c4fa9`.
- Converted Gaegu Regular to a Korean WOFF2 subset using `pyftsubset`, preserving all source name records and the source's available Korean coverage. Neither license declares a Reserved Font Name.
- Applied the display stack to headings, brand, prominent pay amounts, and rate numerals. Kept existing type sizes/line heights and reset display weights to 400, spacing to normal, and synthesis to none. Fixed the more-specific article heading weights. Kicker labels explicitly retain the original system family; badges keep their existing system shorthand.
- Changed static copying to `shutil.copytree(..., dirs_exist_ok=True)` so nested font directories reach default and custom build outputs and repeat builds succeed. The site build remains dependency-free and offline.
- Added `tests/test_fonts.py` to validate custom-output/repeat builds, eight CSS asset references, WOFF2 signatures, and both copied licenses.
- Added `docs/fonts.md` with official pinned URLs, byte sizes, SHA-256 hashes, metadata/coverage checks, and exact Gaegu regeneration flags.

## Design review requirements addressed

- **MF-1:** used compact Hangul block ranges in CSS, rather than thousands of individual cmap ranges. Unsupported glyphs still fall back through the system stack.
- **MF-2:** retained fullwidth forms and U+20A9 alongside the planned Hangul blocks; ASCII remains excluded from Gaegu.
- **MF-3:** used `--name-IDs='*' --name-languages='*' --name-legacy`. Verified equality of all source/output name records, including license IDs 13/14 and copyright ID 0.
- **MF-4:** added the automated asset delivery check and ran it successfully for two consecutive builds into a separate temporary output directory.

## Validation

Passed:

```text
python3 build.py
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/worker.test.mjs
git diff --cached --check -- . ':!static/fonts/**/OFL.txt'
```

Also built the baseline with a fixed date before changes. All 114 generated non-static files, including every HTML page, remain byte-for-byte identical. Data and visible copy are unchanged; no wording was added to the site. The original body font declaration, `--corner-card:squircle`, and the complete corner-shape `@supports` rule are preserved. The full staged whitespace check reports only two trailing spaces inherited from the upstream OFLs (Excalifont line 31, Gaegu line 21); those are intentionally retained with the source license text. The scoped whitespace check above passes.

Font validation:

- Confirmed all served font URLs and both licenses return HTTP 200 locally, and font responses start with WOFF2 bytes.
- Gaegu output cmap exactly equals the selected source cmap: 2,495 codepoints comprising 2,350 Hangul syllables, 51 compatibility Jamo, 93 fullwidth forms, and the won sign. No ASCII codepoints remain.
- A second execution of the documented subsetting flags reproduced identical WOFF2 bytes.
- Chromium's rendered-font inspection (CDP `CSS.getPlatformFontsForNode`) confirms Excalifont supplies Latin headings, `$1,000`, pay cards, and rates. Gaegu supplies supported Hangul and fullwidth/won samples. The mixed fixture uses both custom fonts.
- Rare `힣` renders with system NanumGothic; isolated Jamo `ᄒ` renders with system Gothic A1. Chromium composes `한` to a Gaegu-supported syllable, so the design's assumption that every decomposed sequence necessarily uses system fallback was corrected in documentation. No sample text enters production output.
- Cold English home load requested only Excalifont's 24,956-byte Latin shard. The Korean fixture additionally requested Gaegu (284,028 bytes). All Excalifont shards total 64,768 bytes on disk. No font preload or third-party runtime font request was introduced.
- CSS size changed from 16,598 to 19,412 bytes; Python gzip sizes were 4,396 and 5,196 bytes respectively.

Browser checks covered home, directory, the longest outlet title (`Washington Independent Review of Books`), calls, newsletter, and signup at 320, 375, 768, and 1280 pixels; light/dark modes; and normal/200% CSS zoom: 96 combinations. No rate clipping or unexpected display weight occurred. At normal zoom none of the checked pages overflow horizontally. Computed body, lead, navigation, badge, kicker, input, rate description, and outlet-name typography match the baseline. Screenshots were visually inspected for home desktop/mobile, the long outlet heading and nested badge, and mixed Korean/Latin text. Native squircle rendering and a forced round-corner fallback were checked in Chromium. A Firefox rendering of the generated home HTML/CSS (with scripts blocked locally) confirmed that an engine without corner-shape support retains the 12px border-radius fallback.

During controlled delayed/blocked font loading, headings and pay amounts remain visible. Delayed swap at 375px kept hero height at 69.09px, with measured CLS 0; at 1280px it kept height at 97.91px, with measured CLS about 0.0000201. These are local lab observations, not production performance claims. No preload was needed.

## Existing limitations and handoff

- The 200% check used CSS zoom as a reflow approximation, not browser UI zoom. At 320/375px the existing deadline-card minimum widths and next-outlet link cause horizontal overflow; newsletter also overflows slightly at 320px. Compared each affected route with the unmodified baseline: scroll widths are identical (home 492px, outlet 638px, newsletter 333px). No layout fix was added to this font-scoped change.
- Gaegu has partial Korean coverage; absent syllables/Jamo rely on installed system fonts. Broad CSS ranges do not imply complete glyph coverage.
- Browser scripts, screenshots, source downloads, and tooling remain in `/tmp/pitchboard-font-build/`, outside the repository. Runner logs, earlier-stage untracked artifacts, and generated `dist/` are excluded from the implementation commit.
- Build-stage inspection of the implementation diff found no unresolved font-related must-fix issue. A separate review stage should review `git diff origin/main` as requested by the pipeline.
- Implementation and this report are committed locally on the requested feature branch. Nothing was pushed or deployed; no deployment notification was sent.
