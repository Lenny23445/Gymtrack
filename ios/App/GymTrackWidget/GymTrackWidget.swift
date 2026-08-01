import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared Data

private let appGroup = "group.com.wolter.gymtrack"

/// Sprach-Helfer: Deutsch nur bei deutscher Gerätesprache, sonst Englisch (wie die App)
func GTL(_ de: String, _ en: String) -> String {
    (Locale.preferredLanguages.first ?? "de").hasPrefix("de") ? de : en
}

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
    /// Jahresmatrix: 53 Wochenspalten à 7 Tage, ältester Tag zuerst.
    /// Werte 0–4 = Intensitätsstufe, 9 = liegt in der Zukunft (bleibt leer).
    var yearDays:      [Int]

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
            trackers:     WidgetData.loadTrackers(d),
            yearDays:     WidgetData.loadYear(d)
        )
    }

    /// Die Ziffernkette der Jahresmatrix in Stufen zerlegen. Kommt nichts oder
    /// etwas Unvollständiges an, liefert sie ein leeres Raster statt eines halben:
    /// ein abgeschnittenes Jahr wäre als Aussage falsch.
    static func loadYear(_ d: UserDefaults?) -> [Int] {
        let s = d?.string(forKey: "gymtrack.yearDays") ?? ""
        guard s.count >= 53 * 7 else { return [] }
        return s.prefix(53 * 7).map { Int(String($0)) ?? 0 }
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
                   ],
                   yearDays: WidgetData.placeholderYear)
    }

    /// Ein Beispieljahr für Vorschau und Widget-Galerie. Bewusst unregelmäßig:
    /// ein gleichmäßiges Muster sähe in der Galerie aus wie eine Zierleiste,
    /// nicht wie Trainingsdaten.
    static var placeholderYear: [Int] {
        (0..<(53 * 7)).map { i in
            if i % 7 == 6 { return 0 }
            if i > 53 * 7 - 4 { return 9 }
            return [0, 2, 0, 3, 4, 1, 0, 3, 2, 0, 4, 0][i % 12]
        }
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

// MARK: - Neon (dieselbe Sprache wie die App)

/* Das Widget stand bisher auf dem alten Stand: graue Kreise, ein Ring in
   Systemblau, Systemhintergrund. Neben der Startseite der App sah es aus wie
   eine andere Anwendung.
   Uebernommen ist deshalb genau das, was die App ausmacht: EINE Leuchtstaffel
   (drei Schatten ohne Versatz, wachsender Radius, fallende Deckkraft) fuer
   jede Anzeige, dieselben Mulden fuer leere Zellen, derselbe Grund. Die
   CSS-Radien 4/10/20 px entsprechen hier 2/5/10 — ein Schatten in SwiftUI
   nimmt die Standardabweichung, CSS den etwa doppelten Wert.
   Und dieselbe Regel wie in der App: auf hellem Grund ist Licht kein Licht.
   Dort wird gedimmt, die Kerne werden satter, die Mulden werden dunkel. */
struct GTNeon {
    let scheme: ColorScheme
    var dark: Bool { scheme == .dark }

    /// Der eine Dimmer (--neon in der App).
    var dim: Double { dark ? 0.6 : 0.32 }

    var accent: Color {
        dark ? Color(.sRGB, red: 0.039, green: 0.518, blue: 1.0, opacity: 1)
             : Color(.sRGB, red: 0.0,   green: 0.478, blue: 1.0, opacity: 1)
    }
    var flame: Color {
        dark ? Color(.sRGB, red: 1.0,  green: 0.62, blue: 0.04, opacity: 1)
             : Color(.sRGB, red: 0.96, green: 0.49, blue: 0.0,  opacity: 1)
    }
    var done: Color {
        dark ? Color(.sRGB, red: 0.188, green: 0.820, blue: 0.345, opacity: 1)
             : Color(.sRGB, red: 0.157, green: 0.710, blue: 0.384, opacity: 1)
    }

    /// Die Mulde: leere Zelle, Ringspur, Tageskapsel.
    var well: Color {
        dark ? Color.white.opacity(0.055)
             : Color(.sRGB, red: 0.12, green: 0.12, blue: 0.16, opacity: 0.055)
    }
    var wellStroke: Color {
        dark ? Color.white.opacity(0.10)
             : Color(.sRGB, red: 0.12, green: 0.12, blue: 0.16, opacity: 0.14)
    }
    /// Die hervorgehobene Mulde (heutiger Tag). Herausstehen heisst hier wie in
    /// der App: heller als die Nachbarn — auf beiden Untergruenden.
    var wellToday: Color {
        dark ? Color.white.opacity(0.115) : Color.white.opacity(0.55)
    }
    var text: Color {
        dark ? Color.white : Color(.sRGB, red: 0.11, green: 0.11, blue: 0.12, opacity: 1)
    }
    var text2: Color { text.opacity(dark ? 0.62 : 0.58) }

    /// Deckkraft der vier Stufen. Auf Weiss traegt die duennste Stufe die
    /// weisse Zahl darin nicht mehr — sie startet deshalb hoeher.
    func level(_ lvl: Int) -> Double {
        let steps: [Double] = dark ? [0.0, 0.42, 0.62, 0.82, 1.0]
                                   : [0.0, 0.62, 0.78, 0.90, 1.0]
        return steps[max(0, min(4, lvl))]
    }
}

extension View {
    /// Die Leuchtstaffel: enger heller Saum, mittlerer Hof, weiter Schimmer.
    /// Eine einzelne Lage sieht aus wie ein weicher Schatten — erst die
    /// Staffelung liest sich als Leuchten.
    func gtGlow(_ c: Color, _ n: GTNeon, scale: Double = 1) -> some View {
        self
            .shadow(color: c.opacity(0.95 * n.dim * scale), radius: 2)
            .shadow(color: c.opacity(0.70 * n.dim * scale), radius: 5)
            .shadow(color: c.opacity(0.42 * n.dim * scale), radius: 10)
    }
}

/// Der Grund, auf dem das Licht liegt. Ohne ihn steht ein leuchtendes Element
/// vor der Systemflaeche und wirkt aufgeklebt; die App hat aus demselben Grund
/// kein flaches Schwarz, sondern sehr dunkle, weiche Koerper.
struct GTBackdrop: View {
    let n: GTNeon
    var body: some View {
        ZStack {
            if n.dark {
                LinearGradient(colors: [Color(.sRGB, red: 0.039, green: 0.043, blue: 0.055, opacity: 1),
                                        Color(.sRGB, red: 0.020, green: 0.024, blue: 0.035, opacity: 1),
                                        Color.black],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color.white.opacity(0.10), .clear],
                               center: UnitPoint(x: 0.82, y: 0.12), startRadius: 0, endRadius: 190)
                RadialGradient(colors: [Color.white.opacity(0.06), .clear],
                               center: UnitPoint(x: 0.10, y: 0.85), startRadius: 0, endRadius: 170)
            } else {
                LinearGradient(colors: [Color(.sRGB, red: 0.902, green: 0.914, blue: 0.933, opacity: 1),
                                        Color(.sRGB, red: 0.824, green: 0.839, blue: 0.867, opacity: 1)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color.white.opacity(0.55), .clear],
                               center: UnitPoint(x: 0.14, y: 0.08), startRadius: 0, endRadius: 200)
                RadialGradient(colors: [Color(.sRGB, red: 0.808, green: 0.714, blue: 0.714, opacity: 0.45), .clear],
                               center: UnitPoint(x: 0.92, y: 0.5), startRadius: 0, endRadius: 190)
            }
        }
    }
}

