import Foundation
import Speech
import AVFoundation
import Capacitor

@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "SpeechPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop",        returnType: CAPPluginReturnPromise)
    ]

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    @objc func isAvailable(_ call: CAPPluginCall) {
        let status = SFSpeechRecognizer.authorizationStatus()
        call.resolve(["available": status != .denied && status != .restricted])
    }

    @objc func start(_ call: CAPPluginCall) {
        stopEngine()
        let lang = call.getString("lang") ?? "de-DE"
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang))
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.reject("Diktat auf diesem Gerät nicht verfügbar"); return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            guard authStatus == .authorized else {
                call.reject("Diktat-Berechtigung nicht erteilt"); return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                guard granted else { call.reject("Mikrofon-Berechtigung nicht erteilt"); return }
                DispatchQueue.main.async { self?.beginRecognition(call: call) }
            }
        }
    }

    private func beginRecognition(call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Audio-Session Fehler: \(error.localizedDescription)"); return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        request = req

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        do { try audioEngine.start() } catch {
            call.reject("Audio-Engine Fehler: \(error.localizedDescription)"); return
        }

        task = recognizer?.recognitionTask(with: req) { [weak self] result, error in
            if let result = result {
                self?.notifyListeners("result", data: [
                    "transcript": result.bestTranscription.formattedString,
                    "isFinal": result.isFinal
                ])
                if result.isFinal { self?.stopEngine() }
            }
            if error != nil { self?.stopEngine() }
        }

        call.resolve(["started": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopEngine()
        call.resolve(["stopped": true])
    }

    private func stopEngine() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
