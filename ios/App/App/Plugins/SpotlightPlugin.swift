import Foundation
import CoreSpotlight
import UniformTypeIdentifiers
import Capacitor

@objc(SpotlightPlugin)
public class SpotlightPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpotlightPlugin"
    public let jsName = "SpotlightPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "indexExercises", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearIndex",     returnType: CAPPluginReturnPromise)
    ]
    private static let domain = "com.wolter.gymtrack.exercises"

    @objc func indexExercises(_ call: CAPPluginCall) {
        guard let rawItems = call.getArray("items") as? [[String: Any]] else {
            call.reject("Fehlender items-Parameter"); return
        }
        let items: [CSSearchableItem] = rawItems.compactMap { item in
            guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
            let muscle = item["muscleGroup"] as? String ?? ""
            let attrs = CSSearchableItemAttributeSet(contentType: UTType.text)
            attrs.title = name
            attrs.contentDescription = "\(muscle) · GymTrack Uebung"
            attrs.keywords = [name, muscle, "gymtrack", "training", "fitness"]
            let si = CSSearchableItem(uniqueIdentifier: "gymtrack.exercise.\(id)",
                domainIdentifier: Self.domain, attributeSet: attrs)
            si.expirationDate = .distantFuture
            return si
        }
        CSSearchableIndex.default().indexSearchableItems(items) { error in
            if let error = error { call.reject(error.localizedDescription) }
            else { call.resolve(["indexed": items.count]) }
        }
    }

    @objc func clearIndex(_ call: CAPPluginCall) {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [Self.domain]) { error in
            if let error = error { call.reject(error.localizedDescription) }
            else { call.resolve() }
        }
    }
}
