"""Static rendering regressions: python3 tests/site_test.py (stdlib only)."""
import datetime as dt
import re
import runpy
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class Markup(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.text = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def handle_data(self, text):
        self.text.append(text)


class SiteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        output = tempfile.TemporaryDirectory(prefix='.site-test-', dir=ROOT)
        cls.addClassCleanup(output.cleanup)
        with patch.object(sys, 'argv', ['build.py', '--out', output.name, '--today', '2026-10-26']):
            cls.site = runpy.run_path(str(ROOT / 'build.py'))
        cls.home = (Path(output.name) / 'index.html').read_text()
        cls.newsletter = (Path(output.name) / 'newsletter/index.html').read_text()

    def test_stale_boundary_in_both_date_formats(self):
        for compact in (False, True):
            for days in (89, 90, 91):
                date = dt.date(2026, 10, 26) - dt.timedelta(days=days)
                html = self.site['checked']({'last_checked': date.isoformat()}, compact=compact)
                self.assertEqual('Stale: re-check' in html, days > 90)
                self.assertIn(f'datetime="{date}"', html)
                self.assertEqual('Last checked' in html, not compact)

    def test_pay_row_exposes_amount_and_date_outside_its_only_link(self):
        outlet = dict(self.site['paytop'][0], last_checked='2026-01-01')
        html = self.site['pay_row'](outlet)
        parsed = Markup(html)
        self.assertEqual(sum(tag == 'a' for tag, _ in parsed.tags), 1)
        self.assertEqual(sum(tag == 'td' for tag, _ in parsed.tags), 3)
        self.assertNotIn('aria-hidden', html)
        self.assertIn(f'${int(outlet["pay_usd_max"]):,}', ''.join(parsed.text))
        self.assertIn('Stale: re-check', html)
        link = re.search(r'<a .*?</a>', html).group()
        self.assertNotIn('<time', link)
        self.assertNotIn('$', link)

    def test_pay_order_and_home_uses_source_amounts(self):
        outlets = self.site['outlets']
        expected = sorted((r for r in outlets if r.get('pay_usd_max') is not None),
                          key=lambda r: (-r['pay_usd_max'], r['name'].lower()))[:4]
        self.assertEqual(self.site['paytop'], expected)
        for outlet in expected:
            self.assertIn(self.site['pay_row'](outlet), self.home)

    def test_board_dates_countdowns_and_destinations_are_in_one_link(self):
        for call in self.site['due']:
            html = self.site['departure_row'](call)
            parsed = Markup(html)
            links = [attrs for tag, attrs in parsed.tags if tag == 'a']
            self.assertEqual(len(links), 1)
            countdown = next(attrs for tag, attrs in parsed.tags if attrs.get('class') == 'left')
            self.assertEqual(countdown['data-deadline'], call['deadline'])
            self.assertEqual(countdown['data-opens'], call.get('opens') or '')
            self.assertEqual(links[0]['href'], '/calls/#' + call['id'])
            self.assertNotIn('aria-hidden', html)
            self.assertNotIn('tabindex', html)
            text = ' '.join(''.join(parsed.text).split())
            date = dt.date.fromisoformat(call['deadline'])
            self.assertIn(date.strftime('%d %b'), text)
            self.assertIn(self.site['daysleft'](call), text)
            self.assertIn(call['outlet'], text)
            self.assertIn(f'datetime="{date}"', html)

    def test_board_retains_list_semantics(self):
        self.assertIn('<ol role="list">', self.site['dueboard'])

    def test_board_countdown_handles_today_and_singular(self):
        call = dict(self.site['due'][0], opens=None, deadline='2026-10-26')
        self.assertIn('Closes today', self.site['departure_row'](call))
        call['deadline'] = '2026-10-27'
        self.assertIn('<b>1</b> day left', self.site['departure_row'](call))

    def test_newsletter_form_stays_on_newsletter_page(self):
        self.assertNotIn('class="pb-sub-form"', self.home)
        self.assertIn('class="mail"', self.home)
        self.assertIn('href="/newsletter/">Get weekly Open Calls</a>', self.home)
        self.assertIn(self.site['subscribe_box']('Subscribe', True, keep_loader=True), self.newsletter)
        self.assertIn(self.site['FORM_SCRIPT'], self.newsletter)

    def test_open_now_has_separate_readable_checked_cells(self):
        table = self.site['ratetbl']
        self.assertIn('<th scope="col" role="columnheader">Checked</th>', table)
        for outlet in self.site['openr'][:8]:
            html = self.site['rate_row'](dict(outlet, last_checked='2026-01-01'))
            parsed = Markup(html)
            self.assertEqual(sum(tag == 'a' for tag, _ in parsed.tags), 1)
            self.assertEqual(sum(tag == 'td' for tag, _ in parsed.tags), 4)
            self.assertIn('Stale: re-check', html)
            self.assertNotIn('<time', re.search(r'<a .*?</a>', html).group())
            self.assertNotIn('aria-hidden', html)


if __name__ == '__main__':
    unittest.main()
