# Setting up Rayons with your own Google account

Everything below is free for one person. It takes about 30 minutes. Steps 2 and 3 need you signed in to Google Cloud and Supabase; the rest can be done together.

Suggested address: `https://rayons.app.roberrini.com` (like Little Stories). Replace it everywhere if you choose another.

## 1. Supabase

1. [supabase.com](https://supabase.com) → **New project** → name `rayons`, region close to you (the free plan allows two active projects).
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run**.
3. **Project Settings → API Keys**: copy the project URL, the **publishable** key and a **secret** key.
4. **Authentication → Sign In / Providers**: leave anonymous sign-ins off.

## 2. Google Cloud

Rayons gets its own Google Cloud project: a project has one consent screen, and Gmail access shouldn't share one with Little Stories.

1. [console.cloud.google.com](https://console.cloud.google.com) → **New project** → `Rayons`.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Calendar API**.
3. **Google Auth Platform → Branding**: app name `Rayons`, your support email, authorised domain `roberrini.com`, a privacy page later if you publish it.
4. **Data access → Add or remove scopes**, add:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
5. **Audience**: External. Then choose:
   - **Testing** (add yourself as a test user): simplest, but Google expires the sign-in every **7 days** for apps in testing, so you'd sign in again weekly.
   - **In production, unverified** (recommended for personal use): no weekly sign-in. Google shows "Google hasn't verified this app" once; click *Advanced → Go to Rayons*. Limited to 100 users, which is fine for you and a few friends.
   - Opening Rayons to the public with Gmail access needs Google's verification and a yearly security assessment for the Gmail scope. Other people can instead run their own copy with their own Google Cloud project, which is what an open-source user would do.
6. **Clients → Create client → Web application**, named `Rayons web`:
   - Authorised JavaScript origins: `http://localhost:5175`, `https://rayons.app.roberrini.com`
   - Authorised redirect URIs: `http://localhost:5175/auth/callback`, `https://rayons.app.roberrini.com/auth/callback`
   - Copy the **client ID** and **client secret**.

## 3. Connect Supabase to Google

Supabase → **Authentication → Sign In / Providers → Google**: enable it and put the client ID in **Client IDs** (and the secret if the form asks). Supabase then accepts the Google ID tokens Rayons hands it.

## 4. Environment

Copy `.env.example` to `.env.local` and fill it in:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_KEY=sb_publishable_…
VITE_GOOGLE_CLIENT_ID=….apps.googleusercontent.com

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
GOOGLE_CLIENT_ID=….apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
TOKEN_ENCRYPTION_KEY=<32 random bytes, base64>
```

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep it safe: losing it means signing in to Google again (nothing else is lost). Never give a `VITE_` name to a secret: those are built into the public JavaScript.

`bun run dev` now shows "Continue with Google". The `api/` functions run inside the dev server.

### Translation (optional)

In Google Chrome, translation runs on the computer and needs nothing. Other browsers (Arc, Safari, phones) use a service:

1. Create a free [DeepL API](https://www.deepl.com/pro-api) account ("DeepL API Free", 500,000 characters a month; DeepL asks for a card to verify you but doesn't charge the free plan).
2. Account → **API Keys** → copy the key (it ends in `:fx`).
3. Add `DEEPL_API_KEY=<key>` to `.env.local` and to Vercel's environment variables, then redeploy.

(Alternatively `GOOGLE_TRANSLATE_API_KEY`, a Google Cloud Translation key; that needs billing enabled on the Google Cloud project.)

## 5. Deploy (Vercel)

1. Push the repository to GitHub.
2. Vercel → **Add New → Project** → import it. The Vite preset is detected.
3. Add every variable from step 4 to the Vercel project (Production and Preview).
4. **Settings → Domains → Add** `rayons.app.roberrini.com`, then at OVH add a CNAME `rayons.app` → the target Vercel shows.

Every push to `main` deploys.

## When something goes wrong

| You see | Likely cause |
|---|---|
| `redirect_uri_mismatch` on Google's page | The redirect URI in step 2.6 doesn't match exactly (scheme, port, `/auth/callback`). |
| "Could not sign you in. Is Google enabled in Supabase…" | Step 3: the client ID isn't in Supabase's Google **Client IDs**. |
| "The server is missing …" | A server variable from step 4 isn't set (locally in `.env.local`, or in Vercel). |
| "Rayons needs access to both Gmail and Google Calendar" | A box was left unticked on Google's consent screen. Sign in again and tick them all. |
| "Google needs you to sign in again" bar | The stored token was refused (7-day testing expiry, revoked access, password change). |
