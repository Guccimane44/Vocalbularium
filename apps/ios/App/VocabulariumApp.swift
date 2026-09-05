import SwiftUI
import AuthenticationServices

@main struct VocabulariumApp: App {
    @StateObject private var model = LibraryModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).tint(Color(red: 0.16, green: 0.36, blue: 0.93))
                .task { await model.sync() }
                .onChange(of: phase) { _, next in if next == .active { Task { await model.sync() } } }
        }
    }
}
struct RootView: View {
    @EnvironmentObject var model: LibraryModel
    var body: some View {
        Group {
            if model.snapshot != nil {
                TabView {
                    ReviewView().tabItem { Label("Review", systemImage: "rectangle.stack") }
                    WordlistsView().tabItem { Label("Wordlists", systemImage: "books.vertical") }
                    SettingsView().tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
                }
            } else { SignInView() }
        }
    }
}
struct Inscription: ViewModifier { var size: CGFloat = 36; func body(content: Content) -> some View { content.font(.system(size: size, weight: .regular, design: .serif)) } }
struct SignInView: View {
    @EnvironmentObject var model: LibraryModel
    @State private var service = ""
    @State private var email = ""
    @State private var code = ""
    @State private var challenge = ""
    @State private var deviceToken = ""
    @State private var appleState = ""
    @State private var appleNonce = ""
    @State private var error = ""
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Vocabularium").modifier(Inscription(size: 34))
                    Text("Your vocabulary. Remembered.").font(.title3)
                    Text("Capture a word. Explore its meanings in your languages. Make it part of your world.").foregroundStyle(.secondary)
                }
                Section("Service") {
                    TextField("HTTPS service address", text: $service).textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Use your configured Vocabularium service. The private Sites preview has a separate platform sign-in gate.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Sign in with email") {
                    TextField("Email address", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    if !challenge.isEmpty { TextField("Six-digit code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad) }
                    Button(challenge.isEmpty ? "Email me a code" : "Open my library") { run {
                        try model.configure(url: service)
                        if challenge.isEmpty {
                            let result: JSONValue = try await model.request("auth/email/request", payload: ["email": .string(email)])
                            challenge = result["challengeId"]?.string ?? ""
                        } else {
                            let result: JSONValue = try await model.request("auth/email/verify", payload: ["challengeId": .string(challenge), "code": .string(code), "native": .bool(true)])
                            guard let token = result["token"]?.string else { throw ServiceError("No session was returned.") }
                            try await model.connect(token: token)
                        }
                    }}.disabled(busy)
                }
                Section("Sign in with Apple") {
                    if appleNonce.isEmpty {
                        Button("Prepare Apple sign-in") { run {
                            try model.configure(url: service)
                            let response: JSONValue = try await model.request("auth/apple/start", payload: [:])
                            appleState = response["state"]?.string ?? ""; appleNonce = response["nonce"]?.string ?? ""
                        }}
                    } else {
                        SignInWithAppleButton(.continue) { request in request.requestedScopes = [.email]; request.nonce = appleNonce } onCompletion: { result in
                            run {
                                let auth = try result.get()
                                guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                                      let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8) else { throw ServiceError("Apple returned no identity token.") }
                                let response: JSONValue = try await model.request("auth/apple/native", payload: ["state": .string(appleState), "idToken": .string(idToken)])
                                guard let token = response["token"]?.string else { throw ServiceError("No session was returned.") }
                                try await model.connect(token: token)
                            }
                        }.frame(height: 48)
                    }
                }
                Section("Connect with a device token") {
                    SecureField("Token from the browser app’s settings", text: $deviceToken).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Connect this iPhone") { run { try model.configure(url: service); try await model.connect(token: deviceToken.trimmingCharacters(in: .whitespacesAndNewlines)) } }.disabled(busy)
                }
                if !error.isEmpty { Section { Text(error).foregroundStyle(.red).accessibilityLabel("Error: " + error) } }
            }.navigationTitle("Welcome").onAppear { service = model.profile?.url ?? "" }
        }
    }
    private func run(_ action: @escaping () async throws -> Void) {
        busy = true; error = ""
        Task { do { try await action() } catch { self.error = error.localizedDescription }; busy = false }
    }
}
struct ReviewView: View {
    @EnvironmentObject var model: LibraryModel
    @State private var selectedLanguage = ""
    @State private var busy = false
    @State private var error = ""
    var attempt: ReviewAttempt? { model.snapshot?.attempts.first { $0.id == model.queue.first && $0.completedAt == nil } }
    var card: CardRecord? { model.snapshot?.cards.first { $0.id == attempt?.cardId && $0.deletedAt == nil } }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Text("A LITTLE, EVERY DAY").font(.caption).tracking(2).foregroundStyle(.secondary)
                    Text("Your daily practice.").modifier(Inscription())
                    if let attempt, let card {
                        HStack { Text(languageName(card.sourceLanguage ?? "und")).font(.caption).foregroundStyle(.secondary); Spacer(); Text("Answer in " + languageName(attempt.language)).font(.subheadline).foregroundStyle(.tint) }
                        VStack(spacing: 20) {
                            Text(card.expression).modifier(Inscription(size: 48)).multilineTextAlignment(.center).textSelection(.enabled)
                            Text("\(card.meanings.count) common meanings").font(.footnote).foregroundStyle(.secondary)
                            if !card.context.isEmpty { Text(card.context).italic().foregroundStyle(.secondary) }
                        }.frame(maxWidth: .infinity).padding(.vertical, 28)
                        if attempt.revealedAt != nil {
                            let pages = attempt.preset.pages.filter { $0.language == attempt.language || (($0.role == "essential" || attempt.preset.optionalVisibility == "after") && card.pages[$0.language]?.inventoryId == attempt.inventoryId) }
                            Picker("Answer language", selection: $selectedLanguage) {
                                ForEach(pages) { page in Text(languageName(page.language)).tag(page.language) }
                            }.pickerStyle(.menu)
                            if let page = selectedLanguage == attempt.language ? attempt.page : card.pages[selectedLanguage] { AnswerView(page: page) }
                            Text("How well did you recall the meanings in " + languageName(attempt.language) + "?").font(.subheadline).foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                ForEach(Array(["Again", "Hard", "Good", "Easy"].enumerated()), id: \.offset) { index, label in
                                    Button(label) { perform { try await model.rate(attempt, rating: index + 1) } }.buttonStyle(.bordered).frame(maxWidth: .infinity).disabled(busy)
                                }
                            }
                        } else {
                            Text("Recall the meanings as a whole.").foregroundStyle(.secondary)
                            Button { perform { try await model.reveal(attempt) } } label: { Label("Reveal answer", systemImage: "arrow.right").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large).disabled(busy)
                        }
                    } else {
                        ContentUnavailableView("A little more, remembered.", systemImage: "books.vertical", description: Text("Start a review when your words are ready. Each word has one schedule."))
                        Button("Begin review") { perform { try await model.prepareReview() } }.buttonStyle(.borderedProminent).disabled(busy)
                    }
                    if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(.red) }
                    Text(model.message).font(.footnote).foregroundStyle(.secondary)
                    if model.pendingCount > 0 { Text("\(model.pendingCount) changes saved on this iPhone").font(.footnote) }
                }.padding(24)
            }.navigationTitle("Review").navigationBarTitleDisplayMode(.inline)
                .onChange(of: attempt?.id) { _, _ in selectedLanguage = attempt?.language ?? "" }
                .onAppear { selectedLanguage = attempt?.language ?? "" }
                .refreshable { await model.sync() }
        }
    }
    private func perform(_ action: @escaping () async throws -> Void) { busy = true; Task { do { try await action() } catch { self.error = error.localizedDescription }; busy = false } }
}
struct AnswerView: View {
    let page: Backside
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(Array(page.meanings.enumerated()), id: \.element.id) { index, meaning in
                Divider()
                HStack(alignment: .top, spacing: 18) {
                    Text(String(format: "%02d", index + 1)).font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(meaning.explanation).font(.body).textSelection(.enabled)
                        if let original = meaning.example?.original { Text(original).font(.system(.body, design: .serif)).foregroundStyle(.secondary).textSelection(.enabled) }
                        if let translated = meaning.example?.translated { Text(translated).font(.system(.body, design: .serif)).foregroundStyle(.secondary).textSelection(.enabled) }
                    }
                }
            }
        }.environment(\.layoutDirection, ["ar", "he", "fa", "ur"].contains(String(page.language.prefix(2))) ? .rightToLeft : .leftToRight)
    }
}
struct WordlistsView: View {
    @EnvironmentObject var model: LibraryModel
    @State private var showCapture = false
    @State private var showList = false
    @State private var search = ""
    var body: some View {
        NavigationStack {
            List {
                ForEach(model.snapshot?.lists ?? []) { list in
                    Section(list.name) {
                        NavigationLink("Wordlist preset") { PresetView(existing: list) }
                        ForEach(model.snapshot?.cards.filter { $0.listId == list.id && $0.deletedAt == nil && (search.isEmpty || $0.expression.localizedCaseInsensitiveContains(search)) } ?? []) { card in
                            NavigationLink { WordDetailView(cardId: card.id) } label: {
                                HStack { Text(card.expression).font(.system(.title3, design: .serif)); Spacer(); Text(card.status == "ready" ? languageName(card.sourceLanguage ?? "und") : card.status).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                if model.snapshot?.lists.isEmpty == true { ContentUnavailableView("Your words will live here.", systemImage: "books.vertical", description: Text("Create a wordlist and choose your answer languages.")) }
            }.navigationTitle("Wordlists").searchable(text: $search).refreshable { await model.sync() }
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("New wordlist") { showList = true } }; ToolbarItem(placement: .topBarTrailing) { Button { showCapture = true } label: { Image(systemName: "plus") }.disabled(model.snapshot?.lists.isEmpty != false) } }
                .sheet(isPresented: $showCapture) { CaptureView() }
                .sheet(isPresented: $showList) { NavigationStack { PresetView() } }
        }
    }
}
struct CaptureView: View {
    @EnvironmentObject var model: LibraryModel
    @Environment(\.dismiss) var dismiss
    @State private var expression = ""
    @State private var context = ""
    @State private var listId = ""
    @State private var sourceHint = ""
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Word or short expression") {
                    TextField("A word worth remembering", text: $expression, axis: .vertical).textInputAutocapitalization(.never)
                    PasteButton(payloadType: String.self) { values in expression = values.first ?? "" }
                }
                Section("Save to") { Picker("Wordlist", selection: $listId) { ForEach(model.snapshot?.lists ?? []) { list in Text(list.name).tag(list.id) } } }
                Section("Source language") { Picker("Language", selection: $sourceHint) { Text("Detect automatically").tag(""); ForEach(availableLanguages, id: \.self) { Text(languageName($0)).tag($0) } } }
                Section("Context (optional)") { TextField("The sentence where you found it", text: $context, axis: .vertical).lineLimit(3...5) }
                Section { Text("Each language page uses one generation. \(model.snapshot?.available ?? 0) remain.").font(.footnote).foregroundStyle(.secondary); Text("Saved on this iPhone before upload. Open the app while connected to complete synchronization.").font(.footnote).foregroundStyle(.secondary) }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }.navigationTitle("Add a word").navigationBarTitleDisplayMode(.inline).toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Add") { Task { do { try await model.capture(expression, context: context, listId: listId, sourceHint: sourceHint.isEmpty ? nil : sourceHint); dismiss() } catch { self.error = error.localizedDescription } } }.disabled(expression.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || expression.count > 120 || listId.isEmpty) }
            }.onAppear { listId = model.snapshot?.preferences.defaultListId ?? model.snapshot?.lists.first?.id ?? "" }
        }
    }
}
struct PresetView: View {
    @EnvironmentObject var model: LibraryModel
    @Environment(\.dismiss) var dismiss
    var existing: Wordlist?
    @State private var name = ""
    @State private var preset = Preset(pages: [])
    @State private var language = ""
    @State private var error = ""
    var body: some View {
        Form {
            Section("Wordlist") { TextField("Name", text: $name) }
            ForEach($preset.pages) { $page in
                Section(languageName(page.language)) {
                    Toggle("Essential answer", isOn: Binding(get: { page.role == "essential" }, set: { page.role = $0 ? "essential" : "optional" }))
                    LabeledContent("Explanation", value: "Always on")
                    Toggle("One example per meaning", isOn: $page.examples)
                    Button("Remove language", role: .destructive) { preset.pages.removeAll { $0.language == page.language } }
                }
            }
            Section("Add an answer language") {
                Picker("Language", selection: $language) { Text("Choose a language").tag(""); ForEach(availableLanguages.filter { tag in !preset.pages.contains { $0.language == tag } }, id: \.self) { Text(languageName($0)).tag($0) } }
                Button("Add language") { preset.pages.append(PageSpec(language: language, role: preset.pages.isEmpty ? "essential" : "optional")); language = "" }.disabled(language.isEmpty || preset.pages.count >= 6)
            }
            Section("Examples & review") {
                Picker("Example presentation", selection: $preset.examplePolicy) { Text("Original + translated").tag("both"); Text("Original only").tag("original"); Text("Answer language only").tag("translated") }
                Picker("Optional pages", selection: $preset.optionalVisibility) { Text("After reveal").tag("after"); Text("Hidden in review").tag("hidden") }
                Text("At least one language must be Essential. Changes apply to new captures; regenerate existing pages explicitly to apply a changed preset.").font(.footnote).foregroundStyle(.secondary)
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            Button("Save wordlist") { Task {
                do {
                    let value = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(preset))
                    var payload: [String: JSONValue] = ["name": .string(name), "preset": value]
                    if let existing { payload["id"] = .string(existing.id); payload["baseRevision"] = .number(Double(existing.revision)) }
                    try await model.mutate(existing == nil ? "createList" : "updateList", payload: payload); dismiss()
                } catch { self.error = error.localizedDescription }
            }}.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || !preset.pages.contains { $0.role == "essential" })
        }.navigationTitle(existing == nil ? "New wordlist" : "Wordlist preset").onAppear { if let existing { name = existing.name; preset = existing.preset } }
    }
}
struct WordDetailView: View {
    @EnvironmentObject var model: LibraryModel
    let cardId: String
    @State private var language = ""
    @State private var showDelete = false
    @State private var showRegenerate = false
    var card: CardRecord? { model.snapshot?.cards.first { $0.id == cardId && $0.deletedAt == nil } }
    var body: some View {
        ScrollView {
            if let card {
                VStack(alignment: .leading, spacing: 24) {
                    Text(card.expression).modifier(Inscription(size: 44)).textSelection(.enabled)
                    Text(languageName(card.sourceLanguage ?? "und")).foregroundStyle(.secondary)
                    if let error = card.error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    Picker("Language", selection: $language) { ForEach(card.preset.pages) { Text(languageName($0.language)).tag($0.language) } }
                    if let page = card.pages[language] { AnswerView(page: page) } else { Text("This page is not ready.").foregroundStyle(.secondary) }
                    if card.status != "queued" { Button("Retry missing pages") { Task { try? await model.mutate("retry", payload: ["cardId": .string(card.id)]) } } }
                    ForEach((card.alternatives ?? []).filter { model.snapshot?.preferences.interestingLanguages.contains($0.language) == true }, id: \.language) { alternative in
                        if let preview = alternative.previews[language] {
                            DisclosureGroup("Also a word in " + languageName(alternative.language)) {
                                Text(preview)
                                Button("Learn as a separate word · \(card.preset.pages.count) generations") { Task { try? await model.capture(card.expression, context: card.context, listId: card.listId, sourceHint: alternative.language) } }
                            }
                        }
                    }
                    Button("Regenerate using current preset") { showRegenerate = true }.disabled(card.status == "queued")
                    Text("\(card.reviewRevision) reviews · one schedule").font(.footnote).foregroundStyle(.secondary)
                    Button("Delete word", role: .destructive) { showDelete = true }
                }.padding(24)
            }
        }.navigationTitle("Word").navigationBarTitleDisplayMode(.inline).onAppear { language = card?.preset.pages.first?.language ?? "" }
            .confirmationDialog("Delete this word from your library?", isPresented: $showDelete) { Button("Delete", role: .destructive) { Task { try? await model.mutate("deleteCard", payload: ["cardId": .string(cardId)]) } } }
            .confirmationDialog("Regenerate these pages? Each successfully completed language page uses one generation; your schedule is preserved.", isPresented: $showRegenerate) { Button("Regenerate") { Task { try? await model.mutate("regenerate", payload: ["cardId": .string(cardId)]) } } }
    }
}
struct SettingsView: View {
    @EnvironmentObject var model: LibraryModel
    @State private var interest = ""
    @State private var exportURL: URL?
    @State private var showDelete = false
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                if let state = model.snapshot {
                    Section("Your account") { Text(state.email); if state.mode == "preview" { Text("Private preview · sample generation").foregroundStyle(.secondary) } }
                    Section("Generation allowance") { Text("\(state.available) of 100 remaining").font(.system(.title2, design: .serif)); Text("One-time allowance. Each completed language page uses one generation. Reviews remain available.").font(.footnote).foregroundStyle(.secondary) }
                    Section("Interesting languages") {
                        ForEach(state.preferences.interestingLanguages, id: \.self) { tag in
                            HStack { Text(languageName(tag)); Spacer(); Button("Remove") { updateInterests(state.preferences.interestingLanguages.filter { $0 != tag }) } }
                        }
                        Picker("Add language", selection: $interest) { Text("Choose").tag(""); ForEach(availableLanguages.filter { !state.preferences.interestingLanguages.contains($0) }, id: \.self) { Text(languageName($0)).tag($0) } }
                        Button("Add interest") { updateInterests(state.preferences.interestingLanguages + [interest]); interest = "" }.disabled(interest.isEmpty)
                        Text("These languages filter alternative-word notes. They do not change your answer languages.").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Sync") { Text(model.message).font(.footnote); Text("\(model.pendingCount) pending changes"); Button("Sync now") { Task { await model.sync() } }.disabled(model.syncing); ForEach(model.conflicts) { Text($0.error ?? "").foregroundStyle(.red) } }
                    Section {
                        Button("Export library") { Task { do { let export: JSONValue = try await model.request("account/export"); let url = FileManager.default.temporaryDirectory.appendingPathComponent("vocabularium-export.json"); try JSONEncoder().encode(export).write(to: url, options: .atomic); exportURL = url } catch { self.error = error.localizedDescription } } }
                        if let exportURL { ShareLink(item: exportURL) }
                        Button("Delete account", role: .destructive) { showDelete = true }
                        Button("Sign out", role: .destructive) { Task { await model.signOut() } }
                        if !error.isEmpty { Text(error).foregroundStyle(.red) }
                    }
                }
            }.navigationTitle("Settings")
                .confirmationDialog("Permanently delete your account, words, and learning history? Export your library first if you want a copy.", isPresented: $showDelete) {
                    Button("Delete account", role: .destructive) { Task { do { let _: JSONValue = try await model.request("account", method: "DELETE"); await model.signOut() } catch { self.error = error.localizedDescription } } }
                }
        }
    }
    private func updateInterests(_ interests: [String]) {
        guard let state = model.snapshot else { return }
        Task { do { var prefs = state.preferences; prefs.interestingLanguages = interests; let value = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(prefs)); try await model.mutate("preferences", payload: ["baseRevision": .number(Double(state.revision)), "preferences": value]) } catch { self.error = error.localizedDescription } }
    }
}
