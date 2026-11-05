"""Check font delivery through custom-output and repeat builds (stdlib only).

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class FontAssetsTest(unittest.TestCase):
    def test_font_assets_survive_custom_output_and_repeat_builds(self):
        css = (ROOT / 'static/style.css').read_text(encoding='utf-8')
        references = re.findall(r'url\([\"\'](/static/fonts/[^\"\']+)[\"\']\)', css)
        self.assertEqual(len(references), 8, 'Expected seven Excalifont shards and Gaegu')
        self.assertEqual(len(set(references)), 8)
        licenses = ['static/fonts/excalifont/OFL.txt', 'static/fonts/gaegu/OFL.txt']
        with tempfile.TemporaryDirectory(prefix='pitchboard-fonts-') as directory:
            output = Path(directory) / 'site'
            for build in range(2):
                with self.subTest(build=build + 1):
                    subprocess.run(
                        [sys.executable, str(ROOT / 'build.py'), '--out', str(output)],
                        check=True, capture_output=True, text=True,
                    )
                    self.assertEqual((output / 'static/style.css').read_text(encoding='utf-8'), css)
                    for reference in references:
                        path = reference.lstrip('/')
                        content = (output / path).read_bytes()
                        self.assertEqual(content[:4], b'wOF2', path)
                        self.assertEqual(content, (ROOT / path).read_bytes(), path)
                    for path in licenses:
                        content = (output / path).read_bytes()
                        self.assertIn(b'SIL OPEN FONT LICENSE Version 1.1', content)
                        self.assertEqual(content, (ROOT / path).read_bytes(), path)


if __name__ == '__main__':
    unittest.main()
