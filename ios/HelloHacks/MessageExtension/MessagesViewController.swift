import SwiftUI
import UIKit
import Messages

final class MessagesViewController: MSMessagesAppViewController {
    private var host: UIHostingController<HangoutPlannerView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        showPlanner()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        showPlanner()
    }

    private func showPlanner() {
        if let host {
            host.willMove(toParent: nil)
            host.view.removeFromSuperview()
            host.removeFromParent()
            self.host = nil
        }

        let planner = HangoutPlannerView { [weak self] plan in
            guard let conversation = self?.activeConversation else { return }
            let message = MSMessage()
            let layout = MSMessageTemplateLayout()
            layout.caption = "HUDDLE · \(plan.title)"
            layout.subcaption = "\(plan.when) · about $\(plan.price) per person · Share with your group"
            guard let configuredBaseURL = Bundle.main.object(forInfoDictionaryKey: "HUDDLE_API_BASE_URL") as? String,
                  let endpoint = URL(string: configuredBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/sessions/invite") else {
                print("Set HUDDLE_API_BASE_URL in the Messages extension Info.plist to your deployed HUDDLE API.")
                return
            }
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            URLSession.shared.dataTask(with: request) { data, _, error in
                guard error == nil, let data,
                      let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let invite = result["inviteUrl"] as? String,
                      var components = URLComponents(string: invite) else {
                    print("Could not create a HUDDLE invite: \(error?.localizedDescription ?? "invalid API response")")
                    return
                }
                components.queryItems = (components.queryItems ?? []) + [
                    URLQueryItem(name: "plan", value: plan.title),
                    URLQueryItem(name: "when", value: plan.when),
                    URLQueryItem(name: "budget", value: String(plan.price))
                ]
                message.url = components.url
                DispatchQueue.main.async {
                    conversation.insert(message) { error in
                        if let error { print("Could not share HUDDLE invite: \(error)") }
                    }
                }
            }.resume()
        }

        let controller = UIHostingController(rootView: planner)
        addChild(controller)
        view.addSubview(controller.view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        controller.didMove(toParent: self)
        host = controller
    }
}

private struct HangoutPlan: Identifiable {
    let id: Int
    let emoji: String
    let title: String
    let when: String
    let price: Int
    let detail: String

    static let suggestions = [
        HangoutPlan(id: 0, emoji: "🍜🎳", title: "Ramen + Bowling", when: "Sat · 6:00 PM", price: 42, detail: "Dinner, then a game together"),
        HangoutPlan(id: 1, emoji: "🍣📸", title: "Sushi + Photo booth", when: "Sat · 7:00 PM", price: 36, detail: "A cozy dinner and silly photos"),
        HangoutPlan(id: 2, emoji: "🎳🍔", title: "Bowling + Burgers", when: "Sun · 5:30 PM", price: 48, detail: "A little friendly competition")
    ]
}

private struct HangoutPlannerView: View {
    let onVote: (HangoutPlan) -> Void
    @State private var showingSuggestions = false
    @State private var selectedPlan = 0

    private let ink = Color(red: 0.055, green: 0.065, blue: 0.09)
    private let panel = Color(red: 0.105, green: 0.12, blue: 0.15)
    private let purple = Color(red: 0.51, green: 0.43, blue: 1.0)

    var body: some View {
        ZStack {
            ink.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if showingSuggestions {
                        suggestions
                    } else {
                        invitation
                    }
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(purple)
                .frame(width: 38, height: 38)
                .background(purple.opacity(0.16), in: Circle())
            Text("HUDDLE").font(.headline.bold())
            Spacer()
            Text("GROUP PLANNER")
                .font(.system(size: 9, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    private var invitation: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(purple)
                    .padding(.top, 6)
                Text("Plan this hangout")
                    .font(.system(size: 25, weight: .bold, design: .rounded))
                Text("Start a group plan. Everyone adds their own preferences and availability.")
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.66))
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showingSuggestions = true }
            } label: {
                Label("Create group invite", systemImage: "sparkles")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(LinearGradient(colors: [purple, Color(red: 0.39, green: 0.35, blue: 0.92)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 10) {
                Text("EXAMPLE PREFERENCES")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.1)
                    .foregroundStyle(.white.opacity(0.48))
                HStack(spacing: 9) {
                    preferenceTile(icon: "dollarsign", title: "Budget", value: "$30–50")
                    preferenceTile(icon: "calendar", title: "When", value: "Saturday")
                    preferenceTile(icon: "fork.knife", title: "Interests", value: "Food · Games")
                }
            }
            Text("Sample ideas only. Share the invite so everyone can add preferences in HUDDLE.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.4))
                .lineSpacing(3)
        }
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showingSuggestions = false }
            } label: {
                Label("Back", systemImage: "chevron.left")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.66))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 4) {
                Text("Example plans").font(.system(size: 25, weight: .bold, design: .rounded))
                Text("Sample ideas · open the shared link to personalize")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.58))
            }

            ForEach(HangoutPlan.suggestions) { plan in
                planCard(plan)
            }

            Button {
                onVote(HangoutPlan.suggestions[selectedPlan])
            } label: {
                Text("Create invite and share")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(LinearGradient(colors: [purple, Color(red: 0.39, green: 0.35, blue: 0.92)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            Text("Everyone can add preferences and vote from the shared HUDDLE link.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.42))
                .frame(maxWidth: .infinity)
        }
    }

    private func preferenceTile(icon: String, title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(title, systemImage: icon)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.58))
            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 57, alignment: .leading)
        .padding(10)
        .background(panel, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(.white.opacity(0.06), lineWidth: 1))
    }

    private func planCard(_ plan: HangoutPlan) -> some View {
        let isSelected = selectedPlan == plan.id
        return Button {
            selectedPlan = plan.id
        } label: {
            HStack(spacing: 12) {
                Text(plan.emoji).font(.system(size: 25))
                VStack(alignment: .leading, spacing: 5) {
                    Text(plan.title).font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                    Text(plan.detail).font(.system(size: 11)).foregroundStyle(.white.opacity(0.55))
                    HStack(spacing: 10) {
                        Label(plan.when, systemImage: "calendar")
                        Label("~$\(plan.price)/person", systemImage: "person")
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.62))
                }
                Spacer(minLength: 0)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 21))
                    .foregroundStyle(isSelected ? purple : .white.opacity(0.35))
            }
            .padding(13)
            .background(panel, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(isSelected ? purple : .white.opacity(0.07), lineWidth: isSelected ? 1.5 : 1))
        }
        .buttonStyle(.plain)
    }
}
