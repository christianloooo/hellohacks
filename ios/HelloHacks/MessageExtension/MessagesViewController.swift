import SwiftUI
import UIKit
import Messages

final class MessagesViewController: MSMessagesAppViewController {
    private var host: UIHostingController<ExtensionGameView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        showGame()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        showGame()
    }

    private func showGame() {
        if let host {
            host.willMove(toParent: nil)
            host.view.removeFromSuperview()
            host.removeFromParent()
            self.host = nil
        }
        let components = activeConversation?.selectedMessage?.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        let board = components?.queryItems?.first(where: { $0.name == "board" })?.value
        let turn = components?.queryItems?.first(where: { $0.name == "turn" })?.value
        let game = ExtensionGameView(initialBoard: board, initialTurn: turn ?? "X") { [weak self] board, nextTurn in
            guard let conversation = self?.activeConversation else { return }
            let message = MSMessage()
            let layout = MSMessageTemplateLayout()
            layout.caption = "HelloHacks tic-tac-toe"
            layout.subcaption = "\(nextTurn)'s turn · \(board)"
            var components = URLComponents()
            components.scheme = "hellohacks"
            components.host = "game"
            components.queryItems = [URLQueryItem(name: "board", value: board), URLQueryItem(name: "turn", value: nextTurn)]
            message.url = components.url
            message.layout = layout
            conversation.insert(message) { error in
                if let error { print("Could not insert game move: \(error)") }
            }
        }
        let controller = UIHostingController(rootView: game)
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

private struct ExtensionGameView: View {
    let onShare: (String, String) -> Void
    @State private var squares: [String]
    @State private var mark: String
    @State private var result: String?

    init(initialBoard: String?, initialTurn: String, onShare: @escaping (String, String) -> Void) {
        let restoredBoard: [String]
        if let initialBoard {
            let parsed = Array(initialBoard).map { $0 == "-" ? "" : String($0) }
            restoredBoard = parsed.count == 9 ? parsed : Array(repeating: "", count: 9)
        } else {
            restoredBoard = Array(repeating: "", count: 9)
        }
        _squares = State(initialValue: restoredBoard)
        _mark = State(initialValue: initialTurn == "O" ? "O" : "X")
        self.onShare = onShare
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
    private let wins = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]]

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("TIC-TAC-TOE").font(.caption.bold()).tracking(1.5).foregroundStyle(.indigo)
                    Text(result ?? "Your turn · \(mark)").font(.title2.bold())
                }
                Spacer()
                Button("Reset", systemImage: "arrow.counterclockwise", action: reset)
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Reset game")
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(0..<9, id: \.self) { index in
                    Button { play(at: index) } label: {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(uiColor: .secondarySystemBackground))
                            .frame(height: 76)
                            .overlay(Text(squares[index]).font(.system(size: 34, weight: .bold)).foregroundStyle(squares[index] == "X" ? .indigo : .pink))
                    }
                    .buttonStyle(.plain)
                    .disabled(!squares[index].isEmpty || result != nil)
                }
            }
            Button(action: share) {
                Label("Send move in iMessage", systemImage: "paperplane.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(.indigo, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
            }
            Text("Take turns in the conversation. Each move appears as a game card.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(18)
        .background(Color(uiColor: .systemBackground))
    }

    private func play(at index: Int) {
        guard squares[index].isEmpty, result == nil else { return }
        squares[index] = mark
        if wins.contains(where: { line in line.allSatisfy { squares[$0] == mark } }) {
            result = "\(mark) wins!"
        } else if !squares.contains("") {
            result = "It's a draw"
        } else {
            mark = mark == "X" ? "O" : "X"
        }
    }

    private func share() {
        let board = squares.map { $0.isEmpty ? "-" : $0 }.joined()
        onShare(board, mark)
    }

    private func reset() {
        squares = Array(repeating: "", count: 9)
        mark = "X"
        result = nil
    }
}
