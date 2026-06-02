import Foundation
import ActivityKit
import Capacitor

@available(iOS 16.1, *)
struct GymTrackActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setsDone:     Int
        var totalSets:    Int
        var restSeconds:  Int
        var isResting:    Bool
    }
    var workoutName: String
    var startDate:   Date
}

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivityPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll",      returnType: CAPPluginReturnPromise)
    ]
    private var _currentActivity: Any?

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["started": false]); return }

        // Bestehende Activity aus vorheriger Session wiederverwenden (App-Kill-Reconnect)
        if let existing = Activity<GymTrackActivityAttributes>.activities.first {
            _currentActivity = existing
            call.resolve(["started": true, "activityId": existing.id])
            return
        }

        // Alte Zombie-Activities bereinigen (sollte nicht vorkommen, aber sicher ist sicher)
        Task {
            for old in Activity<GymTrackActivityAttributes>.activities {
                await old.end(dismissalPolicy: .immediate)
            }
        }

        let tsMs: Double = call.getDouble("startTimestamp") ?? (Date().timeIntervalSince1970 * 1000)
        let startDate = Date(timeIntervalSince1970: tsMs / 1000)
        let attrs = GymTrackActivityAttributes(
            workoutName: call.getString("workoutName") ?? "Training",
            startDate: startDate)
        let state = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone: call.getInt("setsDone") ?? 0, totalSets: call.getInt("totalSets") ?? 0,
            restSeconds: 0, isResting: false)
        do {
            let activity = try Activity<GymTrackActivityAttributes>.request(
                attributes: attrs, contentState: state, pushType: nil)
            _currentActivity = activity
            call.resolve(["started": true, "activityId": activity.id])
        } catch { call.resolve(["started": false]) }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let activity = _currentActivity as? Activity<GymTrackActivityAttributes> else {
            call.resolve(); return
        }
        let newState = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone: call.getInt("setsDone") ?? 0, totalSets: call.getInt("totalSets") ?? 0,
            restSeconds: call.getInt("restSeconds") ?? 0,
            isResting: call.getBool("isResting") ?? false)
        Task { await activity.update(using: newState); call.resolve() }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let activity = _currentActivity as? Activity<GymTrackActivityAttributes> else {
            call.resolve(); return
        }
        Task { await activity.end(dismissalPolicy: .immediate); self._currentActivity = nil; call.resolve() }
    }

    // Alle laufenden Activities beenden (Zombie-Cleanup beim App-Start)
    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        Task {
            for activity in Activity<GymTrackActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            self._currentActivity = nil
            call.resolve()
        }
    }
}
