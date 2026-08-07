import Foundation
import StoreKit
import UIKit
import Capacitor

/// Bruecke zum App-Store-Bewertungsdialog.
///
/// `requestReview` zeigt Apples eigenen Dialog (Sterne + „Nicht jetzt"). Ob er
/// wirklich erscheint, entscheidet **iOS**, nicht die App: das System deckelt ihn
/// auf drei Anzeigen pro 365 Tage und schweigt sonst kommentarlos. Deshalb liefert
/// die Methode `requested: true` fuer „angefragt", niemals „gezeigt" — die
/// JS-Seite darf daraus keine Anzeige ableiten und keinen Ersatzdialog nachschieben
/// (sonst stapeln sich zwei Popups uebereinander, sobald iOS doch anzeigt).
///
/// `openWriteReview` ist der zweite, unabhaengige Weg: direkt auf die
/// App-Store-Seite mit geoeffnetem Bewertungsformular. Den ruft nur die
/// Einstellungs-Zeile, nie der automatische Anstoss nach dem Training.
@objc(ReviewPlugin)
public class ReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewPlugin"
    public let jsName = "ReviewPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWriteReview", returnType: CAPPluginReturnPromise)
    ]

    private static let appStoreId = "6775434876"

    /// Die Szene, in der die WebView haengt. `connectedScenes` liefert auch
    /// inaktive Szenen zurueck — `foregroundActive` zuerst, sonst wuerde der
    /// Dialog an einer Szene angefordert, die gerade nichts zeigt.
    private func activeScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    }

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = self.activeScene() else {
                call.reject("Keine aktive Fensterszene")
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve(["requested": true])
        }
    }

    @objc func openWriteReview(_ call: CAPPluginCall) {
        let raw = "https://apps.apple.com/app/id\(Self.appStoreId)?action=write-review"
        guard let url = URL(string: raw) else {
            call.reject("Ungueltige App-Store-Adresse")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve(["opened": true]) }
                else  { call.reject("App Store liess sich nicht oeffnen") }
            }
        }
    }
}
