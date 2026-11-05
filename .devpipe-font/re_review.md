# Excalifont typography — re-review

Stage: re_review. Prepared 2026-11-05 on `feat/excalifont-headings`. Reviewed `git diff origin/main` at implementation HEAD `8656766`, with `origin/main` at `66899dd`. Read all earlier stage reports: `design.md`, `design_review.md`, `build.md`, `build_review.md`, and `review_fix.md`.

## Verdict

**PASS — no must-fix issues found.** There are no implementation changes since the previous reviews, and the diff remains scoped to the requested display-font change. All four design-review requirements are addressed. No implementation edits or commit were needed during this review stage. Nothing was pushed or deployed.

## Must-fix issues

None.

## Diff review

- Seven self-hosted Excalifont WOFF2 shards and a standalone OFL license are included. The documented official source is the pinned Excalidraw monorepo font directory; the separate requested `excalidraw/excalifont` repository was unavailable, as established in earlier stages.
- Gaegu Regular is self-hosted as a Korean-oriented WOFF2 subset with its OFL file. Its compact CSS Unicode ranges exclude ASCII; Excalifont precedes Gaegu in the display stack. The documented `pyftsubset` command preserves copyright/license metadata.
- All eight faces use `font-display:swap`. Headings, brand, prominent pay amounts, and rate numerals use the display stack at weight 400 without synthetic bold/italic. Higher-specificity article rules are updated, and kicker labels retain system typography.
- Body typography is unchanged. Existing badge, navigation, form, table, and rate-description font rules remain intact. The `--corner-card:squircle` value and complete corner-shape `@supports` rule are unchanged.
- `build.py` changes only static-asset copying to recursive `copytree(..., dirs_exist_ok=True)`. No page templates, data, or visible wording changed; no AI wording was added to the site.
- The 15-file diff also includes font provenance documentation, an asset-delivery regression test, and the build-stage report. Generated output is not committed.

## Independent checks in this stage

Passed:

```text
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/worker.test.mjs
git diff --check origin/main -- . ':!static/fonts/**/OFL.txt'
```

The Python test successfully builds twice into a separate temporary output directory and confirms all eight font references and both licenses are copied byte-for-byte with valid WOFF2 signatures.

Additional validation using Python and fontTools:

- All ten shipped font/license files match the byte sizes and SHA-256 values in `docs/fonts.md`.
- Gaegu has 2,495 mapped codepoints, contains the supported Korean sample and won sign, excludes ASCII, and retains required name IDs 0/1/2/4/5/13/14.
- Compared the body rule, squircle variable, and complete `@supports` rule directly with `origin/main`; all are unchanged.
- Confirmed eight `font-display:swap` declarations and the requested feature branch.

## Non-blocking limitations and verification boundary

- Gaegu covers 2,350 modern Hangul syllables, not the entire Hangul repertoire. Unsupported syllables/Jamo intentionally use system fallback; this is documented rather than represented as complete Korean coverage.
- The Korean subset is 284,028 bytes and demand-loaded. The seven already-subsetted Excalifont files total 64,768 bytes.
- Two upstream OFL trailing spaces are intentionally preserved and excluded from the scoped whitespace check.
- This stage did not repeat upstream downloads, font regeneration, browser rendering, the responsive/dark/zoom matrix, or CLS measurements. Those checks are recorded in the earlier build/review/fix reports; this verdict also relies on their evidence for the unchanged implementation. Fresh checks here cover diff scope, asset delivery, local integrity, font metadata/coverage, and preserved CSS constraints.
