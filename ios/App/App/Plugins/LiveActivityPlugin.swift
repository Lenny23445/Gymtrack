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
        var restEndsAt:   Date?   // Endzeitpunkt der Pause → nativer Live-Countdown (läuft bei geschlossener App weiter)
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

        let tsMs: Double = call.getDouble("startTimestamp") ?? (Date().timeIntervalSince1970 * 1000)
        let startDate = Date(timeIntervalSince1970: tsMs / 1000)

        // Activity desselben Trainings wiederverwenden (App-Kill-Reconnect).
        // Anderes startDate = Zombie eines alten Trainings → unten beenden + neu erstellen.
        if let existing = Activity<GymTrackActivityAttributes>.activities.first(where: {
            abs($0.attributes.startDate.timeIntervalSince(startDate)) < 2
        }) {
            _currentActivity = existing
            call.resolve(["started": true, "activityId": existing.id])
            return
        }

        let attrs = GymTrackActivityAttributes(
            workoutName: call.getString("workoutName") ?? "Training",
            startDate: startDate)
        let state = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone: call.getInt("setsDone") ?? 0, totalSets: call.getInt("totalSets") ?? 0,
            restSeconds: 0, isResting: false, restEndsAt: nil)
        // Cleanup + Request strikt nacheinander im SELBEN Task — ein paralleler
        // Cleanup-Task kann sonst die gerade neu erstellte Activity sofort beenden.
        Task {
            for old in Activity<GymTrackActivityAttributes>.activities {
                await old.end(dismissalPolicy: .immediate)
            }
            do {
                let activity = try Activity<GymTrackActivityAttributes>.request(
                    attributes: attrs, contentState: state, pushType: nil)
                self._currentActivity = activity
                call.resolve(["started": true, "activityId": activity.id])
            } catch {
                call.resolve(["started": false, "reason": String(describing: error)])
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let activity = _currentActivity as? Activity<GymTrackActivityAttributes> else {
            call.resolve(); return
        }
        let restEndMs = call.getDouble("restEndsAt") ?? 0
        let restEnd: Date? = restEndMs > 0 ? Date(timeIntervalSince1970: restEndMs / 1000) : nil
        let newState = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone: call.getInt("setsDone") ?? 0, totalSets: call.getInt("totalSets") ?? 0,
            restSeconds: call.getInt("restSeconds") ?? 0,
            isResting: call.getBool("isResting") ?? false,
            restEndsAt: restEnd)
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
