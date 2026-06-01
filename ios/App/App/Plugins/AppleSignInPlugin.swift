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

    @objc func authorize(_ call: CAPPluginCall) {
        pendingCall = call
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        DispatchQueue.main.async { controller.performRequests() }
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            pendingCall?.reject("Credential konnte nicht gelesen werden"); pendingCall = nil; return
        }
        pendingCall?.resolve(["identityToken": token, "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let nsErr = error as NSError
        if nsErr.domain == ASAuthorizationError.errorDomain && nsErr.code == 1001 {
            pendingCall?.reject("cancelled")
        } else {
            pendingCall?.reject(error.localizedDescription)
        }
        pendingCall = nil
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge!.viewController!.view.window!
    }
}
