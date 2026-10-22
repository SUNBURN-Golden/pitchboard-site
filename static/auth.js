(function(){
  var cfg=window.PB_AUTH||{}, $=function(id){return document.getElementById(id)};
  function msg(t){var m=$('auth-msg'); if(m) m.textContent=t;}
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase){msg('Sign-in is not open yet. Check back soon.');var b=$('google-btn');if(b)b.disabled=true;return;}
  var sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  var PENDING='pb_newsletter_choice';
  var g=$('google-btn');
  if(g) g.addEventListener('click',function(){
    var box=$('newsletter-opt');
    localStorage.setItem(PENDING, box&&box.checked?'1':'0');
    sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:cfg.redirectTo}}).then(function(r){if(r.error)msg(r.error.message);});
  });
  var acct=$('account');
  if(!acct) return;
  sb.auth.getSession().then(async function(r){
    var s=r.data.session;
    if(!s){location.replace('/signup/');return;}
    var uid=s.user.id, pending=localStorage.getItem(PENDING);
    var q=await sb.from('members').select('email,newsletter_opt_in').eq('id',uid).maybeSingle();
    var row=q.data;
    if(!row){
      var ins=await sb.from('members').insert({id:uid,email:s.user.email,newsletter_opt_in:pending!=='0'}).select().single();
      row=ins.data; if(ins.error){msg('Could not save your account. Please try again.');return;}
    }
    localStorage.removeItem(PENDING);
    $('acct-email').textContent=row.email;
    var box=$('acct-newsletter'); box.checked=row.newsletter_opt_in; acct.hidden=false;
    box.addEventListener('change',async function(){
      var u=await sb.from('members').update({newsletter_opt_in:box.checked}).eq('id',uid);
      msg(u.error?'Could not save. Please try again.':(box.checked?'You will get the Thursday email.':'You will not get the Thursday email.'));
    });
    $('signout').addEventListener('click',function(){sb.auth.signOut().then(function(){location.href='/';});});
  });
})();
