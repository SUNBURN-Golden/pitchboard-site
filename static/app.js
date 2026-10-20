(function(){
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
      if(m==='pay')return (+b.dataset.paymax||0)-(+a.dataset.paymax||0)||a._idx-b._idx;
      if(m==='checked')return (a.dataset.checked<b.dataset.checked?1:a.dataset.checked>b.dataset.checked?-1:0)||a._idx-b._idx;
      return a._idx-b._idx;
    }).forEach(function(r){body.appendChild(r);});
    c.textContent=n+' of '+rows.length+' shown';}
  [q,st,rg,pay,so].forEach(function(e){e.addEventListener('input',run);e.addEventListener('change',run)}); run();
})();
