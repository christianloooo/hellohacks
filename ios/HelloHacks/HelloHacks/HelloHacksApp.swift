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
            Text("HelloHacks")
                .font(.largeTitle.bold())
            Text("Open an iMessage conversation, tap +, then choose HelloHacks to play.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(32)
    }
}
