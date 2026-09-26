# HUDDLE

HUDDLE helps a group turn individual preferences into a hangout plan. The iMessage extension creates a shared invite; each person opens it, signs in, adds their own interests, budget, needs, and availability, then votes on suggested plans. The app does not read message history.

## What is implemented

- **Web app** (`frontend`): sign-in screen, group invite joining, preferences, calendar connection status, suggested plans, voting, and copy-to-Messages actions.
- **Backend** (`backend/server.mjs`): Google OAuth, session membership, preference storage, free/busy lookups, matching rules, optional AI-written explanations, and votes.
- **iMessage extension** (`ios/HelloHacks/MessageExtension`): opens from the Messages attachment drawer and creates a shareable HUDDLE invite through the API.
- **Demo mode**: creates a sample group so the flow can be presented without OAuth credentials.

## Run the web demo

Use two terminals from the repository root.

1. Start the backend:

   ```sh
   cd backend
   cp .env.example .env
   npm run dev
   ```

2. In another terminal, start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

3. Open the local Vite URL shown by the frontend and choose **Try a group demo**. No Google or OpenAI key is needed for the demo. The matching rules still produce plan ideas; the optional AI key only writes the short explanation text.

The backend uses Node.js built-in modules. The frontend needs Node.js and npm to install its existing Vite/React dependencies.

## Configure Google Calendar

Google sign-in and Calendar access need credentials from a Google Cloud project; no app can create these on your behalf.

1. Enable the Google Calendar API in Google Cloud.
2. Configure the OAuth consent screen and add the demo accounts as test users.
3. Create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI: `http://localhost:3001/auth/google/callback`.
5. Put the client ID and secret in `backend/.env`. Keep the secret on the backend only.
6. Restart the backend, then use **Continue with Google**. The requested Calendar scope is free/busy; event titles and descriptions are not read.

For a deployed app, set `GOOGLE_REDIRECT_URI`, `FRONTEND_ORIGIN`, and `PUBLIC_APP_URL` to your HTTPS deployment URLs and add the redirect URL in Google Cloud.

## Optional AI explanations

Add an OpenAI API key to `OPENAI_API_KEY` in `backend/.env`. It stays on the backend. The server sends the group’s preference fields and candidate ideas to the Responses API to write short rationales. If the key is missing or the request fails, the built-in matching rules still work. Never put this key in frontend code.

## Run the iMessage extension

1. Open `ios/HelloHacks/HelloHacks.xcodeproj` in Xcode.
2. Select the `HelloHacks` scheme and an iPhone simulator or connected iPhone.
3. In Signing & Capabilities, select your Apple developer team and replace the `com.example.HelloHacks` bundle IDs with identifiers owned by your team.
4. Deploy the backend and web app to HTTPS, then set `HUDDLE_API_BASE_URL` in `ios/HelloHacks/MessageExtension/Info.plist` to the backend origin (for example, `https://api.example.com`).
5. Build and run the host app. In Messages, open a conversation, tap **+**, and choose **HUDDLE**. Choose **Create group invite** and send the generated message.

The iMessage extension needs a reachable HTTPS backend to create a share link. A local `localhost` backend is not reachable from a physical phone. For a hackathon demo without an HTTPS deployment, present the web demo separately or configure a temporary HTTPS tunnel and use its stable backend URL. The host app and extension require Apple signing to run in Messages.

## Prototype limits

- The plan catalog, estimated prices, and activity descriptions are sample data, not live venue search or booking.
- Availability checks use a small set of upcoming weekend windows and Calendar free/busy data, or the participant’s manually chosen windows.
- Sessions are stored locally in `backend/data/sessions.json`; OAuth sessions and tokens are memory-only and are lost on backend restart. This is a hackathon prototype, not production storage.
- Demo mode is for local presentations. Set `DEMO_MODE=false` for a deployment.
- The extension shares a group invite, while preferences, availability, and voting happen on the web app.
