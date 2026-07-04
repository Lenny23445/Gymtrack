import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared Data

private let appGroup = "group.com.wolter.gymtrack"

struct TrackerItem: Identifiable {
    let id: String
    let label: String
    let goal: Int
    let count: Int   // Basiswert aus der App + bereits getätigte Widget-Taps
}

struct WidgetData {
    var streakWeeks:   Int
    var todayPlan:     String
    var weekSessions:  Int
    var lastWorkout:   String
    var weekDays:      [Int]   // 7 Intensitätslevel 0–4, Mo…So
    var todayIndex:    Int     // 0=Mo … 6=So
    var trackers:      [TrackerItem]

    // Montag der aktuellen Woche als "YYYY-MM-DD" (lokale Zeitzone, Mo=Wochenstart)
    static func currentWeekStartKey(_ now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // Montag
        let start = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)) ?? now
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.string(from: start)
    }

    static func fromDefaults() -> WidgetData {
        let d = UserDefaults(suiteName: appGroup)
        let raw = d?.string(forKey: "gymtrack.weekDays") ?? "0,0,0,0,0,0,0"
        var levels = raw.split(separator: ",").map { Int($0) ?? 0 }
        while levels.count < 7 { levels.append(0) }

        // "Heute" IMMER live berechnen — der gespeicherte Snapshot veraltet um
        // Mitternacht, wenn die App nicht geöffnet wird (0=Mo … 6=So).
        let liveTodayIdx = (Calendar.current.component(.weekday, from: Date()) + 5) % 7

        // Wochenwechsel: Snapshot stammt aus einer früheren Woche → Kreise/Zähler
        // gehören zur ALTEN Woche und dürfen nicht als "diese Woche" erscheinen.
        let storedWeekKey = d?.string(forKey: "gymtrack.weekStartKey") ?? ""
        let isSameWeek = storedWeekKey.isEmpty || storedWeekKey == currentWeekStartKey()

        // Tagesplan aus dem 7-Tage-Snapshot für den LIVE-Tag lesen
        var todayPlan = d?.string(forKey: "gymtrack.todayPlan") ?? ""
        if let plansRaw = d?.string(forKey: "gymtrack.plansJson")?.data(using: .utf8),
           let plans = try? JSONSerialization.jsonObject(with: plansRaw) as? [String],
           plans.count == 7 {
            todayPlan = plans[liveTodayIdx]
        }

        return WidgetData(
            streakWeeks:  d?.integer(forKey: "gymtrack.streakWeeks")   ?? 0,
            todayPlan:    todayPlan,
            weekSessions: isSameWeek ? (d?.integer(forKey: "gymtrack.weekSessions") ?? 0) : 0,
            lastWorkout:  d?.string(forKey:  "gymtrack.lastWorkout")   ?? "",
            weekDays:     isSameWeek ? Array(levels.prefix(7)) : [0,0,0,0,0,0,0],
            todayIndex:   liveTodayIdx,
            trackers:     WidgetData.loadTrackers(d)
        )
    }

    // trackerJson aus der App + ausstehende Widget-Deltas zu Anzeige-Werten verrechnen
    static func loadTrackers(_ d: UserDefaults?) -> [TrackerItem] {
        guard let d = d,
              let raw = d.string(forKey: "gymtrack.trackerJson")?.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
              let items = obj["items"] as? [[String: Any]] else { return [] }
        var deltas: [String: Int] = [:]
        if let dRaw = d.string(forKey: "gymtrack.widgetDeltas")?.data(using: .utf8),
           let dObj = try? JSONSerialization.jsonObject(with: dRaw) as? [String: Any] {
            for (k, v) in dObj { deltas[k] = (v as? NSNumber)?.intValue ?? 0 }
        }
        return items.compactMap { it in
            guard let id = it["id"] as? String else { return nil }
            let label = it["label"] as? String ?? ""
            let goal  = (it["goal"]  as? NSNumber)?.intValue ?? 1
            let base  = (it["count"] as? NSNumber)?.intValue ?? 0
            return TrackerItem(id: id, label: label, goal: goal,
                               count: min(goal, base + (deltas[id] ?? 0)))
        }
    }

    static var placeholder: WidgetData {
        WidgetData(streakWeeks: 4, todayPlan: "Brust & Trizeps", weekSessions: 3,
                   lastWorkout: "Gestern", weekDays: [3,0,2,0,4,0,0], todayIndex: 1,
                   trackers: [
                    TrackerItem(id: "cardio", label: "Cardio", goal: 3, count: 2),
                    TrackerItem(id: "walk",   label: "Spazieren", goal: 5, count: 3)
                   ])
    }
}

// MARK: - Increment Intent (iOS 17+ interaktives Widget)

@available(iOS 17.0, *)
struct IncrementTrackerIntent: AppIntent {
    static var title: LocalizedStringResource = "Tracker +1"

    @Parameter(title: "Tracker") var trackerId: String

    init() {}
    init(trackerId: String) { self.trackerId = trackerId }

