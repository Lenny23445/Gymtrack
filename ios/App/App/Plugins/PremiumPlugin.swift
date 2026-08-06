import Foundation
import Capacitor
import CryptoKit
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
                // Kontobindung: die Transaktion bekommt ein appAccountToken, das der
                // KI-Worker aus derselben Firebase-uid nachrechnet. Ohne das ist der
                // JWS ein uebertragbarer Schluessel — ein Abo schaltet beliebig viele
                // Konten frei. Fehlt die uid (nicht angemeldet), wird ohne Token
                // gekauft; der Worker laesst solche Transaktionen in der
                // Uebergangsfrist noch durch.
                var opts = Set<Product.PurchaseOption>()
                if let uid = call.getString("uid"), let tok = Self.accountToken(for: uid) {
                    opts.insert(.appAccountToken(tok))
                }
                let result = try await product.purchase(options: opts)
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
    /// Deterministische Konto-UUID aus der Firebase-uid: gleiche uid → immer dieselbe
    /// UUID, damit der KI-Worker sie nachrechnen kann. MUSS Byte fuer Byte dasselbe
    /// rechnen wie accountTokenFor() in ai-worker/worker.js — SHA-256("gymtrack:" + uid),
    /// erste 16 Bytes, Version-Nibble 8 + RFC-4122-Variante, klein mit Bindestrichen.
    /// Referenzwert: uid "testuid123" → ed671e2d-409f-87a1-862b-efda550b5d08.
    static func accountToken(for uid: String) -> UUID? {
        guard !uid.isEmpty else { return nil }
        var b: [UInt8] = Array(SHA256.hash(data: Data(("gymtrack:" + uid).utf8)).prefix(16))
        b[6] = (b[6] & 0x0F) | 0x80
        b[8] = (b[8] & 0x3F) | 0x80
        var s = ""
        for (i, byte) in b.enumerated() {
            if i == 4 || i == 6 || i == 8 || i == 10 { s += "-" }
            s += String(format: "%02x", byte)
        }
        return UUID(uuidString: s)
    }

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
