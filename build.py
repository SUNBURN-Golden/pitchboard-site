#!/usr/bin/env python3
"""Static site generator for The Pitchboard. No dependencies (Python 3.9+).
Usage: python3 build.py [--out dist] [--today YYYY-MM-DD] [--demo-sponsor]
Reads data/outlets.json + data/calls.json (+ optional data/sponsors.json), writes static HTML to dist/.
"""
import json, re, shutil, sys, html, datetime as dt, hashlib, struct, zlib
from pathlib import Path
ROOT=Path(__file__).parent
args=sys.argv[1:]
def opt(n,default=None):
    return args[args.index(n)+1] if n in args else default
OUT=ROOT/opt('--out','dist')
TODAY=dt.date.fromisoformat(opt('--today',dt.date.today().isoformat()))
DEMO='--demo-sponsor' in args
SITE="The Pitchboard"
CONTACT="pitchboard@soulbound.co.kr"
CONTACT_LINK=f'<a href="mailto:{CONTACT}">{CONTACT}</a>'
ARCHIVE="https://pitchboard.beehiiv.com"
BASE="https://pitchboard.soulbound.co.kr"
PAGES=[]
FORM_SCRIPT='<script async src="https://subscribe-forms.beehiiv.com/v3/loader.js" data-beehiiv-form="6644fe0d-dba8-4266-a8c5-25a8155c3783"></script>'
ATTR_SCRIPT='<script type="text/javascript" async src="https://subscribe-forms.beehiiv.com/attribution.js"></script>'
def subscribe_box(h='Get the weekly Open Calls email',note=True):
    n='<p class="sm muted">Free and weekly. Unsubscribe any time. beehiiv handles email signups; see <a href="/about/#privacy">how we handle your email</a>.</p>' if note else ''
    return f'<section class="subscribe" aria-label="Subscribe"><h2>{h}</h2>{FORM_SCRIPT}{n}</section>'
STALE_DAYS=90
esc=lambda s: html.escape(str(s),quote=True) if s is not None else ''
outlets=json.load(open(ROOT/'data/outlets.json'))
cd=json.load(open(ROOT/'data/calls.json'))
sponsors=json.load(open(ROOT/'data/sponsors.json')) if (ROOT/'data/sponsors.json').exists() else {"featured":[],"digest_slot":None}
if DEMO:
    sponsors={"featured":[{"outlet":"The Yale Review","label":"DEMO - not a real sponsorship"}],"digest_slot":{"sponsor":"Example MFA Program (demo)","text":"This is a demo of how a paid sponsor slot is labeled. Not a real advertiser.","link":"#"}}
def slug(n): return re.sub(r'[^a-z0-9]+','-',n.lower()).strip('-')
for r in outlets: r['slug']=slug(r['name'])
featured={f['outlet'] for f in sponsors['featured']}
STATUS={'open':('Open','s-open','Accepting pitches or submissions at the time we checked.'),
 'pitch-first':('Pitch first','s-pitch','You must pitch before writing; finished drafts are not wanted or are secondary.'),
 'closed':('Closed','s-closed','Not accepting pitches/submissions for criticism when checked.'),
 'periodic-calls':('Calls only','s-calls','Takes work only during announced calls or windows.'),
 'no-public-guidelines':('No public guidelines','s-none','We found no public freelance pitch page; status is unknown.')}
def d_(s): return dt.date.fromisoformat(s)
def fmt(s): 
    x=d_(s); return f"{x.day} {x.strftime('%b %Y')}"
def age(r): return (TODAY-d_(r['last_checked'])).days
def badge(r):
    l,c,t=STATUS.get(r['status'],('Unknown','s-none',''))
    return f'<span class="badge {c}" title="{esc(t)}">{l}</span>'
def checked(r,long=False):
    a=age(r); stale=a>STALE_DAYS
    s=f'<span class="checked{" stale" if stale else ""}">Last checked <time datetime="{r["last_checked"]}">{fmt(r["last_checked"])}</time>'
    s+=f' <span class="ago">({a} day{"s" if a!=1 else ""} ago)</span>' if long or True else ''
    if stale: s+=' <span class="badge s-stale">Stale: re-check</span>'
    return s+'</span>'
