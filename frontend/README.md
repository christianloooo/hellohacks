# Hangout AI frontend preview

This Vite app previews the onboarding flow: sign-in, activity and budget preferences, calendar connection, and sample hangout ideas. The iMessage extension lives in `../ios/HelloHacks`.

Run `npm install` and `npm run dev` from this directory to view the preview.

## Google integration

The sign-in and calendar controls are demo interactions. To connect real Google accounts, configure an OAuth consent screen and a web OAuth client in Google Cloud, provide its client ID, request the appropriate Calendar scopes, and add a secure authorization-code flow with a backend token exchange. Do not put a Google client secret in this frontend. Calendar events and group preferences are not currently fetched or combined.
