"""Check the feed and the public pages produced by the static build."""
import datetime as dt
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PageHTML(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.text = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def handle_data(self, data):
        if data.strip():
            self.text.append(data.strip())

    def attributes(self, tag):
        return [attrs for name, attrs in self.tags if name == tag]


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = tempfile.TemporaryDirectory(prefix='pitchboard-build-')
        cls.addClassCleanup(directory.cleanup)
        cls.output = Path(directory.name)
        cls.outlets = json.loads((ROOT / 'data/outlets.json').read_text())
        cls.calls = json.loads((ROOT / 'data/calls.json').read_text())
        cls.dated_call = min(
            (call for call in cls.calls['calls'] if call['deadline'] and
             call['outlet'] in {outlet['name'] for outlet in cls.outlets}),
            key=lambda call: (call['deadline'], call['id']),
        )
        subprocess.run(
            [sys.executable, str(ROOT / 'build.py'), '--out', str(cls.output),
             '--today', cls.dated_call['deadline']],
            check=True, capture_output=True, text=True,
        )

    def outlet_path(self, outlet_name):
        slug = re.sub(r'[^a-z0-9]+', '-', outlet_name.lower()).strip('-')
        return f'outlets/{slug}/index.html'

    def read(self, path):
        return (self.output / path).read_text(encoding='utf-8')

    def test_alert_feed_keeps_source_ids_and_uses_normalized_filters(self):
        feed = json.loads(self.read('alerts-feed.json'))
        self.assertEqual([c['id'] for c in feed['calls']], [c['id'] for c in self.calls['calls']])
        self.assertTrue({c['type'] for c in self.calls['calls']}.issubset(feed['kinds']))
        self.assertEqual(set(feed['outlets']), {str(o['id']) for o in self.outlets})
        catalog = {outlet['name']: outlet for outlet in self.outlets}
        for call, source in zip(feed['calls'], self.calls['calls']):
            with self.subTest(call=call['id']):
                outlet = catalog.get(source['outlet'])
                self.assertEqual(call['url'], source['link'])
                self.assertEqual(call['kind'], source['type'])
                self.assertEqual(call['worldwide'], 'worldwide' in call['regions'])
                self.assertTrue(call['genres'])
                self.assertLessEqual(set(call['genres']), set(feed['genres']))
                self.assertLessEqual(set(call['regions']), set(feed['regions']))
                self.assertEqual(call['outlet_id'], outlet['id'] if outlet else None)
                self.assertEqual(call['outlet_url'],
                                 '/' + self.outlet_path(outlet['name']).removesuffix('index.html') if outlet
                                 else '/calls/#' + call['id'])
                self.assertTrue((self.output / (call['outlet_url'].split('#')[0].lstrip('/') + 'index.html')).exists())
                for field in ('deadline', 'opens'):
                    if call[field]:
                        self.assertEqual(dt.date.fromisoformat(call[field]).isoformat(), source[field])
                if outlet and 'global' in outlet['region'].lower():
                    self.assertTrue(call['worldwide'])
                if (source['pay'] or '').lower() not in ('unpaid', 'no pay'):
                    self.assertEqual(call['pay_usd'], outlet.get('pay_usd_max') if outlet else None)

    def test_newsletter_has_weekly_archive_and_keeps_beehiiv(self):
        text = self.read('newsletter/index.html')
        self.assertIn('Issues go out weekly.', text)
        self.assertIn('href="https://pitchboard.beehiiv.com"', text)
        self.assertNotIn('The first issues have not been sent yet', text)
        self.assertIn(
            '<script async src="https://subscribe-forms.beehiiv.com/v3/loader.js" '
            'data-beehiiv-form="6644fe0d-dba8-4266-a8c5-25a8155c3783"></script>',
            text,
        )
        self.assertIn('data-beehiiv-form-id="6644fe0d-dba8-4266-a8c5-25a8155c3783"', text)

    def test_deadlines_have_dates_and_server_fallbacks(self):
        deadline = self.dated_call['deadline']
        for path in ('index.html', 'calls/index.html', self.outlet_path(self.dated_call['outlet'])):
            with self.subTest(path=path):
                page = PageHTML(self.read(path))
                deadlines = [attrs['datetime'] for attrs in page.attributes('time') if 'data-deadline' in attrs]
                self.assertIn(deadline, deadlines)
                self.assertTrue(any('data-call-status' in attrs for attrs in page.attributes('span')))
                self.assertIn('Closes today', page.text)
                self.assertTrue(any('data-checked-age' in attrs for attrs in page.attributes('span')))

    def test_outlet_forms_and_alerts_page_are_wired_into_the_site(self):
        outlet = self.outlets[0]
        page = PageHTML(self.read(self.outlet_path(outlet['name'])))
        form = next(attrs for attrs in page.attributes('form') if attrs.get('id') == 'pay-report')
        self.assertEqual(form['data-outlet'], str(outlet['id']))
        fields = {attrs.get('name') for tag in ('input', 'select') for attrs in page.attributes(tag)}
        self.assertTrue({'amount', 'currency', 'unit', 'piece_type', 'year', 'website'}.issubset(fields))
        self.assertTrue(fields.isdisjoint({'email', 'name', 'notes'}))
        self.assertTrue(any('hidden' in attrs for attrs in page.attributes('div')))
        self.assertLess(page.text.index('Pay (as published)'), page.text.index('Critic-reported pay (unverified)'))
        self.assertIn('id="critic-pay"', self.read('methodology/index.html'))
        self.assertIn('href="/alerts/"', self.read('index.html'))
        self.assertIn('Manage custom email alerts', self.read('account/index.html'))
        alerts = self.read('alerts/index.html')
        self.assertIn('id="alert-prefs"', alerts)
        self.assertIn('href="/signup/">Sign in to set up alerts', alerts)
        self.assertIn('Open to writers anywhere', alerts)

    def test_site_copy_omits_prohibited_wording(self):
        # Existing source notes describe outlets' submission policies verbatim.
        source_copy = {
            value.strip()
            for row in [*self.outlets, *self.calls['calls'], *self.calls['watch']]
            for value in row.values()
            if isinstance(value, str)
        }
        banned = re.compile(r'\b(?:AI|generated|assistant|LLM)\b', re.IGNORECASE)
        for path in self.output.rglob('*.html'):
            page = PageHTML(path.read_text(encoding='utf-8'))
            metadata = [attrs['content'] for attrs in page.attributes('meta')
                        if attrs.get('name') == 'description' or attrs.get('property') in ('og:title', 'og:description')]
            for text in [*page.text, *metadata]:
                if text not in source_copy:
                    self.assertIsNone(banned.search(text), f'{path.relative_to(self.output)}: {text}')


if __name__ == '__main__':
    unittest.main()
