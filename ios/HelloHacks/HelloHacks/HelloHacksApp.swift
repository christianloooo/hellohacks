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
            Text("Hangout AI")
                .font(.largeTitle.bold())
            Text("Plan your next group hangout right inside Messages. Open a conversation, tap +, then choose Hangout AI.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(32)
    }
}
