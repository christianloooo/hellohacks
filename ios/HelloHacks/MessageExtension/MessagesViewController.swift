import SwiftUI
import UIKit
import Messages

final class MessagesViewController: MSMessagesAppViewController {
    private var host: UIHostingController<HuddleExtensionView>?

    private var apiBaseURL: URL {
        URL(string: Bundle.main.object(forInfoDictionaryKey: "HUDDLE_API_BASE_URL") as? String ?? "http://localhost:3001")!
    }

    private var webBaseURL: URL {
        URL(string: Bundle.main.object(forInfoDictionaryKey: "HUDDLE_WEB_BASE_URL") as? String ?? "http://localhost:5173")!
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        showExtension()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        showExtension()
    }

    private func showExtension() {
        if let host {
            host.willMove(toParent: nil)
            host.view.removeFromSuperview()
            host.removeFromParent()
        }

        let codeFromMessage = activeConversation?.selectedMessage?.url.flatMap { url in
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
                .first(where: { $0.name == "session" })?.value
        }
        let rememberedCode = UserDefaults.standard.string(forKey: "huddle.lastSessionCode")

        let rootView = HuddleExtensionView(
            initialCode: codeFromMessage ?? rememberedCode ?? "",
            onCreateSession: { [weak self] in
                guard let self else { throw HuddleAPIError.message("HUDDLE is unavailable. Close and reopen the extension.") }
                let invite = try await HuddleAPI.createInvite(at: self.apiBaseURL)
                UserDefaults.standard.set(invite.sessionId, forKey: "huddle.lastSessionCode")
                self.shareInvite(invite)
                let session = try await HuddleAPI.loadSession(invite.sessionId, at: self.apiBaseURL)
                return session
            },
            onLoadSession: { [weak self] code in
                guard let self else { throw HuddleAPIError.message("HUDDLE is unavailable. Close and reopen the extension.") }
                let session = try await HuddleAPI.loadSession(code, at: self.apiBaseURL)
                UserDefaults.standard.set(session.sessionId, forKey: "huddle.lastSessionCode")
                return session
            },
            onGenerateIdeas: { [weak self] code in
                guard let self else { throw HuddleAPIError.message("HUDDLE is unavailable. Close and reopen the extension.") }
                let session = try await HuddleAPI.generateIdeas(for: code, at: self.apiBaseURL)
                UserDefaults.standard.set(session.sessionId, forKey: "huddle.lastSessionCode")
                return session
            },
            onSharePlan: { [weak self] code, plan in self?.share(plan, for: code) }
        )

        let controller = UIHostingController(rootView: rootView)
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

    private func shareInvite(_ invite: HuddleInvite) {
        guard let conversation = activeConversation else { return }
        let message = MSMessage()
        let layout = MSMessageTemplateLayout()
        layout.caption = "HUDDLE · Plan with your group"
        layout.subcaption = "Open the invite to add preferences"
        message.url = invite.inviteURL
        message.layout = layout
        conversation.insert(message) { error in
            if let error { print("Could not share HUDDLE invite: \(error.localizedDescription)") }
        }
    }

    private func share(_ plan: HuddlePlan, for code: String) {
        guard let conversation = activeConversation else { return }
        let message = MSMessage()
        let layout = MSMessageTemplateLayout()
        layout.caption = "HUDDLE · \(plan.title)"
        layout.subcaption = "\(plan.time) · about $\(plan.price) per person"
        message.url = sessionURL(code)
        message.layout = layout
        conversation.insert(message) { error in
            if let error { print("Could not share HUDDLE plan: \(error.localizedDescription)") }
        }
    }
    private func sessionURL(_ id: String) -> URL? {
        var components = URLComponents(url: webBaseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "session", value: id)]
        return components?.url
    }
}

private struct HuddleExtensionView: View {
    let initialCode: String
    let onCreateSession: () async throws -> HuddleSession
    let onLoadSession: (String) async throws -> HuddleSession
    let onGenerateIdeas: (String) async throws -> HuddleSession
    let onSharePlan: (String, HuddlePlan) -> Void

    @State private var code = ""
    @State private var session: HuddleSession?
    @State private var selectedPlanID: Int?
    @State private var busy = false
    @State private var errorMessage: String?

    private let ink = Color.white
    private let pencil = Color(red: 0.20, green: 0.18, blue: 0.17)
    private let panel = Color(red: 1.0, green: 0.96, blue: 0.89)
    private let coral = Color(red: 0.71, green: 0.24, blue: 0.27)
    private let peach = Color(red: 0.97, green: 0.42, blue: 0.43)

    private var selectedPlan: HuddlePlan? {
        session?.plans.first(where: { $0.id == selectedPlanID }) ?? session?.plans.first
    }

