import SwiftUI

@main
struct HelloHacksApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

private struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 42))
                .foregroundStyle(.indigo)
            Text("HUDDLE")
                .font(.largeTitle.bold())
            Text("HUDDLE helps your group plan a hangout in Messages. Open a conversation, tap +, then choose HUDDLE.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(32)
    }
}
