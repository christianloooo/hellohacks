# Public web deployment

Deployment target: https://huddled-web-production.up.railway.app

Google callback: `https://huddled-web-production.up.railway.app/auth/google/callback`

The root Dockerfile builds the React frontend and serves it from the Node API.
All browser requests, invitations, and Google OAuth callbacks use the same HTTPS
origin. This supports browsers on phones, tablets, and computers without a local
development server. The native Messages extension is installed separately.

## Railway

1. Deploy this repository from its root using the Dockerfile.
2. Attach a persistent volume at `/data`. Keep one replica: the current storage
   implementation uses local JSON files and in-memory caches.
3. Generate a public domain for port `3001`. Railway provides HTTPS; a custom
   domain is optional and can be added later.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OPENAI_API_KEY` as private
   service variables. Set `TIME_ZONE=America/Vancouver` and optionally
   `OPENAI_MODEL`. Never put secrets in frontend variables, source, or Git.
5. The container sets `NODE_ENV=production`, `DEMO_MODE=false`, and
   `DATA_DIR=/data`. Do not copy the localhost URL settings from your local
   `.env`. By default, the server derives its public origin and OAuth callback
   from `RAILWAY_PUBLIC_DOMAIN`.
6. In the Google Cloud web OAuth client, add
   `https://YOUR-PUBLIC-HOST/auth/google/callback` as an authorized redirect URI.
   Retain the localhost redirect if you still develop locally. Ensure the
   Calendar API is enabled. While the Google OAuth app is in Testing, only
   its listed test users can sign in. Wider Google access requires the
   applicable Google publishing/verification process.
7. Redeploy after setting variables. Check `/api/health`, the landing page,
   Google sign-in, a shared invite on a second device, and idea generation.

If using a custom domain, set `PUBLIC_APP_URL=https://YOUR-DOMAIN` and update the
Google redirect to that domain. An explicit `GOOGLE_REDIRECT_URI` overrides the
derived callback. `FRONTEND_ORIGIN` defaults to the public origin.

The Railway trial expires when its time or credits run out. Continued hosting
and API usage may require payment. This setup does not enable a paid plan.

## Messages extension

Set both `HUDDLE_WEB_BASE_URL` and `HUDDLE_API_BASE_URL` in
`ios/HelloHacks/MessageExtension/Info.plist` to the public HTTPS origin. Rebuild
and install the extension on the iPhone; changing the server alone does not
update an already installed app. Distributing the extension to other people
requires Apple's signing/distribution workflow.

## Checks

```sh
cd frontend
npm ci
npm run lint
npm run build
node --test src/calendarSegments.test.mjs
cd ../backend
npm test
```

For a local production smoke check after building, run the backend with
`NODE_ENV=production`, a temporary `DATA_DIR`, and a configured public origin.
Production cookies require HTTPS for real browser sign-in.

## Shared calendar plans

Generated ideas include an unguessable `shareUrl`. Its page is accessible without
sign-in and offers a prefilled Google Calendar event and an `.ics` download for
Apple Calendar or Outlook. Each person reviews and saves their own event; HUDDLE
does not write directly to anyone's calendar. The link contains only that plan's
event details, not participant preferences or free/busy data.

Plan snapshots live in the existing `/data/sessions.json` file and retain their
original event details across regeneration and restarts. Existing generated
plans receive calendar links on the next deployment. Rebuild the Messages app
to pick up its new icon and calendar sharing actions.
