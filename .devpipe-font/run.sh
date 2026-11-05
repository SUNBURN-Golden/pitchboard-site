#!/usr/bin/env bash
cd /workspace/pitchboard-site
R=/workspace/pitchboard-data-main/scripts/devpipe/run_stage.sh; D=.devpipe-font
G="Repo /workspace/pitchboard-site, branch feat/excalifont-headings (never push main, never deploy). Goal: switch headings and big numbers on pitchboard.soulbound.co.kr to Excalifont (Excalidraw handwritten font, OFL; self-host woff2 in repo + OFL license file, from the official excalidraw/excalifont source). Pair a free OFL Korean handwritten font (Nanum Pen Script or Gaegu) for Hangul via font-family fallback/unicode-range. Body text keeps current font. Use font-display: swap, subset woff2 where possible (pyftsubset). Keep existing squircle corner-shape @supports CSS. No AI wording on site."
for s in design design_review build build_review review_fix re_review; do
  P="$G Stage: $s. Read $D/*.md from earlier stages. Write your output to $D/$s.md. Design stages: plan only. Build/fix stages: implement and git commit on the branch. Review stages: review git diff origin/main and list must-fix issues."
  $R $s $D/$s.log "$P" || { echo "FAIL $s"; exit 1; }
done
git add -A ':!.devpipe-font/*.log'; git commit -qm "chore: devpipe notes" || true
git push -u origin feat/excalifont-headings && gh pr create --base main --head feat/excalifont-headings --title "Excalifont headings + Korean handwritten pairing" --body "Headings and big numbers use self-hosted Excalifont (OFL) with Korean handwritten fallback; body unchanged; font-display swap; squircle CSS kept. Not deployed."
echo DONE
