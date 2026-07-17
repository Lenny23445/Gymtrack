import Foundation
import AuthenticationServices
import Capacitor

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignInPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    // Must be retained as instance var — ARC frees a local var before the sheet appears,
    // causing the system to immediately dismiss it without calling any delegate method.
    private var authController: ASAuthorizationController?

    @objc func authorize(_ call: CAPPluginCall) {
        pendingCall = call
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        // Firebase verlangt eine Nonce: JS schickt den SHA256-Hash der rawNonce hierher,
        // Apple bettet ihn in das identityToken ein, Firebase vergleicht ihn mit der rawNonce.
        // Ohne Nonce schlägt signInWithCredential mit auth/missing-or-invalid-nonce fehl.
        if let nonce = call.getString("nonce"), !nonce.isEmpty {
            request.nonce = nonce
        }
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        authController = controller
        DispatchQueue.main.async { controller.performRequests() }
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        authController = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            pendingCall?.reject("Credential konnte nicht gelesen werden"); pendingCall = nil; return
        }
        var authCode = ""
        if let codeData = credential.authorizationCode {
            authCode = String(data: codeData, encoding: .utf8) ?? ""
        }
        pendingCall?.resolve([
            "identityToken": token,
            "authorizationCode": authCode,
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        authController = nil
        let nsErr = error as NSError
        if nsErr.domain == ASAuthorizationError.errorDomain {
            switch nsErr.code {
            case 1001: // canceled – vom User abgebrochen, stumm schlucken
                pendingCall?.reject("cancelled", "canceled")
            case 1000: // unknown – häufigste Ursache: Simulator ohne iCloud-Login
                #if targetEnvironment(simulator)
                pendingCall?.reject(
                    "Anmelden mit Apple funktioniert im iOS-Simulator nur mit dort angemeldetem iCloud-Konto – und selbst dann oft nicht. Bitte auf einem echten Gerät testen.",
                    "simulator")
                #else
                pendingCall?.reject(
                    "Anmelden mit Apple ist fehlgeschlagen. Bitte stelle sicher, dass du auf dem Gerät bei iCloud angemeldet bist, und versuche es erneut.",
                    "unknown")
                #endif
            default:
                pendingCall?.reject(error.localizedDescription, "apple-\(nsErr.code)")
            }
        } else {
            pendingCall?.reject(error.localizedDescription)
        }
        pendingCall = nil
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Must return the KEY window — Sign In with Apple fails with error 1000 when
        // a non-key window (e.g. the WKWebView window in Capacitor) is returned.
        if let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
           let kw = scene.windows.first(where: { $0.isKeyWindow }) {
            return kw
        }
        return bridge!.viewController!.view.window!
    }
}
