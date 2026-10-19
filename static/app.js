(function(){
  var t=document.getElementById('dir-table'); if(!t) return;
  var rows=[].slice.call(t.tBodies[0].rows), form=document.getElementById('directory-filters'), q=document.getElementById('f-q'), st=document.getElementById('f-status'), rg=document.getElementById('f-region'), pay=document.getElementById('f-pay'), c=document.getElementById('f-count');
  form.addEventListener('submit',function(e){e.preventDefault();run()});
  var p=new URLSearchParams(location.search); if(p.get('q')) q.value=p.get('q'); if(p.get('status')) st.value=p.get('status'); if(p.get('region')) rg.value=p.get('region'); pay.checked=p.get('pay')==='1';
  function run(){var s=q.value.trim().toLowerCase().split(/\s+/).filter(Boolean),n=0;
    rows.forEach(function(r){var ok=s.every(function(w){return r.dataset.text.indexOf(w)>-1})&&(!st.value||r.dataset.status===st.value)&&(!rg.value||r.dataset.region===rg.value)&&(!pay.checked||r.dataset.pay==='1');r.hidden=!ok;if(ok)n++;});
    c.textContent=n+' of '+rows.length+' shown';}
  [q,st,rg,pay].forEach(function(e){e.addEventListener('input',run);e.addEventListener('change',run)}); run();
})();
