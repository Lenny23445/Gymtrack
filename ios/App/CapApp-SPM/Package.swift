// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
//
// ⚠️ CRASH-WARNUNG: NIEMALS folgende Pakete hinzufügen:
//   - @capacitor-firebase/authentication  → zieht Firebase iOS SDK + Facebook SDK rein
//     → FacebookCore crasht in didFinishLaunchingWithOptions → SIGABRT
//   Firebase-Auth läuft komplett über das JS Web SDK (CDN in index.html).
//   Es gibt KEINE native Firebase iOS SDK in diesem Projekt – das ist Absicht!
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.4"),
        .package(name: "CapacitorApp", path: "..\..\..\node_modules\@capacitor\app"),
        .package(name: "CapacitorBrowser", path: "..\..\..\node_modules\@capacitor\browser")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser")
            ]
        )
    ]
)