def short(s,n=70):
    if not s: return '<span class="muted">not recorded</span>'
    return esc(s if len(s)<=n else s[:n].rsplit(' ',1)[0]+'…')
def pay_src_label(r):
    ps=r.get('pays_source')
    if r.get('pays') in (None,''): return 'Not recorded'
    if ps=='outlet': return "From the outlet's own page"
    if ps and ps.startswith('nbcc'): return f"From the NBCC sheet{(' (row last updated '+r['nbcc_last_updated']+')') if r.get('nbcc_last_updated') else ''}; may be out of date"
    if ps: return f"From: {esc(ps)}"
    return "See notes"
VER={'outlet_page_fetched':'Outlet page read directly','outlet_page_search_excerpt':"Outlet page text seen via a search excerpt (site may block non-browser reads)",'third_party_only':'Only third-party sources found; treat as unconfirmed','nbcc_only':'NBCC sheet only; not checked on the outlet page'}
PRIMARY_NAV=[('/outlets/','Directory'),('/calls/','Calls'),('/app/','App')]
MORE_NAV=[('/newsletter/','Newsletter'),('/advertise/','Advertise'),('/methodology/','Methodology'),('/about/','About')]
def page(path,title,body,desc="Where to pitch book reviews and cultural criticism: pay, word counts, pitch rules, and open/closed status with last-checked dates.",extra_head='',active=None,layout=None):
    cur=' aria-current="page"'
    main_cls='wrap '+layout if layout else 'wrap'
    current=active or path
    nav=''.join('<a href="%s"%s>%s</a>'%(h,cur if current==h else '',l) for h,l in PRIMARY_NAV)
    more=''.join('<a href="%s"%s>%s</a>'%(h,cur if current==h else '',l) for h,l in MORE_NAV)
    t=f'{title} · {SITE}' if title!=SITE else f'{SITE}: paid book review & criticism outlets, with last-checked dates'
    canon=BASE+(path if path.endswith('/') else path+'/') if path!='/404' else None
    if canon:
        PAGES.append(canon)
        extra_head=f'<link rel="canonical" href="{canon}"><meta property="og:title" content="{esc(t)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{canon}"><meta property="og:type" content="website"><meta property="og:site_name" content="{SITE}">'+extra_head
    else: extra_head='<meta name="robots" content="noindex">'+extra_head
    out=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(t)}</title><meta name="description" content="{esc(desc)}"><link rel="stylesheet" href="/static/style.css"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#8a2a1c"><link rel="icon" href="/static/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/icon-192.png">{extra_head}</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap bar"><a class="brand" href="/">The Pitchboard</a>
