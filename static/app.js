(function(){
  document.querySelectorAll('.pb-sub-form').forEach(function(form){
    form.noValidate=true;
    var input=form.querySelector('.pb-sub-input'), button=form.querySelector('.pb-sub-btn'), msg=form.querySelector('.pb-sub-msg');
    var label=button.textContent;
    form.addEventListener('submit',function(e){
      input.value=input.value.trim();
      if(!input.value||!input.checkValidity()){
        e.preventDefault();
        msg.textContent='Please check your email address and try again.';
        msg.hidden=false;
        input.focus();
        return;
      }
      if(button.disabled){
        e.preventDefault();
        return;
      }
      button.disabled=true;
      button.textContent='Submitting…';
      msg.hidden=true;
    });
    window.addEventListener('pageshow',function(e){
      if(e.persisted){
        button.disabled=false;
        button.textContent=label;
      }
    });
  });
  var t=document.getElementById('dir-table'); if(!t) return;
  var body=t.tBodies[0];
  var rows=[].slice.call(body.rows), form=document.getElementById('directory-filters'), q=document.getElementById('f-q'), st=document.getElementById('f-status'), rg=document.getElementById('f-region'), pay=document.getElementById('f-pay'), so=document.getElementById('f-sort'), c=document.getElementById('f-count');
  rows.forEach(function(r,i){r._idx=i;});
  form.addEventListener('submit',function(e){e.preventDefault();run()});
  var p=new URLSearchParams(location.search); if(p.get('q')) q.value=p.get('q'); if(p.get('status')) st.value=p.get('status'); if(p.get('region')) rg.value=p.get('region'); if(p.get('sort')) so.value=p.get('sort'); pay.checked=p.get('pay')==='1';
  function run(){var s=q.value.trim().toLowerCase().split(/\s+/).filter(Boolean),n=0;
    rows.forEach(function(r){var ok=s.every(function(w){return r.dataset.text.indexOf(w)>-1})&&(!st.value||r.dataset.status===st.value)&&(!rg.value||r.dataset.region===rg.value)&&(!pay.checked||r.dataset.pay==='1');r.hidden=!ok;if(ok)n++;});
    var m=so.value;
    rows.slice().sort(function(a,b){var f=(b.dataset.featured==='1'?1:0)-(a.dataset.featured==='1'?1:0);if(f)return f;
      if(m==='pay'){var x=a.dataset.paymax,y=b.dataset.paymax;if(x===''&&y==='')return a._idx-b._idx;if(x==='')return 1;if(y==='')return -1;return (+y)-(+x)||a._idx-b._idx;}
      if(m==='checked')return (a.dataset.checked<b.dataset.checked?1:a.dataset.checked>b.dataset.checked?-1:0)||a._idx-b._idx;
      return a._idx-b._idx;
    }).forEach(function(r){body.appendChild(r);});
    c.textContent=n+' of '+rows.length+' shown';}
  [q,st,rg,pay,so].forEach(function(e){e.addEventListener('input',run);e.addEventListener('change',run)}); run();
})();

