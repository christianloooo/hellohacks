# HUDDLE web app

The join field is on the first screen under **OR JOIN YOUR GROUP**. The iMessage extension shares a link with the code prefilled. Each person submits their own interests, budget, calendar availability, needs, travel range, and activity ideas.

Start the API (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`) in separate terminals. The frontend proxies `/api` and `/auth` to `localhost:8787`.

Configure Google and OpenAI in `backend/.env`; see the repo README for scopes and OAuth redirect settings. Google’s free/busy scope is used to check slot availability. The web app receives a signed cookie, and the backend stores refresh tokens in an encrypted local file so users do not need to re-consent every visit. Session responses remain in memory and are lost if the backend restarts.

OpenAI receives anonymous preference objects and user-submitted ideas, not names or Google identity. It returns structured ideas; the backend independently scores each one against budgets, availability, interests, and travel. This keeps hard fit claims out of the model’s control.
