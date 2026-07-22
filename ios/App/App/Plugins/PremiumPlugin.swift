import Foundation
import Capacitor
import StoreKit
import UIKit

/// GymTrack Premium — StoreKit 2 (Abos) + alternative App-Icons.
/// Produkte in App Store Connect: gymtrack.premium.monthly (2,99 €/Monat),
/// gymtrack.premium.yearly (19,99 €/Jahr). Kein Drittanbieter (kein RevenueCat) —
/// Verifikation macht StoreKit 2 lokal, der KI-Worker prüft den JWS serverseitig
/// gegen Apples Zertifikatskette.
@objc(PremiumPlugin)
public class PremiumPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PremiumPlugin"
    public let jsName = "PremiumPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadProducts",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubs",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppIcon",     returnType: CAPPluginReturnPromise)
    ]

    static let productIds = ["gymtrack.premium.monthly", "gymtrack.premium.yearly"]
    private var updatesTask: Any? = nil

    override public func load() {
        guard #available(iOS 15.0, *) else { return }
        // Transaktions-Updates (Verlängerung, Widerruf, Kauf auf anderem Gerät) live an JS melden
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                await self?.pushEntitlement()
            }
        }
    }

    // ── Produkte laden (lokalisierte Preise direkt aus dem Store) ──
    @objc func loadProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("iOS 15+ nötig"); return }
        Task {
            do {
                let products = try await Product.products(for: Self.productIds)
                let arr: [[String: Any]] = products.map { p in
                    var unit = ""
                    if let sub = p.subscription {
                        switch sub.subscriptionPeriod.unit {
                        case .month: unit = "month"
                        case .year:  unit = "year"
                        default:     unit = "other"
                        }
                    }
                    return ["id": p.id, "displayPrice": p.displayPrice,
                            "price": (p.price as NSDecimalNumber).doubleValue, "period": unit]
                }
                call.resolve(["products": arr])
            } catch { call.reject("Produkte laden fehlgeschlagen: \(error.localizedDescription)") }
        }
    }

    // ── Kauf ──
    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("iOS 15+ nötig"); return }
        guard let pid = call.getString("productId") else { call.reject("productId fehlt"); return }
        Task {
            do {
                guard let product = try await Product.products(for: [pid]).first else {
                    call.reject("Produkt nicht gefunden — Abo in App Store Connect angelegt?"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let t):
                        await t.finish()
                        call.resolve(await self.entitlementDict(justBought: verification.jwsRepresentation))
                    case .unverified(_, let err):
                        call.reject("Kauf nicht verifizierbar: \(err.localizedDescription)")
                    }
                case .userCancelled: call.resolve(["status": "cancelled"])
                case .pending:       call.resolve(["status": "pending"])
                @unknown default:    call.resolve(["status": "unknown"])
                }
            } catch { call.reject("Kauf fehlgeschlagen: \(error.localizedDescription)") }
        }
    }

    // ── Käufe wiederherstellen ──
    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("iOS 15+ nötig"); return }
        Task {
            do { try await AppStore.sync() } catch { /* Nutzer-Abbruch beim Anmelden ist ok */ }
            call.resolve(await self.entitlementDict(justBought: nil))
        }
    }

    // ── Aktueller Abo-Status (beim App-Start) ──
    @objc func getEntitlement(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.resolve(["active": false]); return }
        Task { call.resolve(await self.entitlementDict(justBought: nil)) }
    }

    // ── Abo-Verwaltung (Apple-Sheet: kündigen/wechseln) ──
    @objc func manageSubs(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("iOS 15+ nötig"); return }
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.reject("Keine aktive Szene"); return
            }
            do { try await AppStore.showManageSubscriptions(in: scene); call.resolve() }
            catch { call.reject(error.localizedDescription) }
        }
    }

    // ── Alternatives App-Icon (Premium) — name nil/leer = Standard-Icon ──
    @objc func setAppIcon(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Alternative Icons nicht unterstützt"); return
            }
            UIApplication.shared.setAlternateIconName((name?.isEmpty ?? true) ? nil : name) { err in
                if let err = err { call.reject(err.localizedDescription) } else { call.resolve() }
            }
        }
    }

    // ── Helpers ──
    @available(iOS 15.0, *)
    private func entitlementDict(justBought: String?) async -> [String: Any] {
        var best: Transaction? = nil
        var bestJws: String? = nil
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, Self.productIds.contains(t.productID) else { continue }
            if best == nil || (t.expirationDate ?? .distantFuture) > (best!.expirationDate ?? .distantFuture) {
                best = t; bestJws = result.jwsRepresentation
            }
        }
        guard let t = best else { return ["status": justBought != nil ? "success" : "none", "active": false] }
        return ["status": "success", "active": true, "productId": t.productID,
                "expiresMs": (t.expirationDate?.timeIntervalSince1970 ?? 0) * 1000,
                "jws": justBought ?? bestJws ?? ""]
    }

    @available(iOS 15.0, *)
    private func pushEntitlement() async {
        let data = await entitlementDict(justBought: nil)
        notifyListeners("entitlementChanged", data: data)
    }
}
