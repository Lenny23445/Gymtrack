import UIKit
import Capacitor
import CoreSpotlight

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Bounce-Fix beim Start: WebView braucht etwas Zeit zum Laden
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self._applyScrollFix() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self._applyScrollFix() }
        return true
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

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        _applyScrollFix()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self._applyScrollFix() }
    }

    private func _applyScrollFix() {
        guard let rootVC = self.window?.rootViewController as? CAPBridgeViewController,
              let wv = rootVC.bridge?.webView else { return }
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.alwaysBounceHorizontal = false
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }
}
