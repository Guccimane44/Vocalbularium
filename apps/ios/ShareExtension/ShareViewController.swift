import UIKit
import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    private var profile: ServiceProfile?
    private var listId: String?
    private var sourceURL = ""
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Vocabularium"
        profile = try? LibraryFiles.read(ServiceProfile.self, name: "profile.json")
        listId = profile?.listId
        placeholder = "A word worth remembering"
        navigationController?.navigationBar.tintColor = UIColor(red: 0.16, green: 0.36, blue: 0.93, alpha: 1)
        for item in extensionContext?.inputItems as? [NSExtensionItem] ?? [] {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] value, _ in
                        let text = (value as? String) ?? (value as? NSAttributedString)?.string
                        DispatchQueue.main.async { if let text { self?.textView.text = text }; self?.validateContent() }
                    }
                    return
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] value, _ in
                        DispatchQueue.main.async {
                            self?.sourceURL = (value as? URL)?.absoluteString ?? ""
                            self?.textView.text = ""
                            self?.placeholder = "This app shared a link. Paste or type the word you want to save."
                            self?.validateContent()
                        }
                    }
                }
            }
        }
        validateContent()
    }
    override func isContentValid() -> Bool {
        let text = contentText.trimmingCharacters(in: .whitespacesAndNewlines)
        charactersRemaining = NSNumber(value: 120 - text.count)
        return !text.isEmpty && text.count <= 120 && profile?.owner.isEmpty == false && listId != nil
    }
    override func configurationItems() -> [Any]! {
        let item = SLComposeSheetConfigurationItem()
        item?.title = "Wordlist"
        item?.value = profile?.lists.first { $0.id == listId }?.name ?? "Open Vocabularium to set up"
        item?.tapHandler = { [weak self] in
            guard let self, let profile = self.profile else { return }
            let alert = UIAlertController(title: "Save to wordlist", message: nil, preferredStyle: .actionSheet)
            for list in profile.lists {
                alert.addAction(UIAlertAction(title: list.name, style: .default) { [weak self] _ in self?.listId = list.id; self?.reloadConfigurationItems(); self?.validateContent() })
            }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            alert.popoverPresentationController?.sourceView = self.view
            self.present(alert, animated: true)
        }
        let delivery = SLComposeSheetConfigurationItem()
        delivery?.title = "Delivery"; delivery?.value = "Saved on this iPhone; open app to sync"
        return [item, delivery].compactMap { $0 }
    }
    override func didSelectPost() {
        guard let profile, let listId else { return }
        do {
            try LibraryFiles.capture(contentText, sourceURL: sourceURL, profile: profile, listId: listId)
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        } catch {
            let alert = UIAlertController(title: "The word could not be saved", message: error.localizedDescription, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
        }
    }
}
