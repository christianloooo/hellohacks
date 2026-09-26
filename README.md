# HUDDLE

HUDDLE helps an iMessage group turn each person’s preferences and availability into a hangout plan. People submit their own input on the website; the Messages extension generates plan ideas and shares the chosen one in the group chat. HUDDLE does not read chat history.

## Run the web demo

From the project root, run `npm run dev`. This starts the backend on port 3001 and the Vite website on port 5173. Open the Vite URL printed in the terminal and choose **Try a group demo**. The demo uses sample plans if `OPENAI_API_KEY` is not set.

The backend uses Node’s built-in modules. The frontend uses the dependencies already in `frontend/package.json`.

## Flow

1. Start a group in the Messages extension, or join using the code from an invite card.
2. Each person opens the invite website and submits their interests, budget, needs, and availability.
3. Return to the group chat, open HUDDLE from the Messages app drawer, and tap **Generate ideas**.
4. Choose an idea and share it back into the conversation.

The website handles initial setup and each person’s preference form. Plan generation and sharing happen in Messages.

## Configure Google Calendar

Google sign-in and Calendar require credentials from a Google Cloud project. Enable the Calendar API, create a web OAuth client, add `http://localhost:3001/auth/google/callback` as an authorized redirect URI, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `backend/.env`. The app requests free/busy access only.

## Optional OpenAI plan generation

Set `OPENAI_API_KEY` in `backend/.env`. The key stays on the backend. If it is absent or the API is unavailable, HUDDLE uses its built-in sample plans.

## Run the iMessage extension

Open `ios/HelloHacks/HelloHacks.xcodeproj` in Xcode, choose the **HelloHacks** scheme, select an iPhone simulator or device, set your Apple development team, and run the host app. In Messages, open a conversation, tap **+**, then choose **HUDDLE**.

The extension defaults to local development URLs in `ios/HelloHacks/MessageExtension/Info.plist`. Those URLs are suitable for the simulator. For a physical iPhone or a group on other devices, deploy the website and API to HTTPS, then set `HUDDLE_WEB_BASE_URL` and `HUDDLE_API_BASE_URL` in that plist to the deployed origins.

## Prototype limits

Sessions and preferences are held in backend memory and disappear when the backend restarts. Google refresh tokens are stored separately in an encrypted local file. Plan costs are estimates; venue availability, prices, and accessibility details need to be confirmed with the venue.
