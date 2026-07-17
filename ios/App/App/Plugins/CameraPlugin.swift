import Foundation
import AVFoundation
import UIKit
import PhotosUI
import Capacitor

// In-App-Kamera für den Workout-Share-Flow: eigene AVFoundation-Implementierung
// mit selbst gestaltetem Chrome (Auslöser, Front/Rück-Flip, Blitz, Galerie).
// Liefert base64-JPEG an JS zurück; das Overlay-Compositing passiert im Web-Layer.
@objc(CameraPlugin)
public class CameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CameraPlugin"
    public let jsName = "CameraPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func capture(_ call: CAPPluginCall) {
        pendingCall = call
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted { self?.presentCamera() }
                    else { self?.finish(["denied": true]) }
                }
            }
        default:
            finish(["denied": true])
        }
    }

    private func presentCamera() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let host = self.bridge?.viewController else { return }
            let vc = GTCameraViewController()
            vc.modalPresentationStyle = .fullScreen
            vc.onResult = { [weak self] result in
                self?.finish(result)
            }
            host.present(vc, animated: true)
        }
    }

    private func finish(_ data: [String: Any]) {
        pendingCall?.resolve(data)
        pendingCall = nil
    }
}

final class GTCameraViewController: UIViewController {
    var onResult: (([String: Any]) -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private let sessionQueue = DispatchQueue(label: "gt.camera.session")
    private var position: AVCaptureDevice.Position = .back
    private var flashOn = false
    private var didFinish = false

    private let shutterButton = UIButton(type: .custom)
    private let flipButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)
    private let galleryButton = UIButton(type: .system)
    private let closeButton = UIButton(type: .system)
    // Weißes Overlay als „Retina-Flash"-Ersatz, falls die Hardware keinen Blitz hat
    private let screenFlashView = UIView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        setupChrome()
        #if targetEnvironment(simulator)
        // Simulator hat keine Kamera-Hardware — Hinweis statt schwarzer Preview,
        // Galerie-Button (PHPicker) funktioniert trotzdem.
        let hint = UILabel()
        hint.text = "Kamera im Simulator nicht verfügbar\n→ Foto aus Galerie wählen"
        hint.numberOfLines = 0
        hint.textAlignment = .center
        hint.textColor = UIColor(white: 1, alpha: 0.7)
        hint.font = .systemFont(ofSize: 15, weight: .semibold)
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)
        NSLayoutConstraint.activate([
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hint.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            hint.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 30)
        ])
        #else
        sessionQueue.async { [weak self] in
            self?.configureSession()
            self?.session.startRunning()
        }
        #endif
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
        screenFlashView.frame = view.bounds
    }

    override var prefersStatusBarHidden: Bool { true }

    private func setupChrome() {
        let pad: CGFloat = 20
        let safe = view.safeAreaLayoutGuide

        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .bold)), for: .normal)
        styleRound(closeButton)
        closeButton.accessibilityLabel = "Abbrechen"
        closeButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        flashButton.setImage(flashIcon(), for: .normal)
        styleRound(flashButton)
        flashButton.accessibilityLabel = "Blitz"
        flashButton.addTarget(self, action: #selector(flashTapped), for: .touchUpInside)

        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera", withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)), for: .normal)
        styleRound(flipButton)
        flipButton.accessibilityLabel = "Kamera wechseln"
        flipButton.addTarget(self, action: #selector(flipTapped), for: .touchUpInside)

        galleryButton.setImage(UIImage(systemName: "photo.on.rectangle", withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)), for: .normal)
        styleRound(galleryButton)
        galleryButton.accessibilityLabel = "Foto aus Galerie wählen"
        galleryButton.addTarget(self, action: #selector(galleryTapped), for: .touchUpInside)

        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 37
        shutterButton.layer.borderWidth = 5
        shutterButton.layer.borderColor = UIColor(white: 1, alpha: 0.35).cgColor
        shutterButton.accessibilityLabel = "Foto aufnehmen"
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)

        screenFlashView.backgroundColor = .white
        screenFlashView.alpha = 0
        screenFlashView.isUserInteractionEnabled = false

        [closeButton, flashButton, flipButton, galleryButton, shutterButton].forEach { view.addSubview($0) }
        view.addSubview(screenFlashView)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: pad),
            flashButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 12),
            flashButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -pad),

            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -28),
            shutterButton.widthAnchor.constraint(equalToConstant: 74),
            shutterButton.heightAnchor.constraint(equalToConstant: 74),

            galleryButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            galleryButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 34),
            flipButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            flipButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -34)
        ])
    }

    private func styleRound(_ b: UIButton) {
        b.translatesAutoresizingMaskIntoConstraints = false
        b.tintColor = .white
        b.backgroundColor = UIColor(white: 0, alpha: 0.35)
        b.layer.cornerRadius = 22
        b.widthAnchor.constraint(equalToConstant: 44).isActive = true
        b.heightAnchor.constraint(equalToConstant: 44).isActive = true
    }

    private func flashIcon() -> UIImage? {
        UIImage(systemName: flashOn ? "bolt.fill" : "bolt.slash",
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .semibold))
    }

    private func configureSession() {
        session.beginConfiguration()
        session.sessionPreset = .photo
        session.inputs.forEach { session.removeInput($0) }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)
        if !session.outputs.contains(photoOutput), session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        if let conn = photoOutput.connection(with: .video), conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
        }
        session.commitConfiguration()
    }

    @objc private func cancelTapped() {
        finish(["cancelled": true])
    }

    @objc private func flashTapped() {
        flashOn.toggle()
        flashButton.setImage(flashIcon(), for: .normal)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @objc private func flipTapped() {
        position = (position == .back) ? .front : .back
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        UIView.transition(with: view, duration: 0.3, options: .transitionFlipFromLeft, animations: nil)
        sessionQueue.async { [weak self] in self?.configureSession() }
    }

    @objc private func shutterTapped() {
        shutterButton.isEnabled = false
        let settings = AVCapturePhotoSettings()
        let hwFlash = photoOutput.supportedFlashModes.contains(.on)
        if flashOn && hwFlash { settings.flashMode = .on }
        if flashOn && !hwFlash {
            // Kein Hardware-/Retina-Blitz verfügbar → Bildschirm kurz weiß aufleuchten lassen
            screenFlashView.alpha = 1
            UIView.animate(withDuration: 0.6, delay: 0.15, animations: { self.screenFlashView.alpha = 0 })
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    @objc private func galleryTapped() {
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func finish(_ data: [String: Any]) {
        guard !didFinish else { return }
        didFinish = true
        sessionQueue.async { [weak self] in self?.session.stopRunning() }
        dismiss(animated: true) { [onResult] in onResult?(data) }
    }

    private func deliver(image: UIImage, source: String) {
        // Max. 1920px Kante + JPEG 0.85 — genug für Feed/Story, klein genug für Upload
        let scaled = image.gtScaled(maxSide: 1920)
        guard let jpeg = scaled.jpegData(compressionQuality: 0.85) else {
            finish(["cancelled": true]); return
        }
        finish([
            "photo": jpeg.base64EncodedString(),
            "width": Int(scaled.size.width * scaled.scale),
            "height": Int(scaled.size.height * scaled.scale),
            "source": source
        ])
    }
}

extension GTCameraViewController: AVCapturePhotoCaptureDelegate {
    public func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        shutterButton.isEnabled = true
        guard error == nil, let data = photo.fileDataRepresentation(), var image = UIImage(data: data) else {
            return
        }
        // Frontkamera: spiegeln, damit das Ergebnis dem Preview entspricht (Selfie-Erwartung)
        if position == .front, let cg = image.cgImage {
            image = UIImage(cgImage: cg, scale: image.scale, orientation: .leftMirrored)
        }
        deliver(image: image.gtNormalizedOrientation(), source: "camera")
    }
}

extension GTCameraViewController: PHPickerViewControllerDelegate {
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { return }
        item.loadObject(ofClass: UIImage.self) { [weak self] obj, _ in
            guard let img = obj as? UIImage else { return }
            DispatchQueue.main.async {
                self?.deliver(image: img.gtNormalizedOrientation(), source: "gallery")
            }
        }
    }
}

private extension UIImage {
    // EXIF-Orientierung einbacken, damit Canvas im Web-Layer nichts drehen muss
    func gtNormalizedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }

    func gtScaled(maxSide: CGFloat) -> UIImage {
        let longest = max(size.width, size.height) * scale
        guard longest > maxSide else { return self }
        let factor = maxSide / longest
        let newSize = CGSize(width: size.width * scale * factor, height: size.height * scale * factor)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: newSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
