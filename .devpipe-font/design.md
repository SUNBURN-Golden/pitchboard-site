# Excalifont typography design

Stage: design — plan only. Prepared 2026-11-05 for `feat/excalifont-headings`.

## Scope and repository findings

Switch headings and prominent pay amounts to self-hosted Excalifont, paired with Gaegu Regular for supported Hangul. Keep the existing system-font body typography, site content, colors, layout, and squircle treatment. Add no AI wording or other new visible copy.

There were no earlier `.devpipe-font/*.md` files when this stage began; the directory contained runner/log files only. No applicable `AGENTS.md` was found in the repository or its ancestor directories. The working branch is `feat/excalifont-headings`, tracking `origin/main`; no tracked changes were present at inspection.

`build.py` generates the pages and `static/style.css` owns typography. Body text currently uses `system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif`. The static copy loop at the end of `build.py` handles files only, so adding `static/fonts/` requires recursive copying. Generated `dist/` is ignored and must remain uncommitted.

Only this design document is produced in this stage. Implementation and a local git commit belong to build/fix stages. Never push main, never deploy, and do not send a deployment notification.

## Font choice and verified official sources

**Excalifont Regular, 400:** use the official Excalidraw project assets. The requested `https://github.com/excalidraw/excalifont` returned 404 during research; the verified source is [excalidraw/excalidraw, packages/excalidraw/fonts/Excalifont](https://github.com/excalidraw/excalidraw/tree/7ded689cad49331167e29fd88b38f38d3736d576/packages/excalidraw/fonts/Excalifont). This is an official-source path correction, not a font substitution. The [official Excalifont page](https://plus.excalidraw.com/excalifont) also identifies the font and OFL-1.1 license.

Vendor all seven upstream WOFF2 shards unchanged, preserving their hashed filenames and exact per-file Unicode ranges from the pinned [index.ts manifest](https://github.com/excalidraw/excalidraw/blob/7ded689cad49331167e29fd88b38f38d3736d576/packages/excalidraw/fonts/Excalifont/index.ts). These are already subsets; additional processing is unnecessary. This retains Latin extensions, combining marks, Greek, Cyrillic, digits, punctuation, and symbols supplied upstream. The common Latin shard ending `a88b72a24fb54c9f94e3b5fdaa7481c9.woff2` was inspected in memory: 24,956 bytes and 212 mapped codepoints. Other shards should load only when their characters appear.

The directory has no standalone `OFL.txt`, and the inspected Latin shard lacks name-table license records 13/14. Its `index.ts` header contains the full license and attribution. Create a standalone `OFL.txt` from that upstream header, retaining the copyright notice, complete OFL text, and relevant attribution without TypeScript wrapper syntax. Do not substitute Excalidraw's application MIT license or rely solely on embedded metadata.

**Gaegu Regular, 400:** choose Gaegu for its informal, open handwritten forms. Obtain `Gaegu-Regular.ttf` and the unmodified `OFL.txt` from [google/fonts/ofl/gaegu](https://github.com/google/fonts/tree/bbda7253fc363238b05d97515ca71f8ae49c4fa9/ofl/gaegu). The [upstream metadata](https://github.com/google/fonts/blob/bbda7253fc363238b05d97515ca71f8ae49c4fa9/ofl/gaegu/METADATA.pb) identifies the regular face and OFL license. Use one weight to match Excalifont's regular face.

Coverage limitation verified from the source TTF: Gaegu has 2,350 modern Hangul syllables, not all 11,172. The sample `한글 피치보드 원고료 모집 안내` is covered, but decomposed Jamo `한` is not. Preserve all available Hangul glyphs and allow the system stack to render unsupported syllables/Jamo; do not claim complete Korean coverage or alter content to conceal missing glyphs.

## Typography specification

Define a shared display stack: `"Excalifont", "Gaegu", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Keep the current body declaration unchanged. Use family/weight longhands for the new rules so existing sizes and line heights are retained.

| Target | Treatment |
| --- | --- |
| `h1, h2, h3, h4, h5, h6` | Display stack, normal style, weight 400; heading links inherit it. |
| `.brand` | Display stack, weight 400; keep current size and navigation geometry. |
| `.pay-amt` | Display stack, weight 400; retain 1.75rem desktop / 1.5rem mobile sizing initially. |
| `.rt-rate b` | Display stack, weight 400; retain existing 1.2rem sizing initially. |
| `.kicker` within a heading | Explicitly retain system typography and existing small uppercase treatment; avoid inheriting the new display face. |
| Paragraphs, lead text, labels, badges, buttons, forms, navigation, directory cells, dates, counts in prose, `.rt-text`, and outlet names in rate/pay cards | Keep existing fonts and weights. These are not display headings or large number targets. |

Reset negative letter spacing to normal on display targets. Update existing article-heading weight declarations (`main.article>h1` and `main.article>h2`) so their higher specificity does not retain 700. Apply the same care to `.brand`, `.pay-amt`, and default heading boldness. Declare only the actual 400 weight in font faces and prevent synthetic bold/italic on display targets. Existing badges inside outlet `h1` retain their explicit system-font shorthand.

Preserve the initial hierarchy: hero 2.4rem desktop / 1.8rem mobile, general h1 2rem, general h2 1.4rem, article h1 40px/54px desktop and 32px/44px mobile, article h2 26px/32px desktop and 22px/28px mobile. Adjust line height or spacing only if browser checks reveal clipping, awkward wrapping, or collisions. Preserve semantic heading levels. No fixed heights, manual line breaks, or invented font metrics.

Keep `--corner-card:squircle`, the complete existing `@supports (corner-shape:squircle)` block, its selectors, and border-radius fallbacks unchanged.

## Assets, subsetting, and loading

Planned asset structure:

```text
static/fonts/excalifont/Excalifont-Regular-<upstream-hash>.woff2 (seven files)
static/fonts/excalifont/OFL.txt
static/fonts/gaegu/Gaegu-Regular-hangul.woff2
static/fonts/gaegu/OFL.txt
docs/fonts.md
```

In `static/style.css`, add seven Excalifont `@font-face` declarations with their exact upstream ranges and one Gaegu declaration. Every face uses `font-style:normal`, `font-weight:400`, `font-display:swap`, and a same-origin `/static/fonts/...` URL with `format("woff2")`. Do not use `local()`, external font CSS, or third-party runtime font requests. Start without font preloads: the stylesheet already discovers these faces, and Korean assets should remain demand-loaded.

Prepare Gaegu with `pyftsubset` and Brotli in a development-only environment. Keep the ordinary Python site build dependency-free and offline. Use the intersection of its cmap with these Hangul blocks: `U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,U+D7B0-D7FF,U+FFA0-FFDC`. Preserve relevant shaping/layout tables and metadata. Do not subset to today's headings: future Korean names need the source font's available coverage. Remove Gaegu's Latin/digits from the served subset so Excalifont owns those characters.

Derive Gaegu's CSS `unicode-range` from the actual output cmap, compressed into ranges. The broad requested blocks are an input selection, not a claim that every codepoint exists. Verify the output cmap retains every selected source codepoint. Record unsupported coverage explicitly. FontTools ignores missing requested Unicode characters by default, so successful command exit alone is not sufficient validation. See the [official subsetting documentation](https://fonttools.readthedocs.io/en/latest/subset/index.html) for `--unicodes`, `--flavor=woff2`, and metadata options.

`docs/fonts.md` should record pinned source revisions/URLs, source and output SHA-256 hashes, license origin, filenames, coverage, byte sizes, fontTools/Brotli versions, and the exact regeneration command. Preserve copyright/license name records during conversion where present. Copy Gaegu's upstream license intact and check any reserved-name conditions before naming a modified output. Commit the served WOFF2 files and licenses; source downloads and tooling environments need not enter the repository.

## Build-stage sequence

1. Confirm the feature branch and preserve unrelated local changes. Download only the pinned official font assets and license sources above; verify file formats and hashes.
2. Generate the Gaegu WOFF2 subset and standalone license files; document provenance and reproducible commands.
3. Update the static asset copy step to copy nested directories, using the existing standard-library `shutil` facilities. Ensure repeated builds and `--out` continue to work.
4. Add font faces and narrowly scoped display typography rules; resolve existing weight specificity and `.kicker` inheritance. Preserve the squircle block exactly.
5. Build and validate locally, then commit the scoped implementation on `feat/excalifont-headings`. Do not commit generated output, runner logs, or temporary tools. No push or deployment is needed.

## Acceptance checks for build/review

- Run `python3 build.py` and a build with a separate `--out` directory; run again to verify directory copying is repeatable. Confirm every referenced font and both licenses reach the output and return HTTP 200 from a local static server. Verify served font responses contain WOFF2 bytes rather than HTML.
- Inspect actual rendered fonts, not just computed `font-family`, for Latin headings and `$1,000`, for supported Hangul, and for mixed `Pitchboard 피치보드 2026 · $1,000`. Confirm Excalifont supplies Latin/digits and Gaegu supplies supported Korean. Test rare Hangul and decomposed Jamo to confirm readable system fallback. Use temporary browser fixtures without adding Korean sample copy to the site.
- Compare body, lead, navigation, badge, kicker, form, and table typography before/after. Check a badge nested in an outlet heading and long call/outlet titles explicitly.
- Inspect home, directory, one long-name outlet article, calls, newsletter, and signup at 320px, 375px, 768px, and 1280px; cover light/dark modes and 200% zoom. Check hero wrapping, sidebar signup headings, two-column mobile pay cards, and `.rt-rate` clipping under its existing overflow/nowrap constraints.
- On a cold load, verify only necessary Excalifont shards load and Gaegu is not requested on English-only pages. In a mixed-language fixture, verify the Korean asset loads. Throttle/block font requests and confirm text remains visible and usable during swap or failure. Record actual asset sizes and any visible layout shift; do not promise unmeasured performance.
- Compare the squircle variable and `@supports` block with the base branch and verify both supported and border-radius fallback rendering. Confirm no content/data wording changes or new AI wording.
- Review `git diff origin/main` plus new tracked assets for scope, missing licenses, broken asset paths, fallback gaps, unwanted body-font inheritance, and synthetic weight regressions. List unresolved must-fix issues in the review-stage artifact. This design stage has not run build or visual acceptance checks.
