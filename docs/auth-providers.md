# Apple and Google sign-in — the manual setup

Registro v3 offers «Continuar con Apple» and «Continuar con Google». The code is in
`src/lib/oauth.ts`, `src/features/auth/OAuthButtons.tsx` and `src/app/auth-callback.tsx`.
None of it works until someone with access to the consoles does the steps below. Until then
the buttons are not shown: each one appears only when its provider is named in
`EXPO_PUBLIC_OAUTH_PROVIDERS` (`apple`, `google` or `apple,google`). Set it as the last step,
after trying the provider once. On the web a button for a provider that is off cannot explain
itself, because the browser has already left for a Supabase error page.

Never paste a client secret, a `.p8` key or the service-role key into the repo, an issue, CI
logs or a screenshot. They go into the Supabase dashboard only.

## Redirect URLs

| What                            | Value                                                |
| ------------------------------- | ---------------------------------------------------- |
| Supabase callback (providers)   | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Web, back into Movo             | `https://<movo-domain>/registro`                     |
| iOS and Android, back into Movo | `movo://auth-callback`                               |

In Supabase › Authentication › URL Configuration, add the last two to **Redirect URLs**
(and `http://localhost:8081/registro` for local web).

«¿Olvidaste tu contraseña?» needs one more in the same list: `https://<movo-domain>/recuperar`
(and `http://localhost:8081/recuperar`). Without it the link in the recovery email lands on the
site's home page, signed in, with nowhere to choose the new password.

## Google

1. Google Cloud Console › APIs & Services › OAuth consent screen: app name «Movo», support
   email, the privacy notice URL once `/privacidad` exists. Scopes: `openid`, `email`,
   `profile` only.
2. Credentials › Create OAuth client ID › **Web application**. Authorised redirect URI: the
   Supabase callback above.
3. Supabase › Authentication › Providers › Google: enable, paste the client ID and secret.

## Apple

1. Apple Developer › Certificates, IDs & Profiles:
   - the App ID `cr.movo.app` with **Sign in with Apple** on;
   - a **Services ID** (for web), with the Supabase callback as return URL and the Movo domain
     as domain;
   - a **Key** with Sign in with Apple, downloaded once as `.p8`.
2. Supabase › Authentication › Providers › Apple: enable; Services ID as client ID; generate
   the secret from the Team ID, Key ID and `.p8` (the dashboard explains it). The secret
   expires every six months: put a reminder in the calendar.
3. Apple sends the email only the first time, and may send a private relay address. Movo does
   not depend on either: the name and everything else are asked in `/registro`.

## What happens after

Both providers create the account with no date of birth. The app sends every account without
`profile_private.signup_completed_at` to `/registro` (0060), where an under-18 date deletes
the account before anything is kept.

## Later, for the App Store

The phone flow opens the provider in the browser and comes back on `movo://auth-callback`.
Before submitting to the App Store, switch iOS to the native Sign in with Apple sheet
(`expo-apple-authentication` plus `signInWithIdToken`) and the in-app browser session
(`expo-web-browser`). Neither package is installed yet.
