import UIKit
import Capacitor
import CoreSpotlight
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var _bounceObserver: NSKeyValueObservation?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Notifications im Vordergrund anzeigen (für @capacitor/local-notifications)
        UNUserNotificationCenter.current().delegate = self
        // Scroll-Fix: startet Retry-Loop bis WKWebView bereit ist
        _tryScrollFix(attempt: 0)
        return true
    }

    // MARK: - Scroll / Bounce Fix

    private func _tryScrollFix(attempt: Int) {
        guard attempt < 24 else { return } // max 12 Sekunden
        guard let rootVC = self.window?.rootViewController as? CAPBridgeViewController,
              let wv = rootVC.bridge?.webView else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self._tryScrollFix(attempt: attempt + 1) }
            return
        }
        _applyScrollSettings(wv)
        // KVO: sobald etwas bounces wieder auf true setzt, sofort zurücksetzen
        _bounceObserver = wv.scrollView.observe(\.bounces, options: [.new]) { scrollView, change in
            if change.newValue == true { scrollView.bounces = false }
        }
    }

    private func _applyScrollSettings(_ wv: WKWebView) {
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.alwaysBounceHorizontal = false
        // .never → CSS env(safe-area-inset-*) übernimmt Safe-Area vollständig,
        // kein doppeltes Inset durch iOS und CSS gleichzeitig
        wv.scrollView.contentInsetAdjustmentBehavior = .never
    }

    // MARK: - Spotlight Deep Link

    func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == CSSearchableItemActionType,
           let uniqueID = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
            let parts = uniqueID.split(separator: ".")
            if parts.count >= 3 {
                let exId = String(parts.dropFirst(2).joined(separator: "."))
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.notifyWebView(event: "spotlightOpen", data: ["exerciseId": exId])
                }
            }
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func notifyWebView(event: String, data: [String: Any]) {
        guard let bridge = (window?.rootViewController as? CAPBridgeViewController)?.bridge else { return }
        bridge.triggerJSEvent(eventName: event, target: "window", data: try! JSONSerialization.data(withJSONObject: data).description)
    }

    // MARK: - App Lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Fix erneut anwenden falls WkWebView neu erstellt wurde
        _tryScrollFix(attempt: 0)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if let rootVC = self.window?.rootViewController as? CAPBridgeViewController,
           let wv = rootVC.bridge?.webView {
            _applyScrollSettings(wv)
        }
        // App-Icon-Badge zurücksetzen: der Push-Worker schickt kein Badge mehr mit,
        // also muss die App selbst dafür sorgen, dass die rote Zahl beim Öffnen weggeht.
        application.applicationIconBadgeNumber = 0
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    // MARK: - Remote Push (APNs) → an @capacitor/push-notifications weiterreichen
    // Ohne diese zwei Methoden feuert das "registration"-Event im JS nie.
    // Reines Capacitor, KEIN Firebase-SDK.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications,
                                        object: deviceToken)
    }
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: error)
    }
}

// MARK: - UNUserNotificationCenterDelegate
// Zeigt Benachrichtigungen auch dann an, wenn die App im Vordergrund ist

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}

// MARK: - Bridge View Controller mit expliziter Plugin-Registrierung
// Capacitor 8 + SPM registriert App-eigene Plugins NICHT automatisch über die
// Objective-C-Runtime. Darum hier explizit registrieren, sonst sind sie im JS
// (window.Capacitor.Plugins.*) nicht verfügbar → "Plugin nicht verfügbar".

class MainViewController: CAPBridgeViewController {
    private var splashOverlay: UIView?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GoogleAuthPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(SpotlightPlugin())
        bridge?.registerPluginInstance(WidgetDataPlugin())
        bridge?.registerPluginInstance(CameraPlugin())
        bridge?.registerPluginInstance(PremiumPlugin())
        bridge?.registerPluginInstance(SplashOverlayPlugin())
        // Stimme des Coaches (Block 2): ohne diese zwei Zeilen existieren die
        // Plugins fuer JS nicht — der Sprech-Knopf in der Coach-Leiste wird dann
        // nie gerendert (_cvCaps.stt bleibt false). Genau so war er "tot".
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(TtsPlugin())
    }

    // MARK: - Splash-Overlay (nahtloser Start)
    // Der LaunchScreen verschwindet, sobald der ViewController steht — die
    // WKWebView braucht danach aber noch rund eine Sekunde bis zum ersten Frame.
    // In dieser Lücke sah man nur Schwarz, danach sprang der Web-Boot-Splash mit
    // demselben Logo nach: es wirkte, als lägen Startbildschirm und App
    // übereinander. Dieses Overlay ist optisch identisch mit dem LaunchScreen
    // (Schwarz + weisses 92-pt-Logo) und liegt ÜBER der WebView, bis das JS
    // meldet, dass die App fertig aufgebaut ist (SplashOverlayPlugin.hide() aus
    // _bootSplashDone). Damit ist der Start eine durchgehende Ansicht ohne Sprung.
    override func viewDidLoad() {
        super.viewDidLoad()
        let v = UIView(frame: view.bounds)
        v.backgroundColor = .black
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        v.isUserInteractionEnabled = false
        let logo = UIImageView(image: UIImage(named: "Splash"))
        logo.contentMode = .center
        logo.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: v.centerYAnchor)
        ])
        view.addSubview(v)
        splashOverlay = v
        NotificationCenter.default.addObserver(forName: .gtHideSplashOverlay, object: nil, queue: .main) { [weak self] _ in
            self?.hideSplashOverlay()
        }
        // Notbremse: lieber eine halbfertige App als ein Overlay, das nie geht
        // (JS wirft, Bridge nicht da, …).
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.hideSplashOverlay() }
    }

    private func hideSplashOverlay() {
        guard let v = splashOverlay else { return }
        splashOverlay = nil
        UIView.animate(withDuration: 0.22, animations: { v.alpha = 0 }, completion: { _ in v.removeFromSuperview() })
    }
}

extension Notification.Name {
    static let gtHideSplashOverlay = Notification.Name("GTHideSplashOverlay")
}

// Winziges Plugin, damit das JS das Overlay genau dann wegnimmt, wenn der erste
// echte App-Frame steht (s. _bootSplashDone in index.html).
@objc(SplashOverlayPlugin)
public class SplashOverlayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SplashOverlayPlugin"
    public let jsName = "SplashOverlayPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .gtHideSplashOverlay, object: nil)
        }
        call.resolve()
    }
}