<nav aria-label="Main">{nav}<details class="nav-more"><summary>More</summary><div>{more}</div></details></nav></div></header>
<main id="main" class="{main_cls}">{body}</main>
<footer class="wrap foot"><p>Data last built {fmt(TODAY.isoformat())}. Facts come from each outlet's public pages and are dated; always confirm on the outlet's own page before pitching. <a href="/methodology/">How we check</a> · <a href="/advertise/">Sponsored items are always labeled</a></p>
<p class="sm">Corrections or sponsorship: {CONTACT_LINK} · <a href="{ARCHIVE}" rel="noopener">Newsletter archive</a> · <a href="/newsletter/">Subscribe</a></p></footer>
<script src="/static/app.js" defer></script>{ATTR_SCRIPT}</body></html>'''
    p=OUT/path.strip('/')/'index.html' if path!='/404' else OUT/'404.html'
    p.parent.mkdir(parents=True,exist_ok=True); p.write_text(out,encoding='utf-8')
def sponsor_slot():
    s=sponsors.get('digest_slot')
    if s: return f'<aside class="sponsor"><span class="label">Sponsored</span><p><strong>{esc(s["sponsor"])}</strong>: {esc(s["text"])}</p></aside>'
    return '<aside class="sponsor open-slot"><span class="label">Sponsored</span><p>This sponsor slot is available (writing programs, presses, tools). It always carries this label and never changes any outlet\'s data or order. <a href="/advertise/">Details</a></p></aside>'
def paymax(r):
    v=r.get('pay_usd_max')  # USD, set in data/outlets.json (see data/FX_NOTE.md); None = not stated
    return '' if v is None else str(int(v))
def row(r):
    f=r['name'] in featured
    hay=' '.join(str(r.get(k) or '') for k in ('name','pays','word_count','notes','region','status')).lower()
    star=' <span class="label sm">Featured · Sponsored</span>' if f else ''
    return (f'<tr role="row" data-status="{esc(r["status"])}" data-region="{esc(r["region"])}" data-pay="{"1" if r.get("pays") and r["pays"]!="unpublished" else "0"}" data-paymax="{paymax(r)}" data-checked="{esc(r["last_checked"])}" data-featured="{"1" if f else "0"}" data-text="{esc(hay)}">'
     f'<td role="cell" data-label="Outlet" class="n"><a href="/outlets/{r["slug"]}/">{esc(r["name"])}</a>{star}<div class="muted sm">{esc(r["region"])}</div></td>'
     f'<td role="cell" data-label="Status">{badge(r)}</td><td role="cell" data-label="Pay (as published)">{short(r.get("pays"))}</td><td role="cell" data-label="Word count">{short(r.get("word_count"),40)}</td><td role="cell" data-label="Last checked" class="chk">{checked(r)}</td></tr>')
HEAD='<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Outlet</th><th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Pay (as published)</th><th role="columnheader" scope="col">Word count</th><th role="columnheader" scope="col">Last checked</th></tr></thead>'
def table(rs,id_=''):
    rs=sorted(rs,key=lambda r:(r['name'] not in featured,r['name'].lower()))
    idattr=(' id="%s"'%id_) if id_ else ''
    return f'<div class="tablewrap"><table role="table" class="outlets"{idattr}>{HEAD}<tbody role="rowgroup">{"".join(row(r) for r in rs)}</tbody></table></div>'
cnt=lambda s:sum(1 for r in outlets if r['status']==s)
def daysleft(c):
    if not c['deadline']: return 'Rolling'
    if c['opens'] and d_(c['opens'])>TODAY:
        k=(d_(c['opens'])-TODAY).days
        return 'Opens in %d day%s'%(k,'s' if k!=1 else '')
    n=(d_(c['deadline'])-TODAY).days
    return 'Deadline passed' if n<0 else 'Closes today' if n==0 else f'{n} day{"s" if n!=1 else ""} left'
# ---------- Home ----------
openr=sorted([r for r in outlets if r['status'] in('open','pitch-first')],key=lambda r:(r['name'] not in featured,-d_(r['last_checked']).toordinal(),r['name'].lower()))
paytop=sorted((r for r in outlets if r.get('pay_usd_max') is not None),key=lambda r:(-r['pay_usd_max'],r['name'].lower()))[:4]
due=[]
for c in cd['calls']:
    try:
        ddl=d_(c['deadline']) if c.get('deadline') else None
        op=d_(c['opens']) if c.get('opens') else None
    except (TypeError,ValueError):
        continue
    if op and op>TODAY: continue
    if ddl and ddl>=TODAY: due.append(c)
due=sorted(due,key=lambda c:(c['deadline'],str(c.get('id') or '')))[:4]
def toprate(r):
    v=r.get('pay_usd_max')
    return f'<b>${int(v):,}</b>' if v is not None else f'<span class="rt-text">{short(r.get("pays"),80)}</span>'
def rate_row(r):
    return (f'<a class="rate-tr" href="{esc("/outlets/"+r["slug"]+"/")}">'
     f'<span class="rt-outlet"><b>{esc(r["name"])}</b><span class="muted sm">{short(r.get("word_count"),40)} · checked {fmt(r["last_checked"])}</span></span>'
     f'<span class="rt-rate">{toprate(r)}</span><span class="rt-status">{badge(r)}</span><span class="rt-arrow" aria-hidden="true">→</span></a>')
ratetbl=('<div class="rate-tbl"><div class="rate-tr rate-th"><span>Outlet · length · checked</span><span>Top rate</span><span>Status</span><span></span></div>'
 +''.join(rate_row(r) for r in openr[:8])+'</div>')
paycards='<div class="pay-strip">'+''.join(
 f'<a class="pay-card" href="{esc("/outlets/"+r["slug"]+"/")}"><span class="pay-amt">${int(r["pay_usd_max"]):,}</span><b>{esc(r["name"])}</b><span class="muted sm">Checked {fmt(r["last_checked"])}</span></a>'
 for r in paytop)+'</div>'
duecards=''.join(f'''<article class="call due-card"><h3>{esc(c["title"])}</h3>
<p><strong>{esc(c["outlet"])}</strong> · {esc(c["type"])} · <span class="badge s-open">{daysleft(c)}</span></p>
<p class="sm">Deadline <strong>{fmt(c["deadline"])}</strong> · Pay: {esc(c["pay"])}</p>
<p class="sm"><a href="{esc(c["link"])}" rel="noopener">Outlet page</a> · <a href="/calls/#{esc(c["id"])}">Details</a> · <span class="checked">Last checked {fmt(c["last_checked"])}</span></p></article>''' for c in due)
if not duecards: duecards='<p class="muted">No upcoming deadlines on the board right now.</p>'
home=f'''<section class="hero home-hero"><h1>Where to pitch, and what it pays.</h1>
<p class="lead muted">Pay, pitch status and deadlines for {len(outlets)} outlets that publish criticism — each entry shows when it was last checked.</p>
<form class="home-search" action="/outlets/" method="get" role="search"><label class="sr" for="home-q">Search outlets</label><input id="home-q" name="q" type="search" placeholder="Search by name, pay, or region"><button type="submit">Search</button></form>
<nav class="status-chips" aria-label="Browse the directory"><a class="status-chip" href="/outlets/?status=open">Open now</a><a class="status-chip" href="/outlets/?sort=pay">Highest pay</a></nav></section>
<section><h2>Highest pay</h2><p class="muted sm">Top of each outlet's stated pay range, in US dollars at approximate October 2026 exchange rates. <a href="/outlets/?sort=pay">Sort the whole directory by pay</a>.</p>{paycards}</section>
<section class="home-lay"><aside class="home-side"><div class="sticky">{subscribe_box('<span class="kicker">Every Thursday</span>Open Calls')}</div></aside>
<div class="home-main"><h2 id="open-now">Open or pitch-first now</h2><p class="muted">Most recently checked first. Status is what the source noted on each entry said on the check date. <a href="/methodology/">What the statuses mean</a>.</p>{ratetbl}{sponsor_slot()}<p><a href="/outlets/?status=open">See all {cnt('open')} open outlets</a> · <a href="/outlets/">Full directory ({len(outlets)})</a></p></div></section>
<section><h2>Deadlines soon</h2><div class="due-grid">{duecards}</div><p><a href="/calls/">All calls &amp; deadlines</a></p></section>'''
page('/',SITE,home)
# ---------- Directory ----------
regions=sorted({r['region'] for r in outlets})
opts=lambda vals,al:''.join(f'<option value="{esc(v)}">{esc(l)}</option>' for v,l in vals)
dirbody=f'''<h1>Directory</h1><p class="muted">{len(outlets)} outlets. Type to search names, pay and notes. Every row shows when it was last checked.</p>
<form id="directory-filters" class="filters" action="/outlets/" method="get"><label>Search <input id="f-q" name="q" type="search" placeholder="e.g. translation, $200, UK"></label>
<label>Status <select id="f-status" name="status"><option value="">Any</option><option value="open">Open</option><option value="pitch-first">Pitch first</option><option value="closed">Closed</option><option value="periodic-calls">Calls only</option><option value="no-public-guidelines">No public guidelines</option></select></label>
<label>Region <select id="f-region" name="region"><option value="">Any</option>{"".join(f'<option>{esc(g)}</option>' for g in regions)}</select></label>
<label>Sort <select id="f-sort" name="sort"><option value="">Default (A-Z)</option><option value="pay">Highest pay</option><option value="checked">Recently checked</option></select></label>
<label class="chk2"><input id="f-pay" name="pay" value="1" type="checkbox"> Pay figure recorded</label><span id="f-count" class="muted" aria-live="polite"></span></form>
<p class="muted">Pay is shown as each outlet publishes it. To sort by pay, we convert the top of each stated range to US dollars at approximate October 2026 rates. Outlets without a converted amount sort last.</p>
{table(outlets,'dir-table')}<noscript><p>Filtering needs JavaScript; the full table above works without it.</p></noscript>'''
page('/outlets/','Directory',dirbody,desc="Search and filter outlets that pay for book reviews and cultural criticism, by status, pay and word count.")
# ---------- Outlet pages ----------
nav_outlets=sorted(outlets,key=lambda r:(r['name'] not in featured,r['name'].lower()))
next_outlet={r['slug']:nav_outlets[(i+1)%len(nav_outlets)] for i,r in enumerate(nav_outlets)}
for r in outlets:
    f=r['name'] in featured
    links=[]
    if r.get('source_url') and r.get('source_url')!=r.get('pitch_guidelines_url'): links.append(f'<a href="{esc(r["source_url"])}" rel="noopener">Source for this entry</a>')
    pitch_cta=f'<a class="btn pitch-cta" href="{esc(r["pitch_guidelines_url"])}" rel="noopener">Pitch guidelines (outlet)</a>' if r.get('pitch_guidelines_url') else ''
    home_btn=f'<a class="btn alt" href="{esc(r["url"])}" rel="noopener">Outlet homepage</a>' if r.get('url') else ''
    cta_row=f'<p class="cta-row">{pitch_cta}{home_btn}</p>' if (pitch_cta or home_btn) else ''
    nxt=next_outlet[r['slug']]
    body=f'''<p class="crumb"><a href="/outlets/">← Directory</a></p>
