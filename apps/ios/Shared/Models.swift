import Foundation

enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    subscript(key: String) -> JSONValue? { if case .object(let v) = self { return v[key] }; return nil }
}
struct PageSpec: Codable, Identifiable {
    var language: String
    var role: String = "essential"
    var explanation = true
    var examples = true
    var id: String { language }
}
struct Preset: Codable {
    var pages: [PageSpec]
    var examplePolicy = "both"
    var optionalVisibility = "after"
}
struct Wordlist: Codable, Identifiable { var id: String; var name: String; var revision: Int; var preset: Preset }
struct Example: Codable { var original: String?; var translated: String? }
struct MeaningContent: Codable, Identifiable {
    var meaningId: String; var explanation: String; var example: Example?
    var id: String { meaningId }
}
struct Backside: Codable, Identifiable { var id: String; var language: String; var inventoryId: String; var meanings: [MeaningContent]; var provider: String }
struct Meaning: Codable, Identifiable { var id: String; var gloss: String; var partOfSpeech: String }
struct Alternative: Codable { var language: String; var previews: [String: String] }
struct CardRecord: Codable, Identifiable {
    var id: String; var listId: String; var expression: String; var sourceLanguage: String?
    var inferred: Bool; var context: String; var status: String; var error: String?
    var inventoryId: String; var meanings: [Meaning]; var pages: [String: Backside]
    var alternatives: [Alternative]?; var preset: Preset; var schedule: [String: JSONValue]; var reviewRevision: Int; var deletedAt: String?
    var ready: Bool { deletedAt == nil && !meanings.isEmpty && preset.pages.filter { $0.role == "essential" }.allSatisfy { pages[$0.language]?.inventoryId == inventoryId } }
}
struct ReviewAttempt: Codable, Identifiable {
    var id: String; var cardId: String; var language: String; var baseRevision: Int; var inventoryId: String
    var page: Backside; var preset: Preset; var createdAt: String; var completedAt: String?; var revealedAt: String?
}
struct Preferences: Codable {
    var interestingLanguages: [String]; var defaultListId: String?; var newCardsPerDay: Int; var timeZone: String
}
struct AccountSnapshot: Codable {
    var owner: String; var email: String; var mode: String; var revision: Int; var available: Int
    var preferences: Preferences; var lists: [Wordlist]; var cards: [CardRecord]; var attempts: [ReviewAttempt]
}
struct Mutation: Codable { var id: String; var type: String; var payload: [String: JSONValue]; var deviceId: String }
struct PendingMutation: Codable, Identifiable { var id: String; var owner: String; var mutation: Mutation; var error: String?; var createdAt: Double = Date().timeIntervalSince1970 }
struct ListSummary: Codable, Identifiable { var id: String; var name: String }
struct ServiceProfile: Codable {
    var url: String; var owner: String; var deviceId: String; var listId: String?; var lists: [ListSummary]
}
enum LibraryFiles {
    static let group = "group.com.guccimane44.vocabularium"
    static func root() throws -> URL {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "Vocabularium", code: 1, userInfo: [NSLocalizedDescriptionKey: "The shared app container is unavailable. Check App Group signing."])
        }
        return url
    }
    static func write<T: Encodable>(_ value: T, name: String) throws {
        let target = try root().appendingPathComponent(name)
        try JSONEncoder().encode(value).write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func read<T: Decodable>(_ type: T.Type, name: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(contentsOf: root().appendingPathComponent(name)))
    }
    static func pending(owner: String) throws -> [PendingMutation] {
        try FileManager.default.contentsOfDirectory(at: root(), includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("outbox-") }
            .compactMap { try? JSONDecoder().decode(PendingMutation.self, from: Data(contentsOf: $0)) }
            .filter { $0.owner == owner }
            .sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
    }
    static func save(_ pending: PendingMutation) throws { try write(pending, name: "outbox-" + pending.id + ".json") }
    static func remove(name: String) throws {
        let file = try root().appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    static func capture(_ expression: String, context: String = "", sourceURL: String = "", sourceHint: String? = nil, profile: ServiceProfile, listId: String) throws {
        let text = expression.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty && text.count <= 120 else {
            throw NSError(domain: "Vocabularium", code: 2, userInfo: [NSLocalizedDescriptionKey: "Choose a word or short expression of at most 120 characters."])
        }
        let id = UUID().uuidString.lowercased()
        let mutation = Mutation(id: id, type: "capture", payload: ["expression": .string(text), "listId": .string(listId), "context": .string(context), "sourceUrl": .string(sourceURL), "sourceHint": sourceHint.map(JSONValue.string) ?? .null], deviceId: profile.deviceId)
        try save(PendingMutation(id: id, owner: profile.owner, mutation: mutation))
    }
}
func languageName(_ tag: String) -> String { Locale(identifier: "en").localizedString(forIdentifier: tag) ?? tag }
let availableLanguages = ["en", "de", "fr", "es", "it", "pt", "nl", "ja", "zh-Hans", "zh-Hant", "ar", "ko", "ru", "pl", "uk", "tr", "el", "la", "he", "hi", "sv", "da", "no", "fi", "vi", "th", "id", "tl"]
