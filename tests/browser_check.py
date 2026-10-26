"""Optional browser checks: python3 tests/browser_check.py [--all-pages].

Requires Playwright in the developer environment, never in the static build.
Serves files through Playwright routing: no server or external network needed.
"""
import datetime as dt
import mimetypes
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


def local_route(route):
    url = urlparse(route.request.url)
    if url.netloc != 'pitchboard.test':
        return route.fulfill(status=200, body='')  # Isolate third-party embeds.
    file = (DIST / unquote(url.path).lstrip('/')).resolve()
    if not file.is_relative_to(DIST):
        return route.fulfill(status=403, body='Forbidden')
    if file.is_dir():
        file /= 'index.html'
    if file.is_file():
        return route.fulfill(path=str(file), content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
    return route.fulfill(status=404, body='Not found')


def check_width(page, path, width):
    page.goto('http://pitchboard.test' + path, wait_until='domcontentloaded')
    page.evaluate('document.fonts.ready')
    actual = page.evaluate('document.documentElement.scrollWidth')
    assert actual <= width, (path, width, actual)


def check_targets(page, selector):
    small = page.locator(selector).evaluate_all('''elements => elements
        .filter(e => {const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && (r.width<44 || r.height<44)})
        .map(e => [e.tagName, e.textContent, e.getBoundingClientRect().width, e.getBoundingClientRect().height])''')
    assert not small, small


def check_countdowns(browser):
    # Visit build-day HTML around Seoul midnight, from a different browser timezone.
    html = (DIST / 'index.html').read_text()
    deadline = dt.date.fromisoformat(re.search(r'class="left" data-deadline="([^"]+)"', html)[1])
    start = dt.datetime.combine(deadline, dt.time(), tzinfo=dt.timezone.utc) - dt.timedelta(hours=9)
    cases = ((start - dt.timedelta(days=2), '2 days left'),
             (start - dt.timedelta(seconds=1), '1 day left'),
             (start, 'Closes today'),
             (start + dt.timedelta(days=1, seconds=-1), 'Closes today'),
             (start + dt.timedelta(days=1), 'Closed'))
    for now, expected in cases:
        context = browser.new_context(timezone_id='America/Los_Angeles')
        probe = context.new_page()
        probe.route('**/*', local_route)
        probe.clock.set_fixed_time(now)
        probe.goto('http://pitchboard.test/')
        left = probe.locator('.dep .left').first
        assert left.inner_text() == expected, (now, left.inner_text())
        if expected[0].isdigit():
            assert left.locator('b').inner_text() == expected.split()[0]
        assert probe.locator('.dep time').first.get_attribute('datetime') == deadline.isoformat()
        # A synthetic future opening exercises the same hook without editing source data.
        opens = (deadline + dt.timedelta(days=3)).isoformat()
        left.evaluate('(el, opens) => el.dataset.opens = opens', opens)
        probe.add_script_tag(path=str(ROOT / 'static/app.js'))
        assert left.inner_text().startswith('Opens in ')
        context.close()
    print('Live board countdowns: plural, singular, Seoul midnight, closed, and future opening passed')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(reduced_motion='reduce')
        page.set_default_navigation_timeout(60000)
        page.route('**/*', local_route)
        errors = []
        console_errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def check_console(message):
            # /account/ probes the worker API, which is absent in this static
            # fixture. The unchanged worker has its own tests; all other
            # console errors, including missing static assets, are failures.
            if message.type == 'error' and message.location.get('url') != 'http://pitchboard.test/api/me':
                console_errors.append(message.text)
        page.on('console', check_console)
        for theme in ('light', 'dark'):
            page.emulate_media(color_scheme=theme)
            for width in (320, 390, 768, 1024, 1440):
                height = 844 if width <= 390 else 900
                page.set_viewport_size({'width': width, 'height': height})
                for path in ('/', '/outlets/', '/calls/', '/newsletter/', '/advertise/'):
                    check_width(page, path, width)
                    if path == '/outlets/':
                        current = page.locator('.bar nav a[aria-current]').first
                        expected = 'rgb(122, 82, 0)' if theme == 'light' else 'rgb(255, 194, 26)'
                        assert current.evaluate('e => getComputedStyle(e).borderBottomColor') == expected
                check_width(page, '/', width)
                for link in page.locator('.board a').all():
                    link.focus()
                    assert link.evaluate('e => getComputedStyle(e).outlineColor') == 'rgb(255, 194, 26)'
                for row in page.locator('.dep').all():
                    assert row.bounding_box()['height'] >= 64
                assert page.locator('.flap span').first.evaluate('e => getComputedStyle(e).animationName') == 'none'
                gap = page.evaluate('''() => {
                    const box = selector => document.querySelector(selector).getBoundingClientRect();
                    return [box('.hero').top - box('.top').bottom,
                            box('.boards').top - box('.hero').bottom,
                            box('.next').top - box('.boards').bottom];
                }''')
                assert gap == ([28, 48, 72] if width <= 860 else [72, 128, 168]), gap
                check_targets(page, 'main a, main input, main button, header a, header summary')
                assert page.locator('.pay th').last.evaluate('e => e.getBoundingClientRect().height') < 44
                pay_link = page.locator('.pay a.cell').first
                pay_link.focus()
                assert pay_link.evaluate('e => getComputedStyle(e).outlineStyle') == 'none'
                assert pay_link.evaluate('e => getComputedStyle(e, "::after").outlineStyle') == 'solid'
                rate_link = page.locator('.rate-tbl a.cell').first
                rate_link.focus()
                assert rate_link.evaluate('e => getComputedStyle(e).outlineStyle') == 'none'
                assert rate_link.evaluate('e => getComputedStyle(e, "::after").outlineStyle') == 'solid'
                nav = page.locator('.bar nav > a').first
                nav.hover()
                assert nav.evaluate('e => getComputedStyle(e).borderBottomColor') == expected
                page.mouse.move(0, 0)
                if '--capture' in sys.argv and width in (320, 390, 1440):
                    name = {320: 'narrow', 390: 'mobile', 1440: 'desktop'}[width]
                    shots = ROOT / 'shots'
                    shots.mkdir(exist_ok=True)
                    page.evaluate('document.activeElement.blur()')
                    page.screenshot(path=str(shots / f'implementation-{name}-{theme}.png'), full_page=True)
                    if '--reference' in sys.argv:
                        source = Path(sys.argv[sys.argv.index('--reference') + 1]).resolve()
                        ref = browser.new_page(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce', device_scale_factor=1)
                        ref.goto(source.as_uri())
                        ref.evaluate('document.fonts.ready')
                        ref.screenshot(path=str(shots / f'reference-{name}-{theme}.png'), full_page=True)
                        ref.close()
                print(f'{theme} {width}px: no document overflow')
        if '--all-pages' in sys.argv:
            page.set_viewport_size({'width': 320, 'height': 844})
            for file in DIST.rglob('*.html'):
                path = '/' + str(file.relative_to(DIST))
                check_width(page, path, 320)
            print('All generated HTML pages: scrollWidth <= 320')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto('http://pitchboard.test/')
        page.locator('.nav-more summary').click()
        assert page.locator('.nav-more a').first.is_visible()
        page.locator('.nav-more summary').click()
        page.locator('#home-q').fill('Drift')
        page.locator('.home-search button').click()
        page.wait_for_url('**/outlets/?q=Drift')
        visible = page.locator('#dir-table tbody tr:visible')
        assert visible.count() == 1 and 'The Drift' in visible.inner_text()
        page.locator('#f-q').fill('')
        page.locator('#f-status').select_option('open')
        assert page.locator('#dir-table tbody tr:visible').count() > 0
        page.goto('http://pitchboard.test/')
        amount = page.locator('.pay tbody tr:first-child .amt')
        href = amount.locator('..').locator('a').get_attribute('href')
        amount.scroll_into_view_if_needed()
        box = amount.bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.wait_for_url('http://pitchboard.test' + href)
        page.goto('http://pitchboard.test/')
        checked = page.locator('.rate-tbl tbody tr:first-child .rt-checked')
        href = checked.locator('..').locator('a').get_attribute('href')
        checked.scroll_into_view_if_needed()
        box = checked.bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.wait_for_url('http://pitchboard.test' + href)
        page.goto('http://pitchboard.test/')
        href = page.locator('.dep').first.get_attribute('href')
        page.locator('.dep').first.click()
        page.wait_for_url('http://pitchboard.test' + href)
        assert page.locator(':target').count() == 1
        page.goto('http://pitchboard.test/')
        page.emulate_media(reduced_motion='no-preference')
        assert page.locator('.flap span').first.evaluate('e => getComputedStyle(e).animationName') == 'flip'
        page.goto('http://pitchboard.test/newsletter/')
        page.locator('.pb-sub-input').fill('invalid')
        page.locator('.pb-sub-btn').click()
        assert page.locator('.pb-sub-msg').is_visible()
        assert page.locator('.pb-sub-input').evaluate('e => e === document.activeElement')
        check_countdowns(browser)
        assert not errors, errors
        assert not console_errors, console_errors
        browser.close()
        print('Search, directory filters, More menu, and JS errors: passed')


if __name__ == '__main__':
    main()
