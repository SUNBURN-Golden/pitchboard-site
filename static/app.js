/* Shared directory filters; the app refreshes the same table from local JSON. */
(function () {
  'use strict';
  var table = document.getElementById('dir-table');
  if (!table) return;
  var body = table.tBodies[0], form = document.getElementById('directory-filters');
  var q = form.querySelector('#f-q'), status = form.querySelector('#f-status');
  var region = form.querySelector('#f-region'), pay = form.querySelector('#f-pay');
  var sort = form.querySelector('#f-sort'), minimum = form.querySelector('#f-min-pay');
  var count = document.getElementById('f-count'), params = new URLSearchParams(location.search);
  [q, status, region, pay, sort, minimum].filter(Boolean).forEach(function (input) {
    if (input.type === 'checkbox') input.checked = params.get(input.name) === '1';
    else if (params.has(input.name)) input.value = params.get(input.name);
    input.addEventListener('input', run);
    input.addEventListener('change', run);
  });
  form.addEventListener('submit', function (event) { event.preventDefault(); run(); });
  table.addEventListener('outlets-updated', run);
  function run() {
    var words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
    var rows = Array.from(body.rows);
    rows.forEach(function (row, index) {
      if (row._idx === undefined) row._idx = index;
      var ok = words.every(function (word) { return row.dataset.text.includes(word); }) &&
        (!status.value || row.dataset.status === status.value) &&
        (!region.value || row.dataset.region === region.value) &&
        (!pay.checked || row.dataset.pay === '1') &&
        (!minimum || minimum.value === '' || (row.dataset.paymax !== '' && Number(row.dataset.paymax) >= Number(minimum.value)));
      row.hidden = !ok;
      if (ok) shown++;
    });
    rows.sort(function (a, b) {
      var featured = Number(b.dataset.featured) - Number(a.dataset.featured);
      if (featured) return featured;
      if (sort.value === 'pay') {
        if (a.dataset.paymax === '') return b.dataset.paymax === '' ? a._idx - b._idx : 1;
        if (b.dataset.paymax === '') return -1;
        return Number(b.dataset.paymax) - Number(a.dataset.paymax) || a._idx - b._idx;
      }
      if (sort.value === 'checked') return b.dataset.checked.localeCompare(a.dataset.checked) || a._idx - b._idx;
      return a._idx - b._idx;
    }).forEach(function (row) { body.appendChild(row); });
    count.textContent = shown + ' of ' + rows.length + ' shown';
    var empty = document.getElementById('outlets-empty');
    if (empty) empty.hidden = shown !== 0;
  }
  run();
})();