<h1>{esc(r["name"])} {badge(r)}</h1>{'<p><span class="label">Featured · Sponsored</span> This listing is a paid placement; the data below is unaffected.</p>' if f else ''}
<p class="checkline">{checked(r,True)} · {esc(VER.get(r["verification"],r["verification"]))}</p>
{cta_row}
<dl class="facts"><dt>Status</dt><dd>{esc(STATUS.get(r["status"],("","",""))[2])}</dd>
<dt>Pay (as published)</dt><dd>{esc(r.get("pays")) if r.get("pays") else '<span class="muted">not recorded</span>'}<div class="sm muted">{pay_src_label(r)}</div></dd>
<dt>Word count</dt><dd>{esc(r.get("word_count")) if r.get("word_count") else '<span class="muted">not recorded</span>'}</dd>
<dt>Region</dt><dd>{esc(r["region"])}</dd>
{f'<dt>Links</dt><dd>{" · ".join(links)}</dd>' if links else ''}</dl>
<h2>Pitch notes</h2><p>{esc(r.get("notes") or "No notes yet.")}</p>
<p class="note">Spot something out of date? <a href="/about/#corrections">Tell us</a>. Always confirm on the outlet's own page before pitching; pages change without notice.</p>
<a class="next-outlet" href="/outlets/{nxt['slug']}/">Next outlet: {esc(nxt['name'])} →</a>'''
    page(f'/outlets/{r["slug"]}/',r['name'],body,desc=f'{r["name"]}: pitch status, pay and word count, last checked {fmt(r["last_checked"])}.',active='/outlets/',layout='article')
# ---------- Calls ----------
cl=sorted(cd['calls'],key=lambda c:(c['deadline'] is None,c['deadline'] or '9999'))
cbody='<h1>Calls &amp; deadlines</h1><p class="muted">Reading windows and calls for criticism, with deadlines. The list is short: it includes only items we have read on the outlet\'s own page. We add themed calls as we confirm them.</p>'
for c in cl:
    cbody+=f'''<article class="call" id="{esc(c["id"])}"><h3>{esc(c["title"])}</h3><p><strong>{esc(c["outlet"])}</strong> · {esc(c["type"])} · <span class="badge s-open">{daysleft(c)}</span></p>
