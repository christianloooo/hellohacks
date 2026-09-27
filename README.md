# HUDDLE

HUDDLE turns a group’s preferences and availability into AI-generated activities. Friends join through a shared link, connect Google Calendar or choose times manually, and submit their own preferences. The website and Messages extension display the same generated plans. HUDDLE does not read chat history.

## Run the web demo

Use Node.js 20.19+ or 22.12+. Copy `backend/.env.example` to `backend/.env` if the local file does not exist, then configure the Google and OpenAI credentials described below.

In one terminal run `cd backend && npm start`. In another run `cd frontend && npm install && npm run dev`. Open **http://localhost:5173**. Restart the backend whenever you change `.env`.

**Try a group demo** uses sample participants and manual availability, but suggestions still come from OpenAI and require an API key. To simulate another friend locally, open the copied invite in a private browser window and sign in or choose the demo option. A localhost invite is only usable on this computer.

The backend uses Node’s built-in modules. The frontend uses the dependencies already in `frontend/package.json`.

## Flow

1. Sign in with Google and create a group on the website, or start a Huddle in the Messages extension.
2. Copy the group invite and share it with friends. Each friend joins, grants Calendar free/busy access or selects available times, and saves preferences.
3. Once everyone who has joined is ready, the backend finds common upcoming weekend slots and sends preferences plus those shared slots to OpenAI. A new friend joining or someone updating preferences invalidates old suggestions.
4. Three generated activities appear on the website and in Messages. Copy a plan on the website or select and share it from the extension. A failed Calendar or AI request displays an error; it does not produce pretend availability or substitute sample plans.

The backend only knows about people who have joined, so send invites before everyone finishes their preferences. Each group is limited to its joined participants when plans are generated. Generation requests for the same group are deduplicated, and completed suggestions are reused until preferences or membership change.

## Configure Google Calendar

Google sign-in and Calendar require credentials from a Google Cloud project. Enable the Calendar API, create a web OAuth client, add `http://localhost:3001/auth/google/callback` as an authorized redirect URI, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `backend/.env`. Add participating Google accounts as test users while the OAuth app is in testing. The app requests free/busy access only, and preserves group invites across Google sign-in.

## OpenAI activity generation

Set `OPENAI_API_KEY` in `backend/.env` to an OpenAI API project key with model access and available quota. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The backend calls the Responses API with [structured output](https://developers.openai.com/api/docs/guides/structured-outputs) to generate three activities within the group’s lowest budget and verified shared slots. The API key stays on the backend; responses are requested with `store: false`.

OpenAI receives interests, budgets, submitted needs, preferred areas, and computed shared time windows. Google tokens, account names, email addresses, raw busy periods, and calendar event details are not sent. Costs are estimates in CAD. Missing keys, provider failures, and no common availability are shown explicitly.

## Checks

Run `cd backend && npm test` for the isolated HTTP integration test. Google and OpenAI are simulated in this test; no real accounts or keys are used. It covers login cookies, invite restoration, multi-person readiness, AI payloads, Calendar errors, no overlapping time, quota errors, malformed AI output, and membership changes during generation. Run `cd frontend && npm run lint && npm run build` for the website checks.

## Run the iMessage extension

Open `ios/HelloHacks/HelloHacks.xcodeproj` in Xcode, choose the **HelloHacks** scheme, select an iPhone simulator or device, set your Apple development team, and run the host app. In Messages, open a conversation, tap **+**, then choose **HUDDLE**.

The extension defaults to local development URLs in `ios/HelloHacks/MessageExtension/Info.plist`. Those URLs are suitable for the simulator. For a physical iPhone or a group on other devices, deploy the website and API to HTTPS, then set `HUDDLE_WEB_BASE_URL` and `HUDDLE_API_BASE_URL` in that plist to the deployed origins.

## Prototype limits

Groups and preferences are stored in `backend/data/sessions.json`. Login sessions and Google tokens are memory-only; after a backend restart, participants must sign in again to reconnect Calendar. Shared availability checks the next three weeks of weekend windows and the primary Google Calendar. Plan costs are estimates; venue availability, prices, and accessibility details need confirmation.

The long random invite ID acts as access to group summaries and plans from the Messages extension. Only share it with the intended group. Individual preferences and OAuth credentials are never returned through the extension endpoints.
