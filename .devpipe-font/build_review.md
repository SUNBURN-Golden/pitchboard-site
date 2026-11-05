# Excalifont typography — build review

Stage: build_review. Prepared 2026-11-05 on `feat/excalifont-headings` against `origin/main` at `66899dd`. Read `design.md`, `design_review.md`, and `build.md`. This stage changed no repository files and did not push or deploy.

## Verdict

**No must-fix issues found.** The implementation matches the design and resolves all four design-review must-fixes. HEAD `8656766` is scoped to the font work and is ready for the pipeline's final commit/PR step, subject to the standing rule not to push or deploy.

## Must-fix issues

None.

## Diff reviewed

`git diff origin/main` touches 15 files: `build.py` (recursive static copy), `static/style.css` (eight `@font-face` rules, display stack, scoped weight/spacing overrides), seven Excalifont WOFF2 shards + `OFL.txt`, Gaegu subset + `OFL.txt`, `docs/fonts.md`, `tests/test_fonts.py`, and `.devpipe-font/build.md`. Generated `dist/` is ignored and uncommitted.

## Verification performed

- **Build and tests:** `python3 build.py`, `python3 -m unittest discover -s tests -p 'test_*.py'` (passes, including two builds into a separate `--out`), and `node tests/worker.test.mjs` (passes).
- **No content or wording change:** rebuilt `origin/main` and the branch with the same `--today 2026-11-05`; `diff -rq` of the outputs excluding `static/` is empty. No visible copy changed and no AI wording was added. Body, lead, nav, form, table, and badge typography rules are untouched.
- **Upstream provenance:** fetched the pinned `excalidraw/excalidraw` `index.ts` (SHA-256 matches `docs/fonts.md`) and compared all seven descriptors; every CSS `unicode-range` matches upstream exactly and all seven filenames/sizes match. Fetched the pinned Gaegu TTF and upstream OFL; both SHA-256s match the manifest, and the shipped Gaegu `OFL.txt` is byte-identical.
- **Gaegu subset reproducibility and metadata:** re-ran the exact documented `pyftsubset` command and obtained the identical WOFF2 SHA-256 (`ee3585…`). Verified output cmap equals the selected source cmap (2,495 codepoints), no ASCII remains, all source name records are preserved including IDs 0/1/2/4/5/13/14, and neither license declares a Reserved Font Name.
- **Excalifont license:** the served `OFL.txt` contains the exact upstream OFL 1.1 text plus the Excalidraw copyright and attribution.
- **Rendered fonts (headless Chromium, CDP `CSS.getPlatformFontsForNode`):** `h1`, `.pay-amt` (weight 400), and `.rt-rate b` are actually rendered by Excalifont. The English home load requested only the 24,956-byte Latin shard and did **not** request Gaegu; a temporary in-browser mixed fixture rendered Latin/digits/`·`/`$` with Excalifont and `피치보드` with Gaegu. Login: labels inside headings still compute to `system-ui` 600; `.kicker` computes to system 700.
- **Fallbacks and assets:** with all font requests aborted, the heading text remains visible in fallback type. `dist/` and the custom-output build both contain all eight fonts and both licenses with matching bytes. No external/third-party font request exists.
- **Squircle preserved:** `--corner-card:squircle` and the complete `@supports (corner-shape:squircle)` block are unchanged; the only change to the `:root` line is the appended `--font-display` variable.
- **Layout spot check:** home and the Washington Independent Review of Books outlet page at 375px have `scrollWidth == clientWidth`; no overflow from the font change was observed on those routes.

## Non-blocking notes

- The implementation commit includes `.devpipe-font/build.md`. The pipeline's final `git add -A ':!.devpipe-font/*.log'` would commit stage docs anyway; it does not affect the served site (only `static/` is copied into the build).
- Gaegu remains partial-coverage (2,350 modern syllables); unsupported syllables/Jamo fall back to system fonts, as documented. The 284 KB Korean asset is demand-loaded only when Hangul is present.
- Two trailing spaces in the upstream OFL texts are preserved from source; they are not introduced whitespace.
- The styled Excalifont OFL file also carries upstream name-table metadata above the license text; the required copyright notice and full OFL 1.1 are intact.
- Full browser-matrix, 200% zoom, dark-mode, and CLS measurements reported in `build.md` were not re-run here; independent checks above covered rendering, loading, fallback, and the key routes.
