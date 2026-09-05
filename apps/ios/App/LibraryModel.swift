import Foundation
import Security
import SwiftUI

enum SessionKeychain {
    static let service = "com.guccimane44.vocabularium.session"
    static func token() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ token: String) throws {
        clear()
        let status = SecItemAdd([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as CFDictionary, nil)
        guard status == errSecSuccess else { throw ServiceError("The sign-in token could not be stored securely.") }
    }
    static func clear() { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary) }
}
struct ServiceError: LocalizedError { let message: String; let status: Int?; init(_ message: String, status: Int? = nil) { self.message = message; self.status = status }; var errorDescription: String? { message } }
struct MutationResponse: Decodable { var result: JSONValue; var state: AccountSnapshot }

@MainActor final class LibraryModel: ObservableObject {
    @Published var snapshot: AccountSnapshot?
    @Published var profile: ServiceProfile?
    @Published var message = ""
    @Published var syncing = false
    @Published var pendingCount = 0
    @Published var conflicts: [PendingMutation] = []
    @Published var queue: [String] = []
    init() {
        profile = try? LibraryFiles.read(ServiceProfile.self, name: "profile.json")
        if let p = profile, SessionKeychain.token() != nil {
            let cached = try? LibraryFiles.read(AccountSnapshot.self, name: "snapshot.json")
            if cached?.owner == p.owner { snapshot = cached; queue = cached?.attempts.filter { $0.completedAt == nil }.map(\.id) ?? [] }
        }
    }
    func request<T: Decodable>(_ path: String, payload: [String: JSONValue]? = nil, method: String? = nil, decode: T.Type = T.self) async throws -> T {
        guard let profile, let url = URL(string: profile.url + "/api/" + path) else { throw ServiceError("Set the service address first.") }
        var request = URLRequest(url: url); request.httpMethod = method ?? (payload == nil ? "GET" : "POST"); request.timeoutInterval = 90
        if let token = SessionKeychain.token() { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let payload { request.httpBody = try JSONEncoder().encode(payload); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let object = try? JSONDecoder().decode([String: String].self, from: data)
            throw ServiceError(object?["error"] ?? "The service could not complete this request.", status: (response as? HTTPURLResponse)?.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func configure(url: String) throws {
        guard let components = URLComponents(string: url), let scheme = components.scheme, let host = components.host,
              scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1"].contains(host)) else { throw ServiceError("Use an HTTPS service address, or localhost in the simulator.") }
        var origin = URLComponents(); origin.scheme = scheme; origin.host = host; origin.port = components.port
        guard let base = origin.url?.absoluteString else { throw ServiceError("Invalid service address.") }
        if profile?.url != base { profile = ServiceProfile(url: base, owner: "", deviceId: UUID().uuidString.lowercased(), listId: nil, lists: []) }
    }
    func connect(token: String) async throws {
        try SessionKeychain.save(token)
        let state: AccountSnapshot = try await request("sync")
        profile?.owner = state.owner; try publish(state)
        await sync()
    }
    func publish(_ state: AccountSnapshot) throws {
        guard var p = profile else { return }
        if !p.owner.isEmpty && p.owner != state.owner { throw ServiceError("This session belongs to a different account. Sign out before switching.") }
        p.owner = state.owner; p.listId = state.preferences.defaultListId; p.lists = state.lists.map { ListSummary(id: $0.id, name: $0.name) }
        try LibraryFiles.write(state, name: "snapshot.json"); try LibraryFiles.write(p, name: "profile.json")
        snapshot = state; profile = p
    }
    func sync() async {
        guard !syncing, let p = profile, SessionKeychain.token() != nil else { return }
        syncing = true; defer { syncing = false }
        do {
            var state: AccountSnapshot = try await request("sync")
            guard state.owner == p.owner || p.owner.isEmpty else { throw ServiceError("Account changed. Reconnect before syncing.") }
            let pending = try LibraryFiles.pending(owner: state.owner)
            for item in pending where item.error == nil {
                let data = try JSONEncoder().encode(item.mutation)
                let payload = try JSONDecoder().decode([String: JSONValue].self, from: data)
                do {
                    let result: MutationResponse = try await request("mutations", payload: payload)
                    state = result.state
                    try LibraryFiles.remove(name: "outbox-" + item.id + ".json")
                } catch let error as ServiceError where [400, 404, 409, 422].contains(error.status ?? 0) {
                    var rejected = item; rejected.error = error.localizedDescription
                    try LibraryFiles.save(rejected)
                }
            }
            try publish(state)
            pendingCount = try LibraryFiles.pending(owner: state.owner).count
            conflicts = try LibraryFiles.pending(owner: state.owner).filter { $0.error != nil }
            message = "Synced just now"
            Task {
                let _: JSONValue? = try? await request("jobs/run", payload: [:])
                if let next: AccountSnapshot = try? await request("sync") { try? publish(next) }
            }
        } catch {
            if let service = error as? ServiceError, [401, 410].contains(service.status ?? 0) {
                snapshot = nil; queue = []; SessionKeychain.clear()
                try? LibraryFiles.remove(name: "profile.json"); try? LibraryFiles.remove(name: "snapshot.json")
            }
            message = "Saved on this iPhone. " + error.localizedDescription
            pendingCount = (try? LibraryFiles.pending(owner: p.owner).count) ?? 0
        }
    }
    func mutate(_ type: String, payload: [String: JSONValue]) async throws -> JSONValue? {
        guard let p = profile, !p.owner.isEmpty else { throw ServiceError("Sign in first.") }
        let id = UUID().uuidString.lowercased()
        let mutation = Mutation(id: id, type: type, payload: payload, deviceId: p.deviceId)
        try LibraryFiles.save(PendingMutation(id: id, owner: p.owner, mutation: mutation))
        pendingCount += 1
        // Creation time preserves causal order for offline reveal and rating mutations.
        await sync()
        if let rejected = try LibraryFiles.pending(owner: p.owner).first(where: { $0.id == id }), let error = rejected.error { throw ServiceError(error) }
        return nil
    }
    func capture(_ expression: String, context: String, listId: String, sourceHint: String? = nil) async throws {
        guard let p = profile else { throw ServiceError("Sign in first.") }
        try LibraryFiles.capture(expression, context: context, sourceHint: sourceHint, profile: p, listId: listId); pendingCount += 1; message = "Saved on this iPhone"
        await sync()
    }
    func prepareReview() async throws {
        guard let p = profile else { return }
        let mutation = Mutation(id: UUID().uuidString.lowercased(), type: "prepareReview", payload: [:], deviceId: p.deviceId)
        let value = try JSONDecoder().decode([String: JSONValue].self, from: JSONEncoder().encode(mutation))
        let result: MutationResponse = try await request("mutations", payload: value)
        try publish(result.state); queue = result.state.attempts.filter { $0.completedAt == nil }.map(\.id)
    }
    func reveal(_ attempt: ReviewAttempt) async throws {
        try await mutate("reveal", payload: ["attemptId": .string(attempt.id)])
        if let index = snapshot?.attempts.firstIndex(where: { $0.id == attempt.id }) { snapshot?.attempts[index].revealedAt = ISO8601DateFormatter().string(from: Date()); if let snapshot { try LibraryFiles.write(snapshot, name: "snapshot.json") } }
    }
    func rate(_ attempt: ReviewAttempt, rating: Int) async throws {
        try await mutate("rate", payload: ["attemptId": .string(attempt.id), "rating": .number(Double(rating)), "occurredAt": .string(ISO8601DateFormatter().string(from: Date()))])
        queue.removeAll { $0 == attempt.id }
        if let index = snapshot?.attempts.firstIndex(where: { $0.id == attempt.id }) { snapshot?.attempts[index].completedAt = ISO8601DateFormatter().string(from: Date()); if let snapshot { try LibraryFiles.write(snapshot, name: "snapshot.json") } }
    }
    func signOut() async {
        let _: JSONValue? = try? await request("auth/logout", payload: [:])
        SessionKeychain.clear(); try? LibraryFiles.remove(name: "profile.json"); try? LibraryFiles.remove(name: "snapshot.json")
        profile = nil; snapshot = nil; queue = []; pendingCount = 0
    }
}
