# HelloHacks

HelloHacks is an iOS app with an iMessage app extension for quick, turn based games. The first playable prototype is tic-tac-toe.

## Project layout

- `ios/HelloHacks/HelloHacks.xcodeproj` — open this project in Xcode. It contains the iOS host app and the `MessageExtension` target.
- `ios/HelloHacks/HelloHacks` — the host app shown when HelloHacks is opened outside Messages.
- `ios/HelloHacks/MessageExtension` — the Messages extension and game UI.
- `prototype/web` — the original Vite starter, kept separate as a web prototype.

## Run on iPhone or simulator

1. Open `ios/HelloHacks/HelloHacks.xcodeproj` in Xcode.
2. Select the `HelloHacks` scheme and a simulator or connected iPhone.
3. In Signing & Capabilities, select your Apple developer team and replace the `com.example.HelloHacks` bundle identifiers with identifiers owned by your team.
4. Build and run the host app once. In Messages, open a conversation, tap **+**, then choose HelloHacks from the iMessage apps.

The extension inserts a game card into the conversation. Apple signing and a real device or iOS simulator are required to install and try it in Messages.

## Current prototype scope

The extension UI supports local tic-tac-toe moves and can insert a move card into Messages. Shared board-state restoration, online matchmaking, and the polish and breadth of a shipped game collection still need to be built.