/// Hintergrund und Neon-Umgebung an einer Stelle, damit jede Konfiguration
/// unten dieselben zwei Zeilen hat statt einer eigenen Fassung.
struct GTShell<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let content: (GTNeon) -> Content

    init(@ViewBuilder content: @escaping (GTNeon) -> Content) {
        self.content = content
    }

    var body: some View {
        let n = GTNeon(scheme: scheme)
        Group {
            if #available(iOS 17.0, *) {
                content(n).containerBackground(for: .widget) { GTBackdrop(n: n) }
            } else {
                content(n).background(GTBackdrop(n: n))
            }
        }
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
    let n: GTNeon

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Die Flamme ist hier das einzige Element, das leuchtet — sie ist
            // der Wert, alles andere ist Beschriftung.
            HStack(spacing: 5) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(n.flame)
                    .gtGlow(n.flame, n)
                Text("\(data.streakWeeks) \(GTL("Wochen", "weeks"))")
                    .font(.caption).fontWeight(.bold).foregroundColor(n.flame)
            }
            Spacer()
            Text(GTL("Heute", "Today"))
                .font(.caption2).foregroundColor(n.text2)
            Text(data.todayPlan.isEmpty ? GTL("Ruhetag", "Rest day") : data.todayPlan)
                .font(.subheadline).fontWeight(.bold).foregroundColor(n.text)
                .lineLimit(2).minimumScaleFactor(0.8)
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "dumbbell.fill").font(.system(size: 9))
                Text("\(data.weekSessions)× \(GTL("diese Woche", "this week"))").font(.caption2)
            }
            .foregroundColor(n.text2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Medium Widget View

struct GymTrackMediumView: View {
    let data: WidgetData
    let n: GTNeon

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(n.flame)
                        .gtGlow(n.flame, n)
                    Text("\(data.streakWeeks) \(GTL("Wochen", "weeks"))")
                        .font(.subheadline).fontWeight(.bold).foregroundColor(n.flame)
                }

                Rectangle().fill(n.wellStroke).frame(height: 1)

                VStack(alignment: .leading, spacing: 2) {
                    Text(GTL("Heute", "Today")).font(.caption2).foregroundColor(n.text2)
                    Text(data.todayPlan.isEmpty ? GTL("Ruhetag", "Rest day") : data.todayPlan)
                        .font(.headline).foregroundColor(n.text).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(GTL("Diese Woche", "This week")).font(.caption2).foregroundColor(n.text2)
                    Text("\(data.weekSessions) \(GTL("Trainings", "workouts"))")
                        .font(.subheadline).fontWeight(.bold).foregroundColor(n.text)
                }
                if !data.lastWorkout.isEmpty {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(GTL("Zuletzt", "Last")).font(.caption2).foregroundColor(n.text2)
                        Text(data.lastWorkout).font(.caption).foregroundColor(n.text)
                            .lineLimit(2).multilineTextAlignment(.trailing)
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

    // Sperrbildschirm-Widgets faerbt das System selbst ein — eigene Farben und
    // ein Schein wuerden dort nur weggerechnet.
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
            Text("\(data.streakWeeks)w").fontWeight(.bold)
            Text("·")
            Text(data.todayPlan.isEmpty ? GTL("Ruhetag", "Rest day") : data.todayPlan).lineLimit(1)
        }
        .font(.caption)
    }
}

