import WidgetKit
import SwiftUI

// MARK: - Shared Data

private let appGroup = "group.com.wolter.gymtrack"

struct WidgetData {
    var streakWeeks:   Int
    var todayPlan:     String
    var weekSessions:  Int
    var lastWorkout:   String

    static func fromDefaults() -> WidgetData {
        let d = UserDefaults(suiteName: appGroup)
        return WidgetData(
            streakWeeks:  d?.integer(forKey: "gymtrack.streakWeeks")   ?? 0,
            todayPlan:    d?.string(forKey:  "gymtrack.todayPlan")     ?? "",
            weekSessions: d?.integer(forKey: "gymtrack.weekSessions")  ?? 0,
            lastWorkout:  d?.string(forKey:  "gymtrack.lastWorkout")   ?? ""
        )
    }

    static var placeholder: WidgetData {
        WidgetData(streakWeeks: 4, todayPlan: "Brust & Trizeps", weekSessions: 3, lastWorkout: "Gestern")
    }
}

// MARK: - Timeline Provider

struct GymTrackProvider: TimelineProvider {
    func placeholder(in context: Context) -> GymTrackEntry {
        GymTrackEntry(date: Date(), data: .placeholder)
    }
    func getSnapshot(in context: Context, completion: @escaping (GymTrackEntry) -> Void) {
        completion(GymTrackEntry(date: Date(), data: context.isPreview ? .placeholder : .fromDefaults()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<GymTrackEntry>) -> Void) {
        let entry = GymTrackEntry(date: Date(), data: .fromDefaults())
        let next  = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct GymTrackEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// MARK: - Small Widget View

struct GymTrackSmallView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Streak
            HStack(spacing: 4) {
                Text("🔥")
                Text("\(data.streakWeeks) Wochen")
                    .font(.caption).fontWeight(.bold).foregroundColor(.orange)
            }
            Spacer()
            // Heute
            Text("Heute")
                .font(.caption2).foregroundColor(.secondary)
            Text(data.todayPlan.isEmpty ? "Ruhetag" : data.todayPlan)
                .font(.subheadline).fontWeight(.bold)
                .lineLimit(2).minimumScaleFactor(0.8)
            Spacer()
            // Woche
            Label("\(data.weekSessions)× diese Woche", systemImage: "dumbbell")
                .font(.caption2).foregroundColor(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Medium Widget View

struct GymTrackMediumView: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Label("\(data.streakWeeks) Wochen", systemImage: "flame.fill")
                    .font(.subheadline).fontWeight(.bold).foregroundColor(.orange)

                Divider()

                VStack(alignment: .leading, spacing: 2) {
                    Text("Heute").font(.caption2).foregroundColor(.secondary)
                    Text(data.todayPlan.isEmpty ? "Ruhetag" : data.todayPlan)
                        .font(.headline).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Diese Woche").font(.caption2).foregroundColor(.secondary)
                    Text("\(data.weekSessions) Trainings").font(.subheadline).fontWeight(.bold)
                }
                if !data.lastWorkout.isEmpty {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Zuletzt").font(.caption2).foregroundColor(.secondary)
                        Text(data.lastWorkout).font(.caption).lineLimit(2).multilineTextAlignment(.trailing)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Lock Screen Widget View

struct GymTrackLockScreenView: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill").foregroundColor(.orange)
            Text("\(data.streakWeeks)w").fontWeight(.bold)
            Text("·")
            Text(data.todayPlan.isEmpty ? "Ruhetag" : data.todayPlan).lineLimit(1)
        }
        .font(.caption)
    }
}

// MARK: - Widget Configurations

struct GymTrackWidget: Widget {
    let kind = "GymTrackWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            Group {
                if #available(iOS 17.0, *) {
                    GymTrackSmallView(data: entry.data)
                        .containerBackground(.background, for: .widget)
                } else {
                    GymTrackSmallView(data: entry.data)
                        .background(Color(UIColor.systemBackground))
                }
            }
        }
        .configurationDisplayName("GymTrack")
        .description("Streak und heutiges Training auf dem Homescreen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct GymTrackLockWidget: Widget {
    let kind = "GymTrackLockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            GymTrackLockScreenView(data: entry.data)
        }
        .configurationDisplayName("GymTrack Streak")
        .description("Streak und heutiger Plan auf dem Sperrbildschirm.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Bundle Entry Point

@main
struct GymTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        GymTrackWidget()
        GymTrackLockWidget()
        GymTrackLiveActivity()
    }
}