(function () {
  'use strict';
  var KEY = 'pitchboard-reminders-v1', reminders = [], registration = null;
  var app = document.getElementById('app-call-list'), calls = [], installPrompt = null;
  var renderedDay = null, renderedReminders = '';
  var status = document.getElementById('reminder-status'), enable = document.getElementById('enable-notifications');
  var storageOK = true;
  function readReminders() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '[]');
      reminders = Array.isArray(saved) ? saved.filter(function (r) {
        return r && typeof r.id === 'string' && typeof r.deadline === 'string';
      }) : [];
    } catch (_) { reminders = []; storageOK = false; }
  }
  function message(text) { if (status) status.textContent = text; }
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char];
    });
  }
  function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function today() {
    var now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }
  function days(date) { return (Date.parse(date + 'T00:00:00Z') - today()) / 86400000; }
  function dateLabel(date) {
    return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  }
  function safeLink(url) {
    try { var parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.href : '#'; }
    catch (_) { return '#'; }
  }
  function notificationStatus() {
    if (!enable) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) {
      enable.hidden = true;
      message('Notifications are unavailable here. Download a calendar reminder for any dated call.');
    } else if (Notification.permission === 'granted') {
      enable.hidden = true;
      message('Notifications enabled. Saved reminders are checked when you open the site.');
    } else if (Notification.permission === 'denied') {
      enable.hidden = true;
      message('Notifications are blocked in your browser settings. Calendar downloads are available below.');
    } else message('Save a reminder, then enable notifications, or download it to your calendar.');
    if (!storageOK) message('Reminders cannot be stored in this browser. Download a calendar reminder instead.');
  }
  function syncReminders() {
    // Read again so another tab's changes are never overwritten by a stale snapshot.
    readReminders();
    if (registration && registration.active) registration.active.postMessage({type: 'SYNC_REMINDERS', reminders: reminders});
  }
  function saveReminders(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); reminders = next; }
    catch (_) { storageOK = false; message('Could not save on this device. Download a calendar reminder instead.'); return false; }
    syncReminders();
    return true;
  }
  async function periodicChecks() {
    if (!registration || !('periodicSync' in registration) || !('permissions' in navigator)) return;
    try {
      var permission = await navigator.permissions.query({name: 'periodic-background-sync'});
      if (permission.state === 'granted' && 'Notification' in window && Notification.permission === 'granted') {
        await registration.periodicSync.register('pitchboard-reminders', {minInterval: 12 * 60 * 60 * 1000});
      }
    } catch (_) { /* Calendar and foreground checks work without periodic sync. */ }
  }
  async function requestNotifications() {
    // Called directly from a click, before any await, for browsers requiring user activation.
    try {
      var permission = await Notification.requestPermission();
      notificationStatus();
      if (permission === 'granted') { syncReminders(); periodicChecks(); }
    } catch (_) { message('Notifications could not be enabled. Use a calendar download below.'); }
  }
  readReminders();
  notificationStatus();
  if (enable) enable.addEventListener('click', requestNotifications);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (ready) {
      registration = ready;
      syncReminders(); periodicChecks();
    }).catch(function () {
      message('Offline access and notifications could not start. Calendar downloads are still available.');
    });
  }
  function check() {
    if (document.visibilityState === 'hidden') return;
    syncReminders();
    if (app && (renderedDay !== today() || renderedReminders !== JSON.stringify(reminders))) renderCalls();
  }
  window.addEventListener('focus', check);
  window.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) check(); });
  document.addEventListener('visibilitychange', check);
  setInterval(check, 60000);
  if (!app) return;

  var install = document.getElementById('install-app');
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); installPrompt = event; install.hidden = false;
  });
  install.addEventListener('click', async function () {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null; install.hidden = true;
  });
  window.addEventListener('appinstalled', function () {
    install.hidden = true; installPrompt = null;
    document.getElementById('install-help').textContent = 'The Pitchboard is installed on this device.';
    periodicChecks();
  });
  function connectionStatus() {
    document.getElementById('app-connection').textContent = navigator.onLine ?
      'Available offline after your first visit. Each entry shows when it was checked.' :
      'You are offline. Showing saved entries; confirm deadlines when you reconnect.';
  }
  window.addEventListener('offline', connectionStatus);
  window.addEventListener('online', function () { connectionStatus(); refresh(); check(); });
  connectionStatus();

  function renderOutlets(outlets) {
    var table = document.getElementById('dir-table'), body = table.tBodies[0];
    var featured = new Set(Array.from(body.rows).filter(function (r) { return r.dataset.featured === '1'; })
      .map(function (r) { return r.querySelector('a').getAttribute('href'); }));
    var statuses = {open: ['Open', 's-open'], closed: ['Closed', 's-closed'], 'pitch-first': ['Pitch first', 's-pitch'],
      'periodic-calls': ['Calls only', 's-calls'], 'no-public-guidelines': ['No public guidelines', 's-none']};
    body.innerHTML = outlets.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (r) {
      var href = '/outlets/' + slug(r.name) + '/', isFeatured = featured.has(href);
      var state = statuses[r.status] || ['Unknown', 's-none'], stale = days(r.last_checked) < -90;
      return '<tr role="row" data-text="' + escape((r.name + ' ' + (r.notes || '')).toLowerCase()) +
        '" data-status="' + escape(r.status) + '" data-region="' + escape(r.region) +
        '" data-pay="' + (r.pays && r.pays !== 'unpublished' ? '1' : '0') + '" data-paymax="' +
        escape(r.pay_usd_max) + '" data-checked="' + escape(r.last_checked) + '" data-featured="' + Number(isFeatured) + '">' +
        '<td role="cell" data-label="Outlet" class="n"><a href="' + href + '">' + escape(r.name) + '</a>' +
        (isFeatured ? ' <span class="label sm">Featured · Sponsored</span>' : '') + '<div class="muted sm">' + escape(r.region) + '</div></td>' +
        '<td role="cell" data-label="Status"><span class="badge ' + state[1] + '">' + state[0] + '</span></td>' +
        '<td role="cell" data-label="Pay (as published)">' + escape(r.pays || 'not recorded') + '</td>' +
        '<td role="cell" data-label="Word count">' + escape(r.word_count || 'not recorded') + '</td>' +
        '<td role="cell" data-label="Last checked" class="chk"><span class="checked' + (stale ? ' stale' : '') + '">Last checked <time datetime="' +
        escape(r.last_checked) + '">' + dateLabel(r.last_checked) + '</time>' +
        (stale ? ' <span class="badge s-stale">Stale: re-check</span>' : '') + '</span></td></tr>';
    }).join('');
    var select = document.getElementById('f-region'), selected = select.value;
    select.innerHTML = '<option value="">Any</option>' + Array.from(new Set(outlets.map(function (r) { return r.region; }))).sort()
      .map(function (region) { return '<option>' + escape(region) + '</option>'; }).join('');
    select.value = selected;
    table.dispatchEvent(new Event('outlets-updated'));
  }
  function renderCalls() {
    renderedDay = today(); renderedReminders = JSON.stringify(reminders);
    app.innerHTML = calls.length ? calls.slice().sort(function (a, b) {
      return (a.deadline || '9999').localeCompare(b.deadline || '9999');
    }).map(function (call) {
      var remaining = call.deadline ? days(call.deadline) : null;
      var saved = reminders.some(function (r) { return r.id === call.id; });
      var label = remaining === null ? 'Rolling' : remaining < 0 ? 'Deadline passed' : remaining === 0 ? 'Closes today' : remaining + ' days left';
      return '<article class="call" id="call-' + escape(call.id) + '"><h3>' + escape(call.title) + '</h3><p><strong>' +
        escape(call.outlet) + '</strong> · ' + escape(call.type) + ' · <span class="badge ' + (remaining !== null && remaining < 0 ? 's-closed' : 's-open') + '">' + label + '</span></p><p>' +
        (call.opens ? 'Opens ' + dateLabel(call.opens) + ' · ' : '') + (call.deadline ? 'Deadline <strong>' + dateLabel(call.deadline) + '</strong>' : 'No deadline stated') +
        ' · Pay: ' + escape(call.pay) + '</p><p>' + escape(call.details) + '</p><p class="sm"><a href="' + escape(safeLink(call.link)) +
        '" rel="noopener">Outlet page</a> · <span class="checked">Last checked ' + dateLabel(call.last_checked) + '</span></p>' +
        '<div class="call-actions"><button data-remind="' + escape(call.id) + '" aria-pressed="' + saved + '"' +
        ((!saved && (remaining === null || remaining < 0)) || !storageOK ? ' disabled' : '') + '>' + (saved ? 'Remove reminder' : 'Remind me') + '</button>' +
        (remaining !== null ? '<button class="calendar-download" data-calendar="' + escape(call.id) + '">Download .ics</button>' : '<span class="sm muted">Reminders need a stated deadline.</span>') + '</div></article>';
    }).join('') : '<p class="muted">No calls on the board right now. Check back soon.</p>';
    // Preserve notification deep links after the asynchronous list renders.
    if (location.hash && !app.dataset.scrolled) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) { target.scrollIntoView(); app.dataset.scrolled = '1'; }
    }
  }
  function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function downloadCalendar(call) {
    var end = new Date(call.deadline + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Pitchboard//Deadline reminders//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + icsEscape(call.id) + '@pitchboard.soulbound.co.kr',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART;VALUE=DATE:' + call.deadline.replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replace(/-/g, ''),
      'SUMMARY:' + icsEscape(call.title),
      'DESCRIPTION:' + icsEscape(call.outlet + '\n' + call.details + '\nConfirm closing time on the outlet page.\n' + safeLink(call.link)),
      'URL:' + safeLink(call.link), 'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', 'DESCRIPTION:Submission deadline in 3 days', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    // Fold at 75 UTF-8 octets, including the continuation space (RFC 5545).
    var encoder = new TextEncoder();
    var text = lines.map(function (line) {
      var folded = '', width = 0;
      for (var char of line) {
        var length = encoder.encode(char).length;
        if (width + length > 75) { folded += '\r\n '; width = 1; }
        folded += char; width += length;
      }
      return folded;
    }).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([text], {type: 'text/calendar;charset=utf-8'}));
    var link = document.createElement('a'); link.href = url; link.download = slug(call.id) + '.ics';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  app.addEventListener('click', function (event) {
    var button = event.target.closest('button'); if (!button) return;
    var id = button.dataset.remind || button.dataset.calendar;
    var call = calls.find(function (item) { return item.id === id; }); if (!call) return;
    if (button.dataset.calendar) { downloadCalendar(call); return; }
    readReminders();
    var saved = reminders.some(function (r) { return r.id === id; });
    var next = reminders.filter(function (r) { return r.id !== id; });
    if (!saved) next.push({id: call.id, title: call.title, outlet: call.outlet, deadline: call.deadline});
    if (saveReminders(next)) {
      message(saved ? 'Reminder removed.' : ('Notification' in window && Notification.permission === 'granted' ?
        'Reminder saved on this device. We will check it in the three days before the deadline.' :
        'Reminder saved on this device. Enable notifications or download a calendar reminder.'));
      button.textContent = saved ? 'Remind me' : 'Remove reminder';
      button.setAttribute('aria-pressed', String(!saved));
      renderedReminders = JSON.stringify(reminders);
    }
  });
  async function loadJSON(path) {
    var response = await fetch(path);
    if (!response.ok) throw new Error('Could not load ' + path);
    return response.json();
  }
  function refresh() {
    loadJSON('/outlets.json').then(renderOutlets).catch(function () {
      document.getElementById('app-connection').textContent = 'Could not refresh outlets. Showing entries from the last site build.';
    });
    loadJSON('/calls.json').then(function (data) {
      calls = data.calls;
      readReminders();
      // Follow changed deadlines and discard removed/rolling calls in saved reminders.
      var next = reminders.map(function (reminder) {
        var call = calls.find(function (c) { return c.id === reminder.id; });
        return call && call.deadline ? {id: call.id, title: call.title, outlet: call.outlet, deadline: call.deadline} : null;
      }).filter(Boolean);
      if (JSON.stringify(next) !== JSON.stringify(reminders)) saveReminders(next);
      renderCalls();
    }).catch(function () {
      if (!calls.length) app.innerHTML = '<p class="notice">Calls could not be loaded. Reconnect and reload, or <a href="/calls/">read the calls page</a>.</p>';
    });
  }
  refresh();
})();
