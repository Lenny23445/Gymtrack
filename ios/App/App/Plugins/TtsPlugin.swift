import Foundation
import AVFoundation
import Capacitor

// Sprachausgabe des Coaches — AVSpeechSynthesizer, also offline, kostenlos und
// ohne dass der Satz das Geraet verlaesst. Registrierungsform (identifier/jsName/
// pluginMethods) ist 1:1 von SpeechPlugin.swift uebernommen: Capacitor 8 verlangt
// sie exakt so, ein falsch registriertes Plugin faellt zur Laufzeit stumm aus,
// statt zu compilieren.
@objc(TtsPlugin)
public class TtsPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "TtsPlugin"
    public let jsName = "TtsPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise)
    ]

    private let synth = AVSpeechSynthesizer()
    private var delegateSet = false

    // MARK: - Sprechen

    @objc func speak(_ call: CAPPluginCall) {
        let text = (call.getString("text") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // Leerer Text ist kein Fehler, sondern nichts zu sagen. Ein reject() wuerde
        // in coachSpeak() als Warnung landen, obwohl nichts kaputt ist.
        guard !text.isEmpty else { call.resolve(["ok": false]); return }
        let voiceId = call.getString("voiceId")
        let lang = resolveLang(call.getString("lang"))

        DispatchQueue.main.async {
            if !self.delegateSet { self.synth.delegate = self; self.delegateSet = true }
            // Laeuft schon eine Aeusserung, wird sie vor der neuen gestoppt — sonst
            // reihen sich zwei Antworten hintereinander auf und der Nutzer wartet.
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.activateSession()

            let u = AVSpeechUtterance(string: text)
            // Fehlt die gewaehlte Stimme (anderes Geraet, deinstalliertes Sprachpaket),
            // gibt AVSpeechSynthesisVoice(identifier:) nil zurueck und wir fallen auf
            // die Systemstimme der Sprache — kein Fehler, nur eine andere Stimme.
            if let vid = voiceId, !vid.isEmpty, let v = AVSpeechSynthesisVoice(identifier: vid) {
                u.voice = v
            } else {
                u.voice = AVSpeechSynthesisVoice(language: lang)
            }
            u.rate = AVSpeechUtteranceDefaultSpeechRate
            self.synth.speak(u)
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.deactivateSession()
            call.resolve(["ok": true])
        }
    }

    // MARK: - Stimmen

    // Nur Stimmen der aktuellen Sprache: eine englische Stimme fuer deutschen Text
    // klingt nicht nach Akzent, sondern nach Fehler. 'lang' darf die App mitgeben,
    // weil ihr Sprachschalter (GT_LANG) von der Systemsprache abweichen kann.
    @objc func voices(_ call: CAPPluginCall) {
        let lang = resolveLang(call.getString("lang"))
        let base = String(lang.prefix(2)).lowercased()
        let list: [[String: Any]] = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.lowercased().hasPrefix(base) }
            .map { v in
                ["id": v.identifier, "name": v.name, "lang": v.language,
                 "quality": TtsPlugin.qualityName(v.quality)]
            }
        call.resolve(["voices": list])
    }

    // MARK: - Audio-Session

    // .duckOthers ist der eigentliche Knackpunkt: ohne diese Option schneidet iOS
    // laufende Musik AB, statt sie leiser zu drehen. Im Gym ist das der Unterschied
    // zwischen "benutzbar" und "sofort abgeschaltet". .spokenAudio sagt iOS, dass es
    // Sprache ist — CarPlay und AirPods behandeln das anders als Musik.
    private func activateSession() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            try s.setActive(true, options: [])
        } catch {
            // Eine fehlgeschlagene Audio-Session darf hoechstens die Sprachausgabe
            // kosten, nie die App.
            CAPLog.print("[TtsPlugin] Audio-Session aktivieren: \(error.localizedDescription)")
        }
    }

    // Ohne notifyOthersOnDeactivation bleibt die Musik leise, bis der Nutzer die App
    // wechselt.
    private func deactivateSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            CAPLog.print("[TtsPlugin] Audio-Session freigeben: \(error.localizedDescription)")
        }
    }

    // MARK: - Delegate

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        deactivateSession()
        notifyListeners("ttsDone", data: ["ok": true])
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        deactivateSession()
        notifyListeners("ttsDone", data: ["ok": false])
    }

    // MARK: - Helfer

    private func resolveLang(_ wanted: String?) -> String {
        if let w = wanted, !w.isEmpty { return w }
        return Locale.preferredLanguages.first ?? "de-DE"
    }

    private static func qualityName(_ q: AVSpeechSynthesisVoiceQuality) -> String {
        switch q {
        case .enhanced: return "enhanced"
        case .premium:  return "premium"
        case .default:  return "default"
        @unknown default: return "default"
        }
    }
}
