import Foundation
import AuthenticationServices
import Capacitor

@objc(GoogleAuthPlugin)
public class GoogleAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleAuthPlugin"
    public let jsName = "GoogleAuthPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startAuth", returnType: CAPPluginReturnPromise)
    ]

    private var webAuthSession: ASWebAuthenticationSession?

    @objc func startAuth(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let scheme = call.getString("callbackScheme"),
              let url = URL(string: urlString) else {
            call.reject("Invalid parameters")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackURL, error in
                if let error = error {
                    if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                        call.reject("cancelled")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }
                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL received")
                    return
                }
                call.resolve(["url": callbackURL.absoluteString])
            }
            session.presentationContextProvider = self
            // true = kein geteilter Safari-Cookie-Store → kein System-Consent-Dialog.
            // false würde auf neueren iOS-Versionen einen "wants to use accounts.google.com"-Dialog
            // zeigen, der bei Presentation-Konflikt mit WKWebView sofort auto-dismissed wird
            // und die Session mit canceledLogin abbricht. Nutzer müssen einmal ihre
            // Google-Credentials eingeben, aber der Flow läuft zuverlässig.
            session.prefersEphemeralWebBrowserSession = true
            self.webAuthSession = session
            session.start()
        }
    }
}

extension GoogleAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
           let kw = scene.windows.first(where: { $0.isKeyWindow }) {
            return kw
        }
        return bridge!.viewController!.view.window!
    }
}
