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

/// Dynamisch bewegte Hantel für Dynamic Island & Lock Screen.
/// iOS erlaubt in Live Activities keine freien Keyframe-Animationen — nur
/// System-Symbol-Effekte laufen durch. Daher: `.rotate` (dreht sich, iOS 18+)
/// mit `.pulse` als Fallback auf älteren Systemen.
struct SpinningDumbbell: View {
    var font: Font = .title2
    private var icon: some View {
        Image(systemName: "dumbbell.fill")
            .font(font)
            .foregroundColor(.accentColor)
    }
    var body: some View {
        if #available(iOS 18.0, *) {
            icon.symbolEffect(.rotate, options: .repeating)   // dreht sich
        } else if #available(iOS 17.0, *) {
            icon.symbolEffect(.pulse, options: .repeating)    // pulsiert (Fallback)
        } else {
            icon                                              // iOS 16: statisch
        }
    }
}

struct GymTrackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GymTrackActivityAttributes.self) { context in
            // Lock Screen / Notification Banner
            HStack(spacing: 14) {
                if context.state.isResting {
                    Image(systemName: "pause.circle.fill")
                        .font(.title2)
                        .foregroundColor(.orange)
                } else {
                    SpinningDumbbell(font: .title2)
                }

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
                        SpinningDumbbell(font: .title3)
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
                if context.state.isResting {
                    Image(systemName: "pause.circle.fill")
                        .foregroundColor(.orange)
                } else {
                    SpinningDumbbell(font: .body)
                }
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
                if context.state.isResting {
                    Image(systemName: "pause.circle.fill")
                        .foregroundColor(.orange)
                } else {
                    SpinningDumbbell(font: .body)
                }
            }
            .keylineTint(.accentColor)
            .widgetURL(URL(string: "gymtrack://workout"))
        }
    }
}