    var body: some View {
        ZStack {
            ink.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header

                    if let session {
                        sessionView(session)
                    } else {
                        welcomeView
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(red: 0.48, green: 0.27, blue: 0.08))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(16)
            }
        }
        .foregroundStyle(pencil)
        .preferredColorScheme(.light)
        .task {
            guard !initialCode.isEmpty, session == nil else { return }
            code = initialCode
            await loadSession()
        }
        .task(id: session?.sessionId) {
            guard let sessionID = session?.sessionId else { return }
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: 4_000_000_000)
                    let updated = try await onLoadSession(sessionID)
                    guard !Task.isCancelled else { return }
                    session = updated
                } catch is CancellationError { return }
                catch { errorMessage = error.localizedDescription }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(coral)
                .frame(width: 38, height: 38)
                .background(coral.opacity(0.16), in: Circle())
            Text("HUDDLE").font(.custom("ChalkboardSE-Bold", size: 24)).foregroundStyle(coral).tracking(1)
            Spacer()
            Text("GROUP PLANNER")
                .font(.system(size: 9, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(pencil.opacity(0.45))
        }
    }

    private var welcomeView: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 8) {
                Image("huddle-friends")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 155)
                    .accessibilityLabel("The hand-drawn HUDDLE crew")
                Text("Plan it right here")
                    .font(.custom("ChalkboardSE-Bold", size: 25))
                Text("Set up preferences on the HUDDLE website. Come back here to generate and share ideas in your chat.")
                    .font(.system(size: 12))
                    .foregroundStyle(pencil.opacity(0.64))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            TextField("Paste group invite link or session ID", text: $code)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(13)
                .background(panel, in: RoundedRectangle(cornerRadius: 12))

            actionButton("Open this group", icon: "arrow.right.circle", disabled: code.trimmingCharacters(in: .whitespaces).isEmpty) {
                await loadSession()
            }

            Button {
                Task { await createSession() }
            } label: {
                Label("Start a Huddle", systemImage: "plus.message")
                    .font(.system(size: 14, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(panel, in: Capsule())
                    .foregroundStyle(pencil)
            }
            .buttonStyle(.plain)
            .disabled(busy)

            Text("Starting a Huddle shares its website invite. Everyone submits their own preferences there; idea generation happens here in Messages.")
                .font(.system(size: 10))
                .foregroundStyle(pencil.opacity(0.42))
                .lineSpacing(3)
        }
    }

    private func sessionView(_ session: HuddleSession) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("YOUR GROUP")
                        .font(.system(size: 9, weight: .bold)).tracking(1.1)
                        .foregroundStyle(pencil.opacity(0.5))
                    Text("\(session.responseCount) \(session.responseCount == 1 ? "response" : "responses")")
                        .font(.system(size: 13, weight: .semibold))
                    Text("\(session.participantCount) joined · \(session.responseCount) ready")
                        .font(.system(size: 10))
                        .foregroundStyle(pencil.opacity(0.5))
                }
                Spacer()
                Button("Change") { self.session = nil; errorMessage = nil }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(coral)
            }

            if session.plans.isEmpty {
                Text(session.generationStatus == "generating" ? "Checking shared availability and generating activities…" : "Ideas generate once everyone who joined saves preferences and availability on the website.")
                    .font(.system(size: 12))
                    .foregroundStyle(pencil.opacity(0.62))
                if let warning = session.warning, !warning.isEmpty {
                    Text(warning).font(.system(size: 10)).foregroundStyle(Color(red: 0.48, green: 0.27, blue: 0.08))
                }
                actionButton("Generate ideas", icon: "sparkles", disabled: session.generationStatus == "generating") {
                    await generateIdeas()
                }
            } else {
                Text("PICK AN IDEA TO SHARE")
                    .font(.system(size: 9, weight: .bold)).tracking(1.1)
                    .foregroundStyle(pencil.opacity(0.48))

                ForEach(session.plans) { plan in
                    planCard(plan)
                }

                if let warning = session.warning, !warning.isEmpty {
                    Text(warning).font(.system(size: 10)).foregroundStyle(Color(red: 0.48, green: 0.27, blue: 0.08))
                }

                actionButton("Share selected plan", icon: "paperplane.fill", disabled: selectedPlan == nil) {
                    guard let selectedPlan else { return }
                    onSharePlan(session.sessionId, selectedPlan)
                }

                Button {
                    Task { await generateIdeas() }
                } label: {
                    Label(busy ? "Regenerating…" : "Regenerate ideas", systemImage: "arrow.clockwise")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(pencil.opacity(0.6))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
    }

    private func planCard(_ plan: HuddlePlan) -> some View {
        let isSelected = selectedPlan?.id == plan.id
        return Button { selectedPlanID = plan.id } label: {
            HStack(alignment: .top, spacing: 10) {
                Text(plan.emoji).font(.system(size: 23))
                VStack(alignment: .leading, spacing: 5) {
                    Text(plan.title).font(.system(size: 13, weight: .bold)).foregroundStyle(pencil)
                    Text("\(plan.time) · about $\(plan.price)/person")
                        .font(.system(size: 10)).foregroundStyle(pencil.opacity(0.59))
                    Text(plan.detail).font(.system(size: 10)).foregroundStyle(pencil.opacity(0.72)).fixedSize(horizontal: false, vertical: true)
                    Text(plan.rationale).font(.system(size: 9)).foregroundStyle(coral.opacity(0.95)).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? coral : pencil.opacity(0.32))
            }
            .padding(12)
            .background(panel, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(isSelected ? coral : pencil.opacity(0.07), lineWidth: isSelected ? 1.5 : 1))
        }
        .buttonStyle(.plain)
    }

    private func actionButton(_ title: String, icon: String, disabled: Bool = false, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Label(busy ? "Working…" : title, systemImage: busy ? "hourglass" : icon)
                .font(.system(size: 14, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(peach, in: RoundedRectangle(cornerRadius: 15))
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(pencil, lineWidth: 1.5))
                .foregroundStyle(pencil)
        }
        .buttonStyle(.plain)
        .disabled(busy || disabled)
        .opacity(busy || disabled ? 0.55 : 1)
    }

    @MainActor
    private func createSession() async {
        await perform {
            let created = try await onCreateSession()
            code = created.sessionId
            session = created
        }
    }

    @MainActor
    private func loadSession() async {
        let normalized = sessionID(from: code)
        guard !normalized.isEmpty else { return }
        await perform {
            let loaded = try await onLoadSession(normalized)
            code = loaded.sessionId
            session = loaded
            selectedPlanID = loaded.plans.first?.id
        }
    }

    @MainActor
    private func generateIdeas() async {
        guard let session else { return }
        await perform {
            let updated = try await onGenerateIdeas(session.sessionId)
            self.session = updated
            selectedPlanID = updated.plans.first?.id
        }
    }

    @MainActor
    private func perform(_ operation: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do { try await operation() }
        catch { errorMessage = error.localizedDescription }
    }

    private func sessionID(from input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "session" })?.value {
            return value
        }
        return trimmed
    }
}