<p>{("Opens "+fmt(c["opens"])+" · ") if c["opens"] else ""}{("Deadline <strong>"+fmt(c["deadline"])+"</strong>") if c["deadline"] else "No deadline stated"} · Pay: {esc(c["pay"])}</p><p>{esc(c["details"])}</p>
<p class="sm"><a href="{esc(c["link"])}" rel="noopener">Outlet page</a> · <span class="checked">Last checked {fmt(c["last_checked"])}</span></p></article>'''
cbody+='<h2>Recently closed or worth watching</h2><ul class="watch">'+''.join(f'<li><strong>{esc(w["outlet"])}</strong>: {esc(w["note"])} <a href="{esc(w["link"])}" rel="noopener">page</a></li>' for w in cd['watch'])+'</ul>'
page('/calls/','Calls & deadlines',cbody,desc="Calendar of themed calls for pitches in criticism and book reviews, with deadlines and sources.")
# ---------- Installable app ----------
appbody=f'''<section class="hero"><span class="kicker">Your pitching desk</span><h1>The Pitchboard app</h1>
<p class="lead">Find an outlet, keep an eye on deadlines, and save reminders on this device.</p>
<nav class="app-sections" aria-label="App sections"><a class="btn alt" href="#app-outlets">Find an outlet</a><a class="btn alt" href="#app-calls">Calls &amp; reminders</a></nav>
<p class="cta-row"><button id="install-app" hidden>Install app</button></p>
<p class="sm muted" id="install-help">To install, choose Install app or Add to Home Screen in your browser's menu. On iPhone or iPad, use Safari's Share menu.</p>
<p id="app-connection" class="sm muted" role="status"></p></section>
<section aria-labelledby="app-outlets"><h2 id="app-outlets">Find an outlet</h2>
<form id="directory-filters" class="filters" action="/app/" method="get">
<label>Search names and notes <input id="f-q" name="q" type="search" placeholder="e.g. translation, essays"></label>
<label>Status <select id="f-status" name="status"><option value="">Any</option>{''.join(f'<option value="{k}">{v[0]}</option>' for k,v in STATUS.items())}</select></label>
<label>Region <select id="f-region" name="region"><option value="">Any</option>{''.join(f'<option>{esc(g)}</option>' for g in regions)}</select></label>
<label>Minimum top rate (USD) <input id="f-min-pay" name="min_pay" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 200"></label>
<label>Sort <select id="f-sort" name="sort"><option value="">Default (A-Z)</option><option value="pay">Highest pay</option><option value="checked">Recently checked</option></select></label>
<label class="chk2"><input id="f-pay" name="pay" value="1" type="checkbox"> Pay figure recorded</label><span id="f-count" class="muted" aria-live="polite"></span></form>
<p class="sm muted">Minimum top rate uses the upper end of each stated range, converted to US dollars. Entries without a converted rate are excluded when a minimum is set. <a href="/methodology/">How we check</a>.</p>
{table(outlets,'dir-table')}<p id="outlets-empty" class="muted" hidden>No outlets match these filters.</p></section>
<section aria-labelledby="app-calls"><h2 id="app-calls">Calls &amp; reminders</h2>
<p class="sm muted">Reminders stay on this device. Allow notifications to receive one alert in the three days before a deadline, including deadline day. We check when you open the site and every minute while it is open. Background checks depend on your browser; use a calendar reminder for a scheduled alert when the app is closed. Dates are listed without a time zone; confirm the closing time on the outlet's page.</p>
<p class="cta-row"><button id="enable-notifications">Enable notifications</button></p><p id="reminder-status" class="sm muted" role="status"></p>
<div id="app-call-list"><p>Loading calls… <a href="/calls/">Read all calls</a>.</p></div></section>
<noscript><p>Search, installation controls and reminders need JavaScript. <a href="/calls/">Read calls and deadlines</a>; the outlet directory above remains available.</p></noscript>'''
page('/app/','App',appbody,desc="Search criticism outlets, browse deadlines, and save local reminders in The Pitchboard app.")
# ---------- Newsletter ----------
nbody=f'''<h1>The Open Calls newsletter</h1><p class="lead">A weekly email: what opened, what's closing, and one short critical note on an outlet.</p>
{subscribe_box('Subscribe',True)}
<h2>What's in an issue</h2><ul><li><strong>Open Calls:</strong> new, changed and closing-soon outlets, each with its last-checked date.</li><li><strong>One critical note:</strong> 150-250 words on a single outlet (pay vs. work, pitch rules, who gets in).</li><li><strong>One labeled sponsor slot.</strong></li></ul>
<h2>Archive</h2><p>Past issues appear on the <a href="{ARCHIVE}" rel="noopener">Pitchboard newsletter archive</a> (hosted by beehiiv). The first issues have not been sent yet, so it may be empty.</p>
<p class="sm muted">Questions or corrections: {CONTACT_LINK}.</p>'''
page('/newsletter/','Newsletter',nbody,desc="Free weekly Open Calls email: which criticism outlets are taking pitches now, with deadlines.",layout='article')
# ---------- Advertise ----------
abody='''<h1>Advertise</h1><p class="lead">Reach writers who pitch criticism. Everything sold here is labeled, and sponsorship never changes an outlet's status, data or order.</p>
<div class="notice"><strong>Draft pricing; nothing is for sale yet.</strong> Prices step up as the list grows; founding rates apply while the list is small.</div>
<div class="tablewrap"><table><thead><tr><th>Product</th><th>Launch (founding)</th><th>500+ subscribers</th><th>2,000+ subscribers</th></tr></thead><tbody>
<tr><td>Newsletter sponsor slot (≤60 words + link), per issue</td><td>$40</td><td>$100</td><td>$200-$300</td></tr>
<tr><td>4-issue sponsor bundle</td><td>$120</td><td>$300</td><td>$600-$900</td></tr>
<tr><td>Featured outlet listing, 30 days</td><td>$50</td><td>$100</td><td>$150</td></tr>
<tr><td>Featured listing, 90 days</td><td>$120</td><td>$250</td><td>$400</td></tr>
<tr><td>Themed-call boost (pinned on Calls + one digest mention)</td><td>$30</td><td>$60</td><td>$100</td></tr></tbody></table></div>
<p class="sm muted">Anchor: CLMP's published newsletter ad rates to a 13,000+ reader list: $100-$125 classified, $240-$300 sponsored content (<a href="https://www.clmp.org/advertise-with-us/" rel="noopener">clmp.org</a>, checked 18 Oct 2026). We price below that until our list is comparable.</p>
<h2>How sponsored items appear</h2>'''+sponsor_slot()+'''<p>Featured listings carry a <span class="label sm">Featured · Sponsored</span> label in tables and on the outlet page. The outlet's status, pay and notes stay exactly as we found them.</p>
<h2>Who it's for</h2><p>MFA and low-residency programs, writing tools, small presses, literary organizations, and magazines recruiting reviewers.</p>
<h2>Book a slot or ask a question</h2><p>Email '''+CONTACT_LINK+''' with what you want to promote and the dates you have in mind. Nothing is for sale until we confirm by reply.</p>'''+subscribe_box('Or see the newsletter first',False)
page('/advertise/','Advertise',abody,desc="Sponsor The Pitchboard: labeled newsletter slots and featured outlet listings for writers who pitch criticism.",layout='article')
# ---------- Methodology ----------
mbody=f'''<h1>Methodology</h1>
<h2>What we record</h2><p>Name, homepage, pitch-guidelines link, pay <em>as published</em>, word count, status, the date we last checked, and the source page. If we did not see a fact, the field is blank or marked "not recorded". We never record private editor emails; we link to the outlet's own guidelines page.</p>
<h2>Statuses</h2><dl class="facts">{"".join(f'<dt>{badge({"status":k})}</dt><dd>{esc(v[2])}</dd>' for k,v in STATUS.items())}</dl>
<h2>Last-checked dates and staleness</h2><p>Every outlet shows the date we last read its page. Entries older than {STALE_DAYS} days get a <span class="badge s-stale">Stale: re-check</span> badge. We re-check entries on a rotating schedule, oldest first, and show the last-checked date on every row.</p>
<h2>Where the facts come from</h2><ul><li><strong>Outlet page read directly:</strong> we fetched the outlet's own guidelines page.</li><li><strong>Outlet page via search excerpt:</strong> some sites block non-browser access; we saw the outlet's own page text in a search excerpt. Confirm by hand.</li><li><strong>NBCC sheet:</strong> the National Book Critics Circle's public publications spreadsheet is used as a lead list. Pay or word counts taken from it are labeled and carry that sheet row's own last-updated date; many are 2022-vintage.</li><li><strong>Third-party only:</strong> flagged as unconfirmed.</li></ul>
<h2>Independence</h2><p>Sponsored and featured items are always labeled. They never change any outlet's status, data, or ordering, apart from a clearly marked featured position. Outlets cannot pay to change what we report.</p>
<h2>Limits</h2><p>Pages change without notice, some outlets do not publish pay, and we may have missed an update. Verify on the outlet's page before pitching, and <a href="/about/#corrections">send corrections</a> to '''+CONTACT_LINK+'''.</p>
<h2 id="privacy">Privacy</h2><p>This site has no accounts and does not run its own analytics or ad trackers. If you subscribe to the newsletter, <a href="https://www.beehiiv.com" rel="noopener">beehiiv</a>, our email provider, collects and stores your address under its own <a href="https://www.beehiiv.com/privacy" rel="noopener">privacy policy</a>. We use it only to send the newsletter; you can unsubscribe from any issue. The signup form and beehiiv's attribution script load from beehiiv's servers. To ask us to delete your address, email '''+CONTACT_LINK+'''.</p>'''
page('/methodology/','Methodology',mbody,desc="How The Pitchboard checks outlets, dates every fact, labels sources, and keeps sponsorship separate from data.",layout='article')
# ---------- About ----------
page('/about/','About',f'''<h1>About</h1><p>The Pitchboard is an independent directory for people who write criticism. It is run by a critic who criticizes everything, including the market that pays for criticism. Notes on outlets will be opinionated. The data will not be.</p>
<p class="notice"><strong>Launched October 2026.</strong> The directory is new and still a work in progress; every entry shows when it was last checked. Spot a mistake? <a href="#corrections">Tell us</a>.</p>
<h2 id="corrections">Corrections</h2><p>Spot something out of date or wrong? Outlet editors can ask us to update or remove an entry. Email {CONTACT_LINK} with the outlet name and a link to the page that shows the correct information.</p>
<h2 id="contact">Contact and sponsorship</h2><p>Corrections, press and sponsorship enquiries: {CONTACT_LINK}. See <a href="/advertise/">Advertise</a> for how sponsored items work.</p>
<h2 id="privacy">Privacy</h2><p><a href="https://www.beehiiv.com" rel="noopener">beehiiv</a> handles newsletter signups; it stores your address and sends the emails. Details are on the <a href="/methodology/#privacy">methodology page</a>. Past issues: <a href="{ARCHIVE}" rel="noopener">newsletter archive</a>.</p>''',desc="About The Pitchboard, an independent directory of outlets that pay for book reviews and cultural criticism; corrections and contact.",layout='article')
page('/404','Not found','<h1>Page not found</h1><p><a href="/">Back to home</a> · <a href="/outlets/">Directory</a></p>')
# ---------- static ----------
(OUT/'static').mkdir(parents=True,exist_ok=True)
for f in (ROOT/'static').iterdir(): shutil.copy(f,OUT/'static'/f.name)
(OUT/'robots.txt').write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
(OUT/"_headers").unlink(missing_ok=True)
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!-- The Pitchboard sitemap -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'<url><loc>{u}</loc><lastmod>{TODAY.isoformat()}</lastmod></url>\n' for u in sorted(set(PAGES)))+'</urlset>\n')
shutil.copy(ROOT/'data/outlets.json',OUT/'outlets.json')
shutil.copy(ROOT/'data/calls.json',OUT/'calls.json')
shutil.copy(ROOT/'manifest.webmanifest',OUT/'manifest.webmanifest')

