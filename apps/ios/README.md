# iOS app and share extension

Source targets iOS 17 or later and uses SwiftUI, AuthenticationServices, Keychain, and an App Group directory. XcodeGen creates the project from `project.yml`.

## Build setup

1. Install full Xcode and choose its developer directory. Command Line Tools alone cannot compile iOS targets.
2. Install XcodeGen from its official distribution, then run `xcodegen generate` in this directory.
3. Open `Vocabularium.xcodeproj`, choose your development team, and provision the app and share-extension targets.
4. Keep the App Group identical in both entitlements and `LibraryFiles.group`: `group.com.guccimane44.vocabularium`. Adjust bundle/group identifiers consistently if your Apple account requires a different namespace.
5. Enable Sign in with Apple on the app identity and configure the server audiences/return URL.
6. Run the Vocabularium scheme on a simulator and physical iPhone.

## Local and live connections

The app can use configured email codes, native Sign in with Apple, or a device token created by the browser app. Enter an HTTPS service origin. The simulator may use `http://localhost:3000` for a local server; platform preview cookies are a separate gate, so this alone does not establish a working private Sites connection. Use the configured application-auth endpoint for complete device testing.

## Durability and capture

The share extension accepts plain text. URL-only sharing offers a text/paste fallback instead of generating a card from a URL. The default list is configurable and the share sheet can choose another cached list. Every capture is written atomically to an individual App Group outbox file before the extension closes. It explicitly says **saved on this iPhone; open app to sync**.

The main app validates the session owner before uploading, keeps tokens in Keychain, and retains pending items for their original account. Reveal/rating mutations can be queued for already-prepared review attempts; the server remains the authoritative FSRS implementation. A service interruption must not silently erase the outbox.

## Verification status

Swift parser checks passed. **No iOS SDK compilation, simulator launch, signing, Apple sign-in, accessibility inspection, or real share-sheet test has been performed**, because full Xcode is unavailable on this machine. Source-level checks do not establish a working native binary. See the repository implementation-status document for remaining parity and integration work.
