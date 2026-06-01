import Foundation
import WidgetKit
import Capacitor

@objc(WidgetDataPlugin)
public class WidgetDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetDataPlugin"
    public let jsName = "WidgetDataPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise)
    ]

    static let appGroup = "group.com.wolter.gymtrack"

    @objc func update(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
            call.reject("App Group nicht verfügbar"); return
        }
        defaults.set(call.getInt("streakWeeks")    ?? 0,  forKey: "gymtrack.streakWeeks")
        defaults.set(call.getString("todayPlan")   ?? "", forKey: "gymtrack.todayPlan")
        defaults.set(call.getInt("totalSessions")  ?? 0,  forKey: "gymtrack.totalSessions")
        defaults.set(call.getInt("weekSessions")   ?? 0,  forKey: "gymtrack.weekSessions")
        defaults.set(call.getString("lastWorkout") ?? "", forKey: "gymtrack.lastWorkout")
        defaults.set(Date().timeIntervalSince1970,         forKey: "gymtrack.lastUpdated")
        call.resolve()
    }

    @objc func reload(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
