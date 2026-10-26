# Self-hosted font subsets

Barlow Condensed SemiBold (600), IBM Plex Sans (width 100, weights 400–600), and IBM Plex Mono Medium (500). These are static assets; the site build has no font-tool dependency. Each font uses font-display: swap. The heading font is preloaded.

Sources: https://github.com/google/fonts/tree/main/ofl/barlowcondensed, https://github.com/google/fonts/tree/main/ofl/ibmplexsans, https://github.com/google/fonts/tree/main/ofl/ibmplexmono. Retrieved 2026-10-26; full upstream OFL 1.1 licences accompany the files. The supplied mockup subsets lacked ← → ≤ ≥; regenerated with fontTools from the corresponding upstream TTFs to cover all current generated page text. Subset range: U+0020–00FF, U+2010–2027, U+2190, U+2192, U+2264, U+2265 (only glyphs present upstream are retained). Total WOFF2 size is about 65 KB.

The IBM subsets have internal family/PostScript names Pitchboard Sans / Pitchboard Mono because the upstream licence reserves “Plex”. The variable font’s instance PostScript names and variation prefix use Pitchboard Sans as well. Their outlines are IBM Plex Sans / Mono. Copyright and licence metadata are retained. Barlow has no reserved name in its licence.

Upstream TTF SHA-256:

- BarlowCondensed-SemiBold.ttf: 7b619d14bc2327509a9ef32b0890f709626f7ecc9ff61191c2a4314c5499d2d9
- IBMPlexSans[wdth,wght].ttf: 3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3
- IBMPlexMono-Medium.ttf: a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755
