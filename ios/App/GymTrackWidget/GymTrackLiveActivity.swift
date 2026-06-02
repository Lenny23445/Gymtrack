import ActivityKit
import WidgetKit
import SwiftUI

// Muss identisch mit LiveActivityPlugin.swift im App-Target sein
struct GymTrackActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setsDone:     Int
        var totalSets:    Int
        var restSeconds:  Int
        var isResting:    Bool
    }
    var workoutName: String
    var startDate:   Date
}

struct GymTrackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GymTrackActivityAttributes.self) { context in
            // Lock Screen / Notification Banner
            HStack(spacing: 14) {
                Image(systemName: context.state.isResting ? "pause.circle.fill" : "dumbbell.fill")
                    .font(.title2)
                    .foregroundColor(context.state.isResting ? .orange : .accentColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.workoutName)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(context.state.exerciseName)
                        .font(.headline)
                        .lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    if context.state.isResting {
                        Text("Pause")
                            .font(.caption2).foregroundColor(.secondary)
                        Text("\(context.state.restSeconds)s")
                            .font(.title2).bold()
                            .foregroundColor(.orange)
                            .monospacedDigit()
                    } else {
                        Text("Dauer")
                            .font(.caption2).foregroundColor(.secondary)
                        Text(timerInterval: context.attributes.startDate...Date.distantFuture,
                             countsDown: false)
                            .font(.title2).bold()
                            .monospacedDigit()
                            .frame(width: 72, alignment: .trailing)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .widgetURL(URL(string: "gymtrack://workout"))

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "dumbbell.fill")
                            .foregroundColor(.accentColor)
                            .font(.title3)
                        Text(context.attributes.workoutName)
                            .font(.caption2).foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 1) {
                        if context.state.isResting {
                            Text("Pause")
                                .font(.caption2).foregroundColor(.secondary)
                            Text("\(context.state.restSeconds)s")
                                .font(.title3).bold()
                                .foregroundColor(.orange)
                                .monospacedDigit()
                        } else {
                            Text("Satz \(context.state.setsDone)/\(context.state.totalSets)")
                                .font(.caption2).foregroundColor(.secondary)
                            Text(timerInterval: context.attributes.startDate...Date.distantFuture,
                                 countsDown: false)
                                .font(.title3).bold()
                                .monospacedDigit()
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.exerciseName)
                        .font(.headline).bold().lineLimit(1).padding(.bottom, 4)
                }
            } compactLeading: {
                Image(systemName: context.state.isResting ? "pause.circle.fill" : "dumbbell.fill")
                    .foregroundColor(context.state.isResting ? .orange : .accentColor)
            } compactTrailing: {
                if context.state.isResting {
                    Text("\(context.state.restSeconds)s")
                        .font(.caption2).bold()
                        .foregroundColor(.orange)
                        .monospacedDigit()
                } else {
                    Text(timerInterval: context.attributes.startDate...Date.distantFuture,
                         countsDown: false)
                        .font(.caption2).bold()
                        .monospacedDigit()
                        .frame(width: 44)
                }
            } minimal: {
                Image(systemName: context.state.isResting ? "pause.circle.fill" : "dumbbell.fill")
                    .foregroundColor(context.state.isResting ? .orange : .accentColor)
            }
            .keylineTint(.accentColor)
            .widgetURL(URL(string: "gymtrack://workout"))
        }
    }
}
