import Foundation
import ActivityKit
import Capacitor

// Struct muss identisch mit GymTrackWidget/GymTrackLiveActivity.swift sein
struct GymTrackActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setsDone:     Int
        var totalSets:    Int
        var restSeconds:  Int
        var isResting:    Bool
    }
    var workoutName: String
}

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivityPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end",         returnType: CAPPluginReturnPromise)
    ]

    private var currentActivity: Activity<GymTrackActivityAttributes>?

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["started": false]); return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false]); return
        }
        let attrs = GymTrackActivityAttributes(
            workoutName: call.getString("workoutName") ?? "Training"
        )
        let state = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone:     call.getInt("setsDone")  ?? 0,
            totalSets:    call.getInt("totalSets") ?? 0,
            restSeconds:  0,
            isResting:    false
        )
        do {
            let activity = try Activity<GymTrackActivityAttributes>.request(
                attributes: attrs,
                contentState: state,
                pushType: nil
            )
            currentActivity = activity
            call.resolve(["started": true, "activityId": activity.id])
        } catch {
            call.resolve(["started": false])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let activity = currentActivity else {
            call.resolve(); return
        }
        let newState = GymTrackActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setsDone:     call.getInt("setsDone")     ?? 0,
            totalSets:    call.getInt("totalSets")    ?? 0,
            restSeconds:  call.getInt("restSeconds")  ?? 0,
            isResting:    call.getBool("isResting")   ?? false
        )
        Task {
            await activity.update(using: newState)
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let activity = currentActivity else {
            call.resolve(); return
        }
        Task {
            await activity.end(dismissalPolicy: .immediate)
            self.currentActivity = nil
            call.resolve()
        }
    }
}
