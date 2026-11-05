# Excalifont typography — review/fix

Stage: review_fix. Prepared 2026-11-05 on `feat/excalifont-headings` against `origin/main` at `66899dd`; implementation HEAD is `8656766`. Read `design.md`, `design_review.md`, `build.md`, and `build_review.md`.

## Verdict

**No must-fix issues found; no repository change was needed in this stage.** I independently re-verified the implementation rather than relying on the prior stages. The diff is correctly scoped, all four design-review must-fixes are implemented, provenance and licences check out, the fonts render as intended, and no layout regression attributable to the font change was found. Nothing was pushed or deployed.

No new commit was created because there was nothing to fix. The working tree remains at `8656766` plus untracked pipeline notes.

## Diff reviewed

`git diff origin/main` touches 15 files:

- `build.py`: the static copy loop becomes a recursive `shutil.copytree(..., dirs_exist_ok=True)`, so `static/fonts/` reaches default and custom outputs and repeat builds work. `build.py` declares Python 3.9+, so the 3.8+ `dirs_exist_ok` argument is safe.
- `static/style.css`: seven Excalifont `@font-face` rules, one Gaegu rule, a `--font-display` stack appended to the existing `:root`, one display-typography group rule, in-place weight/spacing resets on `main.article>h1` / `main.article>h2`, `.brand`, and `.pay-amt`, and an explicit system family on `.kicker`.
- Seven unchanged Excalifont WOFF2 shards + `OFL.txt`, the Gaegu WOFF2 subset + upstream `OFL.txt`, `docs/fonts.md`, `tests/test_fonts.py`.
- `.devpipe-font/build.md` is included in the implementation commit; harmless, and the pipeline's final note commit would include stage documents anyway.

Generated `dist/` is ignored and untracked.

## Independent verification

- **Build and tests:** `python3 build.py` succeeds. `python3 -m unittest discover -s tests -p 'test_*.py'` passes (builds twice into a separate `--out`, confirms eight CSS font URLs and both licences with matching bytes and WOFF2 signatures). `node tests/worker.test.mjs` passes. The worker falls through non-`/api/` requests to `env.ASSETS.fetch`, so self-hosted fonts are served in production; there is no CSP or MIME allowlist that would block them.
- **Excalifont provenance:** fetched the pinned `index.ts` at `7ded689…`; its SHA-256 is `57793f1c…`, matching `docs/fonts.md`. Parsed all seven `uri`/`unicodeRange` descriptors and compared them to the CSS: **all seven filenames and ranges match exactly**. Downloaded all seven shards; every SHA-256 and byte size matches the manifest and the repository copies. They are byte-identical to upstream.
- **Licences:** `static/fonts/gaegu/OFL.txt` is byte-identical to the pinned Google Fonts source (`53a9ce47…`). The Excalifont `OFL.txt` contains the complete upstream copyright/attribution block and the full OFL 1.1 body; only the trailing TypeScript name-table fields (`licenseURL`, `preferredFamily`, `preferredSubfamily`) were removed, as documented. Neither font declares a Reserved Font Name, so retaining the `Gaegu` family name on the subset is permitted.
- **Gaegu subset reproducibility:** re-ran the exact documented `pyftsubset` command against the pinned source TTF (`aa52c983…`) and reproduced the identical WOFF2 SHA-256 (`ee3585…`, 284,028 bytes). The documented validation snippet passes: output cmap equals the selected source cmap (2,495 codepoints), no ASCII remains, and all source name records are preserved (IDs 0, 1, 2, 3, 4, 5, 6, 8, 9, 13, 14). Coverage breakdown matches the docs: 2,350 Hangul syllables, 51 compatibility Jamo, 0 decomposed Jamo, 93 fullwidth forms, 0 halfwidth forms, and U+20A9.
- **Display glyph coverage on real output:** extracted all `h1`–`h6`, `.pay-amt`, and `.rt-rate` text from every generated page. Every character used today is inside the declared Excalifont/Gaegu ranges, so no fallback face leaks into a heading, pay amount, or rate number on current content.
- **Rendered fonts (headless Chromium):** at 320, 375, 768, and 1280 px, `h1`, `.pay-amt`, and `.rt-rate b` compute to the display stack at weight 400 and are rendered by Excalifont; body text remains the original system stack. A cold English home load requested only the 24,956-byte Latin shard and did not request Gaegu. An injected mixed fixture (`Pitchboard 피치보드 2026 · $1,000`) loaded Gaegu and CDP platform-font inspection reported Excalifont for 24 glyphs and Gaegu for 4, i.e. the Korean pairing works.
- **Layout regression check against baseline:** built `origin/main` at the same `--today` and compared `document.scrollWidth` / `clientWidth` and `h1` heights for home, directory, the long-name outlet page, calls, newsletter, signup, and methodology at 320/375/768/1280 px plus 640 px at 200% zoom. Scroll width and `h1` height are identical to the baseline everywhere; no horizontal overflow is introduced. The only height change is a long due-card `h3` title wrapping to one fewer line under Excalifont (29 px on the affected card), which is normal reflow, not clipping. All `.rt-rate` values fit their containers at every tested width (max measured 54 px of 112/161 px available).
- **Scope constraints:** the `--corner-card:squircle` value and the full `@supports (corner-shape:squircle)` block are byte-for-byte unchanged; the only `:root` edit appends `--font-display`. The body `font:` shorthand, navigation, forms, badges, labels, kicker weight, and table rules keep their prior typography. The `build.py` diff changes only the static copy step, so no visible copy or data changed, and no AI wording was added. `font-display: swap` is on every face; no preload, `local()`, external CSS, or third-party font request was introduced.

## Non-blocking notes

- `docs/fonts.md` and `static/fonts/excalifont/OFL.txt` include upstream font name-table metadata above the licence body. It is accurate attribution, not site copy.
- Gaegu keeps partial Korean coverage by design; unsupported syllables/Jamo fall through to installed system fonts, and browser composition of decomposed Jamo is documented.
- Two trailing spaces in the upstream OFL texts are inherited from source.
- This stage did not re-run the full 96-cell browser matrix, dark-mode visual pass, or CLS measurement; the independent checks above covered rendering, loading, fallback, glyph coverage, and layout metrics on the key routes.
