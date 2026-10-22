# Google sign-up setup

1. Supabase project for Pitchboard: create one (free tier) or pick one, then run `supabase/migrations/20261022_members.sql`.
2. Google Cloud > APIs & Services > Credentials > OAuth client ID (Web application):
   - Authorized JavaScript origins: `https://pitchboard.soulbound.co.kr`
   - Authorized redirect URI: `https://fbtlasclhzjmoynswozl.supabase.co/auth/v1/callback` (project `pitchboard`, ref fbtlasclhzjmoynswozl, created and migrated)
3. Supabase > Authentication > Providers > Google: paste the client ID and secret, then enable it.
4. Supabase > Authentication > URL Configuration:
   - Site URL: `https://pitchboard.soulbound.co.kr`
   - Redirect URLs: `https://pitchboard.soulbound.co.kr/account/` (add `http://localhost:8000/account/` for local tests)
5. Fill `static/auth-config.js` with the project URL and anon key, rebuild and deploy.

Until step 5 the sign-up page shows "Sign-in is not open yet" and the button is disabled.
