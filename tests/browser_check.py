"""Optional browser checks: python3 tests/browser_check.py [--all-pages].

Requires Playwright in the developer environment, never in the static build.
Serves files through Playwright routing: no server or external network needed.
"""
import mimetypes
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(reduced_motion='reduce')
        page.set_default_navigation_timeout(60000)
        page.route('**/*', local_route)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for theme in ('light', 'dark'):
            page.emulate_media(color_scheme=theme)
            for width in (320, 390, 768, 1024, 1440):
                page.set_viewport_size({'width': width, 'height': 900})
                for path in ('/', '/outlets/', '/calls/', '/newsletter/', '/advertise/'):
                    check_width(page, path, width)
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
        assert not errors, errors
        browser.close()
        print('Search, directory filters, More menu, and JS errors: passed')


if __name__ == '__main__':
    main()
