# HUDDLE frontend

This React/Vite app is the preference and voting interface opened from a shared HUDDLE invite. It calls the Node backend using `/api` and `/auth`; Vite proxies those paths to `http://localhost:3001` during development.

Start the backend first with `cd backend && npm run dev`, then start this app with `npm install && npm run dev`. The **Try a group demo** path works without OAuth credentials. See the repository README for Google OAuth, Calendar, optional AI, and iMessage setup.