// MARK: - Week View (Mo–So als Tageskapseln, einzeln antippbar)

struct GymTrackWeekView: View {
    let data: WidgetData
    let n: GTNeon
    private let labels = (Locale.preferredLanguages.first ?? "de").hasPrefix("de")
        ? ["Mo","Di","Mi","Do","Fr","Sa","So"]
        : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(GTL("Diese Woche", "This week"))
                    .font(.caption).fontWeight(.semibold).foregroundColor(n.text2)
                Spacer()
                Text("\(data.weekSessions)× ")
                    .font(.caption).fontWeight(.bold).foregroundColor(n.accent)
                + Text(GTL("trainiert", "trained")).font(.caption).foregroundColor(n.text2)
            }
            HStack(spacing: 5) {
                ForEach(0..<7, id: \.self) { i in
                    // Jeder Tag ist ein eigener Deep-Link → einzeln antippbar
                    Link(destination: URL(string: "gymtrack://day/\(i)")!) {
                        dayCapsule(index: i)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /* Wie auf der Startseite: der Punkt haengt in einer Kapsel, und die Kapsel
       gehoert dem Tag. Vorher stand der Kreis frei — der heutige Tag war nur an
       einem duennen Ring erkennbar, und ein Tag ohne Training sah aus wie ein
       Loch statt wie eine Spalte, in der noch nichts steht. */
    @ViewBuilder
    private func dayCapsule(index i: Int) -> some View {
        let lvl      = i < data.weekDays.count ? data.weekDays[i] : 0
        let trained  = lvl > 0
        let isToday  = i == data.todayIndex
        let isFuture = i > data.todayIndex

        VStack(spacing: 3) {
            ZStack(alignment: .top) {
                Capsule()
                    .fill(isToday ? n.wellToday : (isFuture ? n.well.opacity(0.45) : n.well))
                    .overlay(
                        Capsule().stroke(isToday ? n.accent.opacity(0.45) : n.wellStroke,
                                         lineWidth: isToday ? 1.2 : 1)
                    )
                dayDot(level: lvl, trained: trained)
                    .padding(.top, 3)
            }
            .frame(width: 30, height: 42)
            Text(labels[i])
                .font(.system(size: 9.5, weight: isToday ? .bold : .medium))
                .foregroundColor(isToday ? n.text : n.text2)
        }
        .frame(maxWidth: .infinity)
        .opacity(isFuture ? 0.55 : 1)
    }

    @ViewBuilder
    private func dayDot(level lvl: Int, trained: Bool) -> some View {
        ZStack {
            if trained {
                Circle().fill(n.accent.opacity(n.level(lvl)))
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
            } else {
                // Ein leerer Tag traegt einen blossen Umriss: er ist eine Stelle
                // in der Woche, keine Null.
                Circle().stroke(n.wellStroke, lineWidth: 1.4)
            }
        }
        .frame(width: 24, height: 24)
        // Der Schein waechst mit der Stufe, nicht der Radius: die Menge sagt das
        // Licht, die Geometrie bleibt ueberall dieselbe.
        .gtGlow(n.accent, n, scale: trained ? n.level(lvl) : 0)
    }
}

// MARK: - Tracker Rings View (Wochenziele, einzeln antippbar → +1)

struct GymTrackTrackerView: View {
    let data: WidgetData
    let n: GTNeon

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(GTL("Diese Woche", "This week"))
                .font(.caption).fontWeight(.semibold).foregroundColor(n.text2)
            if data.trackers.isEmpty {
                Spacer()
                Text(GTL("In der App unter „Heute“ Kategorien hinzufügen", "Add categories in the app under “Today”"))
                    .font(.caption2).foregroundColor(n.text2)
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
        let col  = done ? n.done : n.accent
        let ring = VStack(spacing: 5) {
            ZStack {
                // Die Spur bleibt eine Mulde und leuchtet nicht mit: sie zeigt
                // die Skala, nicht den Wert.
                Circle().stroke(n.well, lineWidth: 5)
                Circle().stroke(n.wellStroke, lineWidth: 0.8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(col, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .gtGlow(col, n)
                Text("\(t.count)/\(t.goal)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(n.text)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 48, height: 48)
            Text(t.label)
                .font(.system(size: 10))
                .foregroundColor(n.text2)
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

// MARK: - Year Matrix View (Jahresraster, Wochen × Wochentage)

/* Dasselbe Raster wie die Matrix-Ansicht im Kalender der App: eine Spalte je
   Woche, sieben Zeilen Mo–So, ein Jahr von links nach rechts.
   Gezeichnet wird auf einem Canvas statt aus 371 einzelnen Views: das Raster
   ist eine Flaeche, kein Stapel Bedienelemente. Der Schein sitzt dadurch EINMAL
   je Stufe statt einmal je Zelle — was nicht nur billiger ist, sondern auch der
   Grund, warum alle Tage einer Stufe garantiert gleich hell leuchten. */
struct GymTrackYearView: View {
    let data: WidgetData
    let n: GTNeon
    var compact: Bool = true

    private var cells: [Int] { data.yearDays.isEmpty ? WidgetData.placeholderYear : data.yearDays }
    private var trainedDays: Int { cells.filter { $0 >= 1 && $0 <= 4 }.count }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            HStack {
                Text(GTL("Dein Jahr", "Your year"))
                    .font(.caption).fontWeight(.semibold).foregroundColor(n.text2)
                Spacer()
                Text("\(trainedDays) \(GTL("Tage", "days"))")
                    .font(.caption).fontWeight(.bold).foregroundColor(n.accent)
            }
            Canvas { ctx, size in draw(ctx: ctx, size: size) }
            if !compact {
                HStack(spacing: 5) {
                    Text(GTL("weniger", "less")).font(.system(size: 9)).foregroundColor(n.text2)
                    ForEach(0..<5, id: \.self) { l in legendCell(l) }
                    Text(GTL("mehr", "more")).font(.system(size: 9)).foregroundColor(n.text2)
                    Spacer()
                }
            }
        }
        .padding(compact ? 12 : 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func legendCell(_ l: Int) -> some View {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(l == 0 ? n.well : n.accent.opacity(n.level(l)))
            .frame(width: 8, height: 8)
    }

    /// Zeichnet Spalte fuer Spalte. Die Zellgroesse folgt der verfuegbaren
    /// Flaeche, damit dasselbe Raster in Medium und Large aufgeht, ohne dass
    /// irgendwo eine halbe Woche abgeschnitten wird.
    private func draw(ctx: GraphicsContext, size: CGSize) {
        let cols = 53, rows = 7
        guard cells.count >= cols * rows, size.width > 0, size.height > 0 else { return }
        let gap: CGFloat = compact ? 1.4 : 2.2
        let cw = (size.width  - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let ch = (size.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let s  = max(2, min(cw, ch))                     // quadratische Zellen
        let step = s + gap
        // Waagerecht mittig, damit der Rest der Breite nicht als Loch rechts
        // stehen bleibt; senkrecht mittig, damit das Raster in Large nicht an
        // der Ueberschrift klebt.
        let ox = max(0, (size.width  - (CGFloat(cols) * s + gap * CGFloat(cols - 1))) / 2)
        let oy = max(0, (size.height - (CGFloat(rows) * s + gap * CGFloat(rows - 1))) / 2)
        let radius = s * 0.28

        // Nach Stufe gebuendelt: eine Form je Stufe, ein Schein je Stufe.
        var paths = [Path](repeating: Path(), count: 5)
        var empty = Path()
        for c in 0..<cols {
            for r in 0..<rows {
                let lvl = cells[c * rows + r]
                if lvl == 9 { continue }                 // Zukunft bleibt leer
                let rect = CGRect(x: ox + CGFloat(c) * step, y: oy + CGFloat(r) * step,
                                  width: s, height: s)
                let rr = Path(roundedRect: rect, cornerRadius: radius, style: .continuous)
                if lvl <= 0 { empty.addPath(rr) } else { paths[min(4, lvl)].addPath(rr) }
            }
        }

        ctx.fill(empty, with: .color(n.well))
        ctx.stroke(empty, with: .color(n.wellStroke), lineWidth: 0.5)

        for lvl in 1...4 {
            let p = paths[lvl]
            if p.isEmpty { continue }
            let col = n.accent.opacity(n.level(lvl))
            // Zwei Lagen statt einer: ein einzelner Schatten sieht aus wie ein
            // weicher Rand, erst die Staffelung liest sich als Leuchten.
            var wide = ctx
            wide.addFilter(.shadow(color: n.accent.opacity(0.45 * n.dim * n.level(lvl)),
                                   radius: s * 1.5))
            wide.fill(p, with: .color(col))
            var near = ctx
            near.addFilter(.shadow(color: n.accent.opacity(0.9 * n.dim * n.level(lvl)),
                                   radius: s * 0.55))
            near.fill(p, with: .color(col))
        }
    }
}

// MARK: - Widget Configurations

struct GymTrackWidget: Widget {
    let kind = "GymTrackWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            GTShell { n in GymTrackSmallView(data: entry.data, n: n) }
        }
        .configurationDisplayName("GymTrack")
        .description(GTL("Streak und heutiges Training auf dem Homescreen.", "Streak and today's workout on your home screen."))
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
        .description(GTL("Streak und heutiger Plan auf dem Sperrbildschirm.", "Streak and today's plan on the lock screen."))
        .supportedFamilies([.accessoryRectangular])
    }
}

struct GymTrackTrackerWidget: Widget {
    let kind = "GymTrackTrackerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            GTShell { n in GymTrackTrackerView(data: entry.data, n: n) }
        }
        .configurationDisplayName(GTL("GymTrack Ziele", "GymTrack Goals"))
        .description(GTL("Wochenziele als Ringe – tippe einen Ring für +1.", "Weekly goals as rings – tap a ring for +1."))
        .supportedFamilies([.systemMedium])
    }
}

struct GymTrackWeekWidget: Widget {
    let kind = "GymTrackWeekWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            GTShell { n in GymTrackWeekView(data: entry.data, n: n) }
        }
        .configurationDisplayName(GTL("GymTrack Woche", "GymTrack Week"))
        .description(GTL("Deine Trainingstage Mo–So – tippe einen Tag an.", "Your training days Mon–Sun – tap a day."))
        .supportedFamilies([.systemMedium])
    }
}

struct GymTrackYearWidget: Widget {
    let kind = "GymTrackYearWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            // In Medium ist nur Platz fuers Raster selbst — eine Legende naehme
            // ihm genau die Hoehe, die es lesbar macht.
            GTShell { n in GymTrackYearView(data: entry.data, n: n, compact: true) }
                .widgetURL(URL(string: "gymtrack://matrix"))
        }
        .configurationDisplayName(GTL("GymTrack Jahr", "GymTrack Year"))
        .description(GTL("Dein Trainingsjahr als Raster – ein Feld je Tag.", "Your training year as a grid – one square per day."))
        .supportedFamilies([.systemMedium])
    }
}

struct GymTrackYearLargeWidget: Widget {
    let kind = "GymTrackYearLargeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GymTrackProvider()) { entry in
            GTShell { n in GymTrackYearView(data: entry.data, n: n, compact: false) }
                .widgetURL(URL(string: "gymtrack://matrix"))
        }
        .configurationDisplayName(GTL("GymTrack Jahr groß", "GymTrack Year large"))
        .description(GTL("Das Trainingsjahr in groß, mit Legende.", "The training year, large, with legend."))
        .supportedFamilies([.systemLarge])
    }
}

// MARK: - Bundle Entry Point

@main
struct GymTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        GymTrackWidget()
        GymTrackTrackerWidget()
        GymTrackWeekWidget()
        GymTrackYearWidget()
        GymTrackYearLargeWidget()
        GymTrackLockWidget()
        GymTrackLiveActivity()
    }
}
