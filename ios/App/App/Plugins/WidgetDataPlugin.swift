import Foundation
import WidgetKit
import Capacitor

@objc(WidgetDataPlugin)
public class WidgetDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetDataPlugin"
    public let jsName = "WidgetDataPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWidgetDeltas", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getInstallInfo", returnType: CAPPluginReturnPromise)
    ]
    static let appGroup = "group.com.wolter.gymtrack"

    override public func load() {
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.webView?.scrollView.bounces = false
            self?.bridge?.webView?.scrollView.alwaysBounceVertical = false
            self?.bridge?.webView?.scrollView.alwaysBounceHorizontal = false
        }
    }

    @objc func updateWidget(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
            call.reject("App Group nicht verfuegbar"); return
        }
        defaults.set(call.getInt("streakWeeks")    ?? 0,  forKey: "gymtrack.streakWeeks")
        defaults.set(call.getString("todayPlan")   ?? "", forKey: "gymtrack.todayPlan")
        defaults.set(call.getInt("totalSessions")  ?? 0,  forKey: "gymtrack.totalSessions")
        defaults.set(call.getInt("weekSessions")   ?? 0,  forKey: "gymtrack.weekSessions")
        defaults.set(call.getString("lastWorkout") ?? "", forKey: "gymtrack.lastWorkout")
        defaults.set(call.getString("weekDays")    ?? "0,0,0,0,0,0,0", forKey: "gymtrack.weekDays")
        defaults.set(call.getInt("todayIndex")     ?? 0,  forKey: "gymtrack.todayIndex")
        defaults.set(call.getString("weekStartKey") ?? "", forKey: "gymtrack.weekStartKey")
        defaults.set(call.getString("plansJson")   ?? "[]", forKey: "gymtrack.plansJson")
        defaults.set(call.getString("trackerJson") ?? "{\"weekKey\":\"\",\"items\":[]}", forKey: "gymtrack.trackerJson")
        defaults.set(Date().timeIntervalSince1970,         forKey: "gymtrack.lastUpdated")
        call.resolve()
    }

    @objc func reloadWidget(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve()
    }

    // Install-Quelle: nur echte App-Store-Installationen sollen zum Store-Update
    // aufgefordert werden. Simulator, Xcode-Dev und TestFlight liegen versionsmäßig
    // oft hinter dem (oder vor dem) Store → sonst „Update verfügbar" trotz eigener
    // neuester Version.
    @objc func getInstallInfo(_ call: CAPPluginCall) {
        var isSimulator = false
        #if targetEnvironment(simulator)
        isSimulator = true
        #endif
        // App Store: Receipt heißt „receipt" UND die Datei existiert.
        // TestFlight/Sandbox: „sandboxReceipt". Xcode-Dev: „receipt", aber keine Datei.
        var isAppStore = false
        if let url = Bundle.main.appStoreReceiptURL {
            isAppStore = url.lastPathComponent == "receipt"
                && FileManager.default.fileExists(atPath: url.path)
        }
        if isSimulator { isAppStore = false }
        call.resolve(["isAppStore": isAppStore, "isSimulator": isSimulator])
    }

    // Vom Widget getätigte +1-Taps zurückgeben und danach löschen (App übernimmt sie)
    @objc func getWidgetDeltas(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
            call.resolve(["deltas": "{}"]); return
        }
        let deltas = defaults.string(forKey: "gymtrack.widgetDeltas") ?? "{}"
        defaults.removeObject(forKey: "gymtrack.widgetDeltas")
        call.resolve(["deltas": deltas])
    }
}