def write_icon(size):
    # Dependency-free raster version of static/icon.svg: a paper P on rust.
    def chunk(kind, data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    pixels=bytearray()
    for y in range(size):
        pixels.append(0)  # PNG scanline filter
        for x in range(size):
            u,v=x/size,y/size
            paper=(.29<=u<.40 and .23<=v<.77) or (.40<=u<.67 and (.23<=v<.34 or .46<=v<.57)) or (.59<=u<.70 and .30<=v<.50)
            pixels.extend((250,248,244) if paper else (138,42,28))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels)))+chunk(b'IEND',b'')
    (OUT/f'static/icon-{size}.png').write_bytes(png)
for size in (192,512): write_icon(size)
# Change the worker on every asset/data/app-shell update so cache-first assets refresh.
assets=['app/index.html','static/app.js','static/style.css','static/icon.svg','static/icon-192.png','static/icon-512.png','manifest.webmanifest','outlets.json','calls.json']
worker=(ROOT/'sw.js').read_text()
version=hashlib.sha256(worker.encode()+b''.join((OUT/p).read_bytes() for p in assets)).hexdigest()[:16]
(OUT/'sw.js').write_text(worker.replace('__CACHE_VERSION__',version),encoding='utf-8')
print(f"built {len(outlets)} outlet pages + 9 pages -> {OUT} (today={TODAY})")
