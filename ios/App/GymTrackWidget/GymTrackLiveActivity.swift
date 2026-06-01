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

@available(iOS 16.1, *)
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
                    Text(context.state.isResting ? "Pause" : "Satz")
                        .font(.caption2).foregroundColor(.secondary)
                    Text(context.state.isResting
                         ? "\(context.state.restSeconds)s"
                         : "\(context.state.setsDone)/\(context.state.totalSets)")
                        .font(.title2).bold()
                        .foregroundColor(context.state.isResting ? .orange : .primary)
                        .monospacedDigit()
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
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(context.state.isResting ? "Pause" : "Satz")
                            .font(.caption2).foregroundColor(.secondary)
                        Text(context.state.isResting
                             ? "\(context.state.restSeconds)s"
                             : "\(context.state.setsDone)/\(context.state.totalSets)")
                            .font(.title3).bold()
                            .foregroundColor(context.state.isResting ? .orange : .primary)
                            .monospacedDigit()
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
                Text(context.state.isResting
                     ? "\(context.state.restSeconds)s"
                     : "\(context.state.setsDone)/\(context.state.totalSets)")
                    .font(.caption).bold()
                    .foregroundColor(context.state.isResting ? .orange : .primary)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: context.state.isResting ? "pause.circle.fill" : "dumbbell.fill")
                    .foregroundColor(context.state.isResting ? .orange : .accentColor)
            }
            .keylineTint(.accentColor)
        }
    }
}
