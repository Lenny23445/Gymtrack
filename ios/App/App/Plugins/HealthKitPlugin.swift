import Foundation
import HealthKit
import Capacitor

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKitPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestWeight",     returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit nicht verfügbar")
            return
        }
        let write: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]
        let read: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .bodyMass)!
        ]
        healthStore.requestAuthorization(toShare: write, read: read) { success, error in
            if let error = error {
                call.reject("Berechtigung fehlgeschlagen: \(error.localizedDescription)")
            } else {
                call.resolve(["granted": success])
            }
        }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit nicht verfügbar"); return
        }
        let startMs  = call.getDouble("startTime") ?? Double(Date().timeIntervalSince1970 * 1000 - 3600000)
        let durSec   = call.getDouble("duration")  ?? 3600
        let calories = call.getDouble("calories")  ?? 0
        let startDate = Date(timeIntervalSince1970: startMs / 1000)
        let endDate   = startDate.addingTimeInterval(durSec)

        let workout = HKWorkout(
            activityType: .traditionalStrengthTraining,
            start: startDate,
            end: endDate,
            duration: durSec,
            totalEnergyBurned: calories > 0
                ? HKQuantity(unit: .kilocalorie(), doubleValue: calories) : nil,
            totalDistance: nil,
            metadata: ["HKMetadataKeyExternalUUID": call.getString("sessionId") ?? ""]
        )
        healthStore.save(workout) { success, error in
            if let error = error {
                call.reject("Workout speichern fehlgeschlagen: \(error.localizedDescription)")
            } else {
                call.resolve(["saved": success])
            }
        }
    }

    @objc func saveWeight(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let kg = call.getDouble("weightKg") else {
            call.reject("Fehlender weightKg-Parameter oder HealthKit nicht verfügbar"); return
        }
        let type = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
            start: Date(), end: Date()
        )
        healthStore.save(sample) { success, error in
            if let error = error {
                call.reject("Gewicht speichern fehlgeschlagen: \(error.localizedDescription)")
            } else {
                call.resolve(["saved": success])
            }
        }
    }

    @objc func getLatestWeight(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit nicht verfügbar"); return
        }
        let type = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                call.reject("Abfrage fehlgeschlagen: \(error.localizedDescription)"); return
            }
            guard let s = samples?.first as? HKQuantitySample else {
                call.resolve(["weightKg": NSNull()]); return
            }
            call.resolve([
                "weightKg": s.quantity.doubleValue(for: .gramUnit(with: .kilo)),
                "date":     s.endDate.timeIntervalSince1970 * 1000
            ])
        }
        healthStore.execute(query)
    }
}
