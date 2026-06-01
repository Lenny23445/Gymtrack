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
                if context.state.isResting {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Pause")
                            .font(.caption2).foregroundColor(.secondary)
                        Text("\(context.state.restSeconds)s")
                            .font(.title2).bold().foregroundColor(.orange)
                            .monospacedDigit()
                    }
                } else {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Satz")
                            .font(.caption2).foregroundColor(.secondary)
                        Text("\(context.state.setsDone)/\(context.state.totalSets)")
                            .font(.title2).bold().monospacedDigit()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "dumbbell.fill")
                        .foregroundColor(.accentColor)
                        .font(.title3)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.isResting {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("Pause").font(.caption2).foregroundColor(.secondary)
                            Text("\(context.state.restSeconds)s")
                                .font(.title3).bold().foregroundColor(.orange).monospacedDigit()
                        }
                    } else {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("Satz").font(.caption2).foregroundColor(.secondary)
                            Text("\(context.state.setsDone)/\(context.state.totalSets)")
                                .font(.title3).bold().monospacedDigit()
                        }
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.workoutName)
                        .font(.caption).foregroundColor(.secondary)
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
                        .font(.caption).bold().foregroundColor(.orange).monospacedDigit()
                } else {
                    Text("\(context.state.setsDone)/\(context.state.totalSets)")
                        .font(.caption).bold().monospacedDigit()
                }
            } minimal: {
                Image(systemName: context.state.isResting ? "pause.circle.fill" : "dumbbell.fill")
                    .foregroundColor(context.state.isResting ? .orange : .accentColor)
            }
            .keylineTint(.accentColor)
        }
    }
}