// Compare calendar dates in the reader's timezone without DST affecting the day count.
(function(){
  function day(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')?Date.parse(s+'T00:00:00Z'):NaN;}
  function pl(n){return n+' day'+(n===1?'':'s');}
  var now=new Date();
  var today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  document.querySelectorAll('[data-call]').forEach(function(call){
    var badge=call.querySelector('[data-call-status]');
    var deadline=call.querySelector('time[data-deadline]');
    var left=(day(deadline&&deadline.dateTime)-today)/864e5;
    var untilOpen=(day(badge.dataset.opens)-today)/864e5;
    var closed=left<0, upcoming=!closed&&untilOpen>0;
    badge.classList.toggle('s-closed',closed);
    badge.classList.toggle('s-calls',upcoming);
    badge.classList.toggle('s-open',!closed&&!upcoming);
    badge.textContent=closed?'Closed':upcoming?'Opens in '+pl(untilOpen):
      isNaN(left)?'Rolling':left===0?'Closes today':pl(left)+' left';
  });
  document.querySelectorAll('[data-checked-age]').forEach(function(el){
    var age=Math.max(0,(today-day(el.dataset.checkedAge))/864e5);
    if(!isNaN(age))el.textContent='('+pl(age)+' ago)';
  });
})();

(async function(){
  const form = document.getElementById('alert-prefs');
  if (!form) return;
  const loading = document.getElementById('alerts-loading');
  try {
    const response = await fetch('/api/alerts/prefs');
    if (response.status === 401) {
      loading.hidden = true;
      document.getElementById('alerts-signin').hidden = false;
      return;
    }
    if (!response.ok) throw new Error();
    const prefs = await response.json();
    for (const box of form.querySelectorAll('input[type=checkbox]')) {
      box.checked = Array.isArray(prefs[box.name]) ? prefs[box.name].includes(box.value) : prefs[box.name];
    }
    form.elements.min_pay_usd.value = prefs.min_pay_usd;
    form.hidden = false;
    loading.hidden = true;
  } catch {
    loading.textContent = 'Could not load preferences. Please reload the page.';
    return;
  }

  const button = form.querySelector('button');
  const status = form.querySelector('[role=status]');
  form.addEventListener('submit', async function(event){
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Saving…';
    const data = new FormData(form);
    try {
      const response = await fetch('/api/alerts/prefs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          genres: data.getAll('genres'),
          kinds: data.getAll('kinds'),
          regions: data.getAll('regions'),
          min_pay_usd: Number(data.get('min_pay_usd')),
          include_unstated_pay: data.has('include_unstated_pay'),
          enabled: data.has('enabled')
        })
      });
      if (response.status === 401) {
        document.getElementById('alerts-signin').hidden = false;
        status.textContent = 'Your session expired. Sign in again to save.';
      } else {
        status.textContent = response.ok ? 'Preferences saved.' : 'Could not save preferences. Please try again.';
      }
    } catch {
      status.textContent = 'Could not save preferences. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
})();

(function(){
  const form = document.getElementById('pay-report');
  if (!form) return;
  const outlet = Number(form.dataset.outlet);
  const summary = document.querySelector('[data-pay-summary]');
  const button = form.querySelector('button');
  const status = form.querySelector('[role=status]');

  async function showSummary(){
    try {
      const response = await fetch('/api/pay-reports/summary?outlet=' + outlet, { credentials: 'omit' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.shown) {
        summary.textContent = 'Not enough reports yet.';
        return;
      }
      const list = document.createElement('ul');
      for (const row of result.units) {
        const usd = new Intl.NumberFormat('en-US', {
          style: 'currency', currency: 'USD', maximumFractionDigits: row.unit === 'word' ? 6 : 2
        });
        const item = document.createElement('li');
        const count = row.count + (row.count === 1 ? ' report' : ' reports');
        item.textContent = usd.format(row.median) + ' USD median per ' + row.unit +
          ' · ' + usd.format(row.min) + '–' + usd.format(row.max) +
          ' · ' + count + ' · Latest year ' + row.latest_year;
        list.appendChild(item);
      }
      summary.replaceChildren(list);
    } catch {
      summary.textContent = 'Could not load pay reports.';
    }
  }

  button.disabled = false;
  showSummary();
  form.addEventListener('submit', async function(event){
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Submitting…';
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/pay-reports', {
        method: 'POST',
        credentials: 'omit',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...data, outlet_id: outlet, amount: Number(data.amount), year: Number(data.year)})
      });
      if (response.ok) {
        status.textContent = 'Thanks for sharing your pay.';
        form.reset();
        await showSummary();
      } else if (response.status === 429) {
        status.textContent = 'You’ve reached the report limit. Please try again later.';
      } else if (response.status === 400) {
        status.textContent = 'Check the amount, currency, pay unit, and year.';
      } else {
        throw new Error();
      }
    } catch {
      status.textContent = 'Could not submit your report. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
})();
