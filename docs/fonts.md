# Display fonts

Headings (`h1`–`h6`), the brand, `.pay-amt`, and `.rt-rate b` use Excalifont Regular (400), then Gaegu Regular (400) for Korean. Other text keeps the existing system font. Font faces are self-hosted, use `font-display: swap`, and have no preloads or external runtime requests. Display elements disable synthetic bold and italic. Kicker labels and badges keep system typography.

## Sources and licenses

- Excalifont: official [Excalidraw font directory](https://github.com/excalidraw/excalidraw/tree/7ded689cad49331167e29fd88b38f38d3736d576/packages/excalidraw/fonts/Excalifont), revision `7ded689cad49331167e29fd88b38f38d3736d576`. The requested separate `excalidraw/excalifont` repository returned 404; the official monorepo contains the actual assets. All seven WOFF2 shards are copied byte-for-byte, with their original filenames and exact Unicode ranges from `index.ts`. They are already subsets: 64,768 bytes total; the usual Latin shard is 24,956 bytes.
- The Excalifont directory has no standalone license and the shards omit name IDs 13/14. `static/fonts/excalifont/OFL.txt` extracts the copyright, attribution, and complete SIL OFL 1.1 from the pinned `index.ts` header. Only the TypeScript wrapper, the `copyright:` / `license:` labels, and the trailing non-license name-table fields are removed. Excalidraw's application license is not used for these assets.
- Gaegu: [Google Fonts family directory](https://github.com/google/fonts/tree/bbda7253fc363238b05d97515ca71f8ae49c4fa9/ofl/gaegu), revision `bbda7253fc363238b05d97515ca71f8ae49c4fa9`. The source is `Gaegu-Regular.ttf`; `static/fonts/gaegu/OFL.txt` is the upstream file, unchanged. The served WOFF2 is a subset/conversion, 284,028 bytes.
- Both fonts are SIL OFL 1.1. Neither copyright notice declares a Reserved Font Name, so the modified Gaegu subset retains the Gaegu family name. Attribution is retained in each accompanying license file. These files are copied into the generated site's static assets.

## Korean coverage and fallback

Gaegu's subset includes every source glyph in the selection below: 2,495 mapped codepoints, including 2,350 modern Hangul syllables, 51 compatibility Jamo, 93 fullwidth forms, and U+20A9 (₩). It excludes ASCII Latin and digits, so Excalifont supplies those. Gaegu does not map every modern syllable or decomposed Jamo. Unsupported characters, such as `힣` or an isolated `ᄒ`, fall back to the user's system fonts. A browser may compose a Jamo sequence such as `한` into a supported syllable and render it with Gaegu; Chromium did so in local validation.

The CSS deliberately uses compact block ranges rather than 1,614 per-codepoint ranges. A face's effective coverage is the intersection of its declared range and actual cmap, so unsupported characters still fall through to the system stack. The broad ranges do not claim complete coverage. English-only pages do not request Gaegu; mixed Korean headings load it on demand. No Korean sample text is added to the site.

## Reproduce the Gaegu subset

Development-only tools: Python 3.13.5, fontTools 4.65.0, Brotli 1.2.0. The normal site build remains dependency-free and offline. Run from the repository root after installing those development tools:

```sh
curl -fLsS https://raw.githubusercontent.com/google/fonts/bbda7253fc363238b05d97515ca71f8ae49c4fa9/ofl/gaegu/Gaegu-Regular.ttf -o /tmp/Gaegu-Regular.ttf
pyftsubset /tmp/Gaegu-Regular.ttf \
  --output-file=static/fonts/gaegu/Gaegu-Regular-hangul.woff2 \
  --flavor=woff2 \
  --unicodes='U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,U+D7B0-D7FF,U+FF00-FFEF,U+FFA0-FFDC,U+20A9' \
  --name-IDs='*' --name-languages='*' --name-legacy
```

Default shaping/layout retention is used. The explicit name flags preserve **all** source name records, including copyright and license IDs 0, 1, 2, 4, 5, 13, 14 (output IDs: 0–6, 8, 9, 13, 14). Validate source/output cmap equality for the selected blocks, plus name record equality; do not infer coverage from a successful subsetting exit status. This check can be run after the command above:

```python
from fontTools.ttLib import TTFont
source = TTFont('/tmp/Gaegu-Regular.ttf')
subset = TTFont('static/fonts/gaegu/Gaegu-Regular-hangul.woff2')
ranges = [(0x1100, 0x11ff), (0x3130, 0x318f), (0xa960, 0xa97f),
          (0xac00, 0xd7a3), (0xd7b0, 0xd7ff), (0xff00, 0xffef),
          (0xffa0, 0xffdc), (0x20a9, 0x20a9)]
expected = {cp for cp in source.getBestCmap()
            if any(start <= cp <= end for start, end in ranges)}
assert set(subset.getBestCmap()) == expected
assert len(expected) == 2495
assert not (set(range(0x20, 0x7f)) & expected)
def names(font):
    return {(n.nameID, n.platformID, n.platEncID, n.langID, n.toUnicode())
            for n in font['name'].names}
assert names(source) == names(subset)
assert {0, 1, 2, 4, 5, 13, 14} <= {n.nameID for n in subset['name'].names}
```

The Excalifont raw download prefix is `https://raw.githubusercontent.com/excalidraw/excalidraw/7ded689cad49331167e29fd88b38f38d3736d576/packages/excalidraw/fonts/Excalifont/`; append each original filename below. Fetch `index.ts` from the same prefix to regenerate the seven descriptors and license extraction. The source TTF and tooling are not shipped.

## Integrity manifest

SHA-256 values below cover every shipped font and license, plus the two downloaded inputs used in preparation.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `static/fonts/excalifont/Excalifont-Regular-349fac6ca4700ffec595a7150a0d1e1d.woff2` | 2,656 | `a0637cff365c7344d2f7a15905a1f74dceaf56b5ac2ff913d150358bed6921f0` |
| `static/fonts/excalifont/Excalifont-Regular-3f2c5db56cc93c5a6873b1361d730c16.woff2` | 2,104 | `18ea9be1dd6b5a67b057f44eba8e34cb290f88308c272bcf35c79c1a220d0d7b` |
| `static/fonts/excalifont/Excalifont-Regular-41b173a47b57366892116a575a43e2b6.woff2` | 8,712 | `c96649a5f96e2faa9143ee94e5b590b5afb08092f8d67c67f09cef332d66e4a7` |
| `static/fonts/excalifont/Excalifont-Regular-623ccf21b21ef6b3a0d87738f77eb071.woff2` | 824 | `b004007be100261e58188cf8a0f7e850e997702f35d57110915995cd880e49f1` |
| `static/fonts/excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2` | 24,956 | `e4423b318e11432aff2e6e865e300b7ca270f92321a3f56632268fede01c1b48` |
| `static/fonts/excalifont/Excalifont-Regular-b9dcf9d2e50a1eaf42fc664b50a3fd0d.woff2` | 13,296 | `b424d16da4398be3e9852857a54ff70e043c8e2ec5c4444dbf7f88d7469b9859` |
| `static/fonts/excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2` | 12,220 | `4fb8ad69be9aeac5664d99e5aa3a68a27ea40c98943b80387f7cd55c034fcc93` |
| `static/fonts/excalifont/OFL.txt` | 4,872 | `af7d4198233dcd76af680c74c1c0a279a5fce62058ac5b9cc2cbf7fe58a0d05a` |
| `static/fonts/gaegu/Gaegu-Regular-hangul.woff2` | 284,028 | `ee3585ef0e84d2363d321c7b2bd1ff068be86836443372bd06f7c5d979c59155` |
| `static/fonts/gaegu/OFL.txt` | 4,344 | `53a9ce47085d9fef613c7ecb3730dc80d25962510bbea231b89564f58240f251` |
| `Gaegu-Regular.ttf` | 3,165,816 | `aa52c98336f7c62e2896fc8b12b56a75d5b476d88a2f104b0980f4f7ce0adfc3` |
| `excalifont-index.ts` | 6,903 | `57793f1c8aa1116de20fb0add878c6c143a29d505913699114008e8907372e8a` |

## Build delivery check

`python3 build.py` recursively copies static assets. Run `python3 -m unittest discover -s tests -p 'test_*.py'` to build twice into a separate temporary `--out` directory and verify all eight CSS font URLs and both licenses survive with identical bytes and valid WOFF2 signatures. This test uses only the Python standard library.