private struct HuddleSession: Decodable {
    let sessionId: String
    let responseCount: Int
    let participantCount: Int
    let plans: [HuddlePlan]
    let planMode: String?
    let warning: String?
    let generationStatus: String?
}

private struct HuddleInvite: Decodable {
    let sessionId: String
    let inviteUrl: String

    var inviteURL: URL? { URL(string: inviteUrl) }
}

private struct HuddlePlan: Decodable, Identifiable {
    let id: Int
    let emoji: String
    let title: String
    let detail: String
    let time: String
    let price: Int
    let matchCount: Int
    let participantCount: Int
    let location: String
    let rationale: String
}

private enum HuddleAPIError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        if case let .message(message) = self { return message }
        return nil
    }
}

private enum HuddleAPI {
    static func createInvite(at baseURL: URL) async throws -> HuddleInvite {
        try await request("/api/sessions/invite", method: "POST", body: "{}", at: baseURL)
    }

    static func loadSession(_ code: String, at baseURL: URL) async throws -> HuddleSession {
        try await request("/api/extension/sessions/\(code)", method: "GET", at: baseURL)
    }

    static func generateIdeas(for code: String, at baseURL: URL) async throws -> HuddleSession {
        try await request("/api/extension/sessions/\(code)/plans", method: "POST", body: "{}", at: baseURL)
    }

    private static func request<T: Decodable>(_ path: String, method: String, body: String? = nil, at baseURL: URL) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw HuddleAPIError.message("The HUDDLE API address is invalid. Set HUDDLE_API_BASE_URL in the extension Info.plist.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body?.data(using: .utf8)

        let (data, response): (Data, URLResponse)
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch {
            throw HuddleAPIError.message("Can’t reach the HUDDLE server. Start the backend and check HUDDLE_API_BASE_URL in the extension settings.")
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HuddleAPIError.message("The HUDDLE server returned an invalid response.")
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw HuddleAPIError.message(payload?["error"] as? String ?? "HUDDLE server error (HTTP \(httpResponse.statusCode)).")
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw HuddleAPIError.message("The server response didn’t match HUDDLE’s format. Update the backend and try again.") }
    }
}