    func perform() async throws -> some IntentResult {
        guard let d = UserDefaults(suiteName: appGroup) else { return .result() }

        // Basiswert & Ziel aus dem App-Snapshot lesen
        var goal = 1, base = 0
        if let raw = d.string(forKey: "gymtrack.trackerJson")?.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
           let items = obj["items"] as? [[String: Any]],
           let it = items.first(where: { ($0["id"] as? String) == trackerId }) {
            goal = (it["goal"]  as? NSNumber)?.intValue ?? 1
            base = (it["count"] as? NSNumber)?.intValue ?? 0
        }

        // Bestehende Deltas laden, nur bis zum Ziel hochzählen
        var deltas: [String: Int] = [:]
        if let dRaw = d.string(forKey: "gymtrack.widgetDeltas")?.data(using: .utf8),
           let dObj = try? JSONSerialization.jsonObject(with: dRaw) as? [String: Any] {
            for (k, v) in dObj { deltas[k] = (v as? NSNumber)?.intValue ?? 0 }
        }
        if base + (deltas[trackerId] ?? 0) < goal {
            deltas[trackerId] = (deltas[trackerId] ?? 0) + 1
            if let out = try? JSONSerialization.data(withJSONObject: deltas),
               let s = String(data: out, encoding: .utf8) {
                d.set(s, forKey: "gymtrack.widgetDeltas")
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// Akzentfarbe & Stufen-Deckkraft passend zur App-Heatmap
private let gtAccent = Color(.sRGB, red: 0.0, green: 0.48, blue: 1.0, opacity: 1)
private func gtLevelOpacity(_ lvl: Int) -> Double {
    switch lvl { case 1: return 0.30; case 2: return 0.55; case 3: return 0.80; case 4: return 1.0; default: return 0.0 }
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
        let now   = Date()
        let entry = GymTrackEntry(date: now, data: .fromDefaults())
        let halfHour = Calendar.current.date(byAdding: .minute, value: 30, to: now)!
        // Kurz nach Mitternacht neu laden, damit "Heute"-Plan und Wochen-Kreise
        // auch ohne App-Öffnung auf den neuen Tag umspringen.
        let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1),
                                                 matchingPolicy: .nextTime) ?? halfHour
        completion(Timeline(entries: [entry], policy: .after(min(halfHour, midnight))))
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

// MARK: - Week Circles View (Mo–So, einzeln antippbar)

struct GymTrackWeekView: View {
    let data: WidgetData
    private let labels = ["Mo","Di","Mi","Do","Fr","Sa","So"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Diese Woche")
                    .font(.caption).fontWeight(.semibold).foregroundColor(.secondary)
                Spacer()
                Text("\(data.weekSessions)× ")
                    .font(.caption).fontWeight(.bold).foregroundColor(gtAccent)
                + Text("trainiert").font(.caption).foregroundColor(.secondary)
            }
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { i in
                    // Jeder Tag ist ein eigener Deep-Link → einzeln antippbar
                    Link(destination: URL(string: "gymtrack://day/\(i)")!) {
                        dayCircle(index: i)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func dayCircle(index i: Int) -> some View {
        let lvl     = i < data.weekDays.count ? data.weekDays[i] : 0
        let trained = lvl > 0
        let isToday = i == data.todayIndex
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(trained ? gtAccent.opacity(gtLevelOpacity(lvl))
                                  : Color.gray.opacity(0.18))
                if isToday {
                    Circle().stroke(Color.primary, lineWidth: 1.6)
                }
                if trained {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(lvl >= 2 ? .white : .primary)
                }
            }
            .frame(width: 30, height: 30)
            Text(labels[i])
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
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

// MARK: - Tracker Rings View (Wochenziele, einzeln antippbar → +1)

struct GymTrackTrackerView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Diese Woche")
                .font(.caption).fontWeight(.semibold).foregroundColor(.secondary)
            if data.trackers.isEmpty {
                Spacer()
                Text("In der App unter „Heute“ Kategorien hinzufügen")
                    .font(.caption2).foregroundColor(.secondary)
                    .multilineTextAlignment(.leading)
                Spacer()
            } else {
                HStack(spacing: 12) {
                    ForEach(data.trackers) { t in
                        trackerRing(t)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func trackerRing(_ t: TrackerItem) -> some View {
        let progress = t.goal > 0 ? min(1.0, Double(t.count) / Double(t.goal)) : 0
        let done = t.count >= t.goal
        let ring = VStack(spacing: 5) {
            ZStack {
                Circle().stroke(Color.gray.opacity(0.18), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(done ? Color.green : gtAccent,
                            style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(t.count)/\(t.goal)")
                    .font(.system(size: 11, weight: .bold))
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 48, height: 48)
            Text(t.label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: 62)

        if #available(iOS 17.0, *) {
            Button(intent: IncrementTrackerIntent(trackerId: t.id)) { ring }
                .buttonStyle(.plain)
        } else {
            Link(destination: URL(string: "gymtrack://track/\(t.id)")!) { ring }
        }
    }
}

struct GymTrackTrackerWidget: Widget {
    let kind = "GymTrackTrackerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            Group {
                if #available(iOS 17.0, *) {
                    GymTrackTrackerView(data: entry.data)
                        .containerBackground(.background, for: .widget)
                } else {
                    GymTrackTrackerView(data: entry.data)
                        .background(Color(UIColor.systemBackground))
                }
            }
        }
        .configurationDisplayName("GymTrack Ziele")
        .description("Wochenziele als Ringe – tippe einen Ring für +1.")
        .supportedFamilies([.systemMedium])
    }
}

struct GymTrackWeekWidget: Widget {
    let kind = "GymTrackWeekWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            Group {
                if #available(iOS 17.0, *) {
                    GymTrackWeekView(data: entry.data)
                        .containerBackground(.background, for: .widget)
                } else {
                    GymTrackWeekView(data: entry.data)
                        .background(Color(UIColor.systemBackground))
                }
            }
        }
        .configurationDisplayName("GymTrack Woche")
        .description("Deine Trainingstage Mo–So – tippe einen Tag an.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct GymTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        GymTrackWidget()
        GymTrackTrackerWidget()
        GymTrackWeekWidget()
        GymTrackLockWidget()
        GymTrackLiveActivity()
    }
}
