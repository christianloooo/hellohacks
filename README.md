# Hangout AI

Hangout AI is an iMessage extension concept for finding group hangout ideas that fit everyone’s preferences, budget, and availability.

## Project layout

- `ios/HelloHacks/HelloHacks.xcodeproj` — Xcode project with the iOS host app and iMessage extension.
- `ios/HelloHacks/MessageExtension` — the Messages planning flow and sample plan cards.
- `frontend` — a responsive frontend preview for sign-in, preferences, calendar connection, and sample plan ideas.

## Run in Xcode

1. Open `ios/HelloHacks/HelloHacks.xcodeproj` in Xcode.
2. Select the `HelloHacks` scheme and an iPhone simulator or connected iPhone.
3. In Signing & Capabilities, select your Apple developer team and replace the `com.example.HelloHacks` bundle IDs with identifiers owned by your team.
4. Build and run the host app. In Messages, open a conversation, tap **+**, and choose HelloHacks.

The extension inserts a selected hangout idea into the conversation. Apple signing and an iPhone or iOS simulator are required to try it in Messages.

## Current prototype scope

The extension and web page currently use sample preferences and sample activity suggestions. Google Sign-In, Google Calendar availability, shared group preference collection, and live voting still need OAuth and backend integration. See `frontend/README.md` before connecting Google APIs.
