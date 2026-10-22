(function(){
  var $=function(id){return document.getElementById(id)};
  function msg(t){var m=$('auth-msg'); if(m) m.textContent=t;}
  var g=$('google-btn');
  if(g){
    if(/[?&]error=/.test(location.search)) msg('Sign-in did not finish. Please try again.');
    g.addEventListener('click',function(){
      var box=$('newsletter-opt');
      location.href='/api/auth/google?newsletter='+(box&&!box.checked?'0':'1');
    });
  }
  var acct=$('account');
  if(!acct) return;
  fetch('/api/me',{credentials:'same-origin'}).then(function(r){
    if(r.status===401){location.replace('/signup/');return null;}
    if(!r.ok){msg('Sign-in is not open yet. Check back soon.');return null;}
    return r.json();
  }).then(function(row){
    if(!row) return;
    msg('');
    $('acct-email').textContent=row.email;
    var box=$('acct-newsletter'); box.checked=row.newsletter_opt_in; acct.hidden=false;
    box.addEventListener('change',function(){
      fetch('/api/me',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({newsletter_opt_in:box.checked})})
        .then(function(r){msg(!r.ok?'Could not save. Please try again.':(box.checked?'You will get the Thursday email.':'You will not get the Thursday email.'));});
    });
    $('signout').addEventListener('click',function(){
      fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).then(function(){location.href='/';});
    });
  }).catch(function(){msg('Could not load your account. Please try again.');});
})();
