# Excalifont typography — design review

Stage: design_review. Prepared 2026-11-05 for `feat/excalifont-headings`.

## Scope and diff status

Reviewed `.devpipe-font/design.md` against the repository at `66899dd` (main / origin/main).

- `git diff origin/main` is empty and `git status` shows only the untracked `.devpipe-font/` runner directory. HEAD is exactly `origin/main`; no build stage has run, so there is no implementation diff to review yet.
- This review therefore gates the design plan before build. No repository files were changed in this stage, and nothing was pushed or deployed.

## Design assumptions checked

These are correct and can be relied on in build:

- `https://github.com/excalidraw/excalifont` returns 404. The official source is the Excalidraw monorepo path pinned in the design (`packages/excalidraw/fonts/Excalifont` at `7ded689`).
- That directory contains exactly seven `Excalifont-Regular-<hash>.woff2` files, sizes matching the design (primary Latin shard `a88b72…` is 24,956 bytes). Its cmap covers `$`, digits, comma, period, `·` (U+00B7), en/em dash, curly quotes, and ellipsis, so the display targets in the current data are covered.
- Neither the Excalifont shards nor the directory ship a standalone license file, and the shards keep only name IDs 0–6 (no IDs 13/14). A standalone `OFL.txt` is required, as planned. The upstream `index.ts` header does contain the complete OFL 1.1 text and the `Copyright (c) 2024 by Excalidraw` notice.
- Both upstream OFLs (Excalifont and Gaegu) declare no Reserved Font Name. Keeping the CSS family name `Gaegu` for the subset is therefore permitted; record that determination in `docs/fonts.md`.
- Gaegu Regular has 2,350 modern Hangul syllables, 0 decomposed Jamo, and covers the design's sample. The sample's missing-Jamo fallback claim is accurate.
- `fontTools 4.65.0`, `pyftsubset`, and Brotli are available in this environment. A Hangul subset is feasible and lands at roughly 268 KB WOFF2.

## Must-fix issues

### MF-1 — Do not emit a per-codepoint `unicode-range`; it doubles the CSS payload

Deriving Gaegu's `unicode-range` from the actual output cmap produces **1,614 contiguous ranges / 14,082 bytes** for the current 2,350 syllables (verified against a real subset). Added to `static/style.css`, that roughly doubles the stylesheet on the wire (current gzip 4.4 KB; combined with the range gzip ≈ 9.9 KB), on every page, for a font that is not used until Korean text exists.

Required change: use the compact Hangul block ranges as the Gaegu `unicode-range` instead of per-codepoint output cmap ranges. Unsupported syllables inside a declared range fall through per glyph to the next family (the same system fallback the design intends), so broad ranges do not create tofu or false coverage. Suggested declaration:

```css
unicode-range:
  U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,
  U+D7B0-D7FF,U+FF00-FFEF,U+FFA0-FFDC,U+20A9;
```

Keep the cmap validation step (assert the subset contains every source codepoint selected by these blocks), but do not serialize the cmap itself into CSS. Document the choice and the fallback behavior in `docs/fonts.md` and `design.md` if the design is amended.

### MF-2 — The planned Gaegu subset drops fullwidth forms and the won sign that Gaegu actually has

The design's input blocks end with `U+FFA0-FFDC` (halfwidth Hangul), but Gaegu contains none of that range. Gaegu does contain 93 fullwidth forms in `U+FF00-FFEF` and `U+20A9` (₩). Because Excalifont also lacks those codepoints, the planned subset would push them to the system font inside otherwise handwritten Korean headings — exactly the visible fallback gap the pairing is meant to avoid.

Required change: add `U+FF00-FFEF` and `U+20A9` to the Gaegu subset selection (keep `U+FFA0-FFDC`; it is harmless). This costs about 16 KB (`~267.6 KB` → `~283.7 KB` WOFF2 in the same test) and preserves the font's Korean-relevant coverage. Do not remove ASCII Latin/digits from Gaegu's *source*; restrict the subset to the block list so Excalifont still owns ASCII.

### MF-3 — Pin the subsetting flags that preserve license/copyright name records

The design requires preserving copyright/license name records, but default `pyftsubset` output keeps only name IDs 0–6 and **drops IDs 13/14** (verified). The exact regeneration command must therefore be pinned and checked, not left to defaults.

Required change: use `--name-IDs='*' --name-languages='*'` (and `--name-legacy` if the chosen output needs it) in the documented command, then assert the output retains name IDs 0, 1, 2, 4, 5, 13, 14 and the Gaegu copyright string. Record the command and the verified IDs in `docs/fonts.md`. The same applies to any future re-subset: a silent metadata change should fail the build note.

### MF-4 — Add an automated asset-reference check; a broken font path fails silently

The design relies on manual browser/HTTP checks for asset delivery. A mistyped hashed filename, a skipped recursive copy, or a missing license would not fail `python3 build.py`; the page would simply render in the fallback stack and the regression could ship. There is no CI in this repository.

Required change: add a small build-stage check (a `tests/` script or a build-time assertion is sufficient) that:

1. parses every `url("/static/fonts/…")` in `static/style.css` and asserts the target exists in the build output,
2. asserts both `OFL.txt` files and all referenced WOFF2 files are copied under the `--out` directory, and
3. runs once with a separate `--out` and a second time to confirm repeat builds and nested-directory copying.

This directly guards the two plan steps most likely to break (`build.py`'s current `shutil.copy` loop fails on a directory, and hashed filenames are easy to transcribe incorrectly).

## Non-blocking notes for build

- Keep the existing squircle variable and `@supports (corner-shape:squircle)` block byte-for-byte; the new font rules can be inserted before it without touching it.
- The specificity trap is real: a generic `h1,h2,…{font-weight:400}` appended at the end will **not** beat `main.article>h1` / `main.article>h2` (specificity 0,1,2). Edit those declarations in place (or add equal-specificity overrides), and give `.brand`, `.pay-amt`, and `.rt-rate b` family/weight declarations at equal-or-later positions. Add `font-synthesis:none` to display targets as cheap protection against faux bold.
- `.kicker` has no `font-family` today and will inherit Excalifont from its parent `h2`; the planned explicit system-font declaration is necessary. `.badge` and `.label` already use the `font:` shorthand with `system-ui`, so nested badges are safe.
- U+2192 (`→`) is not in Excalifont or Gaegu. It currently appears only in body-font contexts (`.rt-arrow`, next-outlet links), so no action is needed; do not introduce it into an Excalifont heading.
- No Hangul exists in `data/outlets.json` or `data/calls.json` today, so Gaegu will not load in production pages until Korean content is added. Verify the pairing with the design's temporary fixture, not by claiming a production request occurred.
- The no-preload decision is acceptable with `font-display:swap`; measure swap/CLS on the hero before considering a preload of only the primary Latin shard.
- The source correction (using the official Excalidraw monorepo instead of the requested nonexistent `excalidraw/excalifont` repo) is valid and should be stated in `docs/fonts.md` so provenance is auditable.
