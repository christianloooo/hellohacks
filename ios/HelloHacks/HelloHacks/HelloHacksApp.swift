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
            Image("HuddleLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 124)
                .accessibilityHidden(true)
            Text("HUDDLE")
                .font(.custom("ChalkboardSE-Bold", size: 36))
                .foregroundStyle(Color(red: 0.71, green: 0.24, blue: 0.27))
            Text("HUDDLE helps your group plan a hangout in Messages. Open a conversation, tap +, then choose HUDDLE.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .preferredColorScheme(.light)
    }
}
