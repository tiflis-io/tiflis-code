//
//  WatchConnectivityManager.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
@preconcurrency import WatchConnectivity
import Combine

/// Manages WatchConnectivity communication from iOS side
/// Sends credentials and settings to paired Apple Watch
/// Note: @unchecked Sendable because we manage thread safety via dedicated queue
final class WatchConnectivityManager: NSObject, ObservableObject, @unchecked Sendable {
    /// Shared instance for app-wide access
    static let shared = WatchConnectivityManager()

    /// Whether Watch app is reachable
    @Published private(set) var isWatchReachable = false

    /// Whether Watch app is paired
    @Published private(set) var isWatchPaired = false

    /// Whether Watch app is installed
    @Published private(set) var isWatchAppInstalled = false

    // MARK: - Private

    private var session: WCSession?
    private let queue = DispatchQueue(label: "io.tiflis.WatchConnectivity", qos: .userInitiated)

    // MARK: - Initialization

    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Activates WatchConnectivity session
    /// Call this from AppDelegate or App init
    func activate() {
        guard WCSession.isSupported() else {
            NSLog("📱 WatchConnectivity is not supported on this device")
            return
        }

        queue.async { [weak self] in
            guard let self = self else { return }
            let session = WCSession.default
            session.delegate = self
            session.activate()
            self.session = session
            NSLog("📱 WatchConnectivity session activating on queue...")
        }
    }

    /// Sends current credentials to Watch
    func sendCredentials() {
        queue.async { [weak self] in
            self?.doSendCredentials()
        }
    }

    private func doSendCredentials() {
        guard let session = session, session.activationState == .activated else {
            NSLog("📱 Cannot send credentials: session not activated")
            return
        }

        // Don't check isPaired - it may report incorrectly
        // If session is activated, we can try to send

        let tunnelURL = UserDefaults.standard.string(forKey: "tunnelURL") ?? ""
        let tunnelId = UserDefaults.standard.string(forKey: "tunnelId") ?? ""
        let authKey = KeychainManager().getAuthKey() ?? ""

        let credentials = WatchCredentials(
            tunnelURL: tunnelURL,
            tunnelId: tunnelId,
            authKey: authKey
        )

        if credentials.isValid {
            let message = WatchConnectivityMessage.credentialsResponse(credentials: credentials)
            sendMessage(message)
            updateApplicationContext()
            NSLog("📱 Credentials sent to Watch (message + context)")
        } else {
            let message = WatchConnectivityMessage.credentialsError(error: "No credentials configured on iPhone")
            sendMessage(message)
            NSLog("📱 No valid credentials to send")
        }
    }

    /// Sends current settings to Watch
    func sendSettings() {
        queue.async { [weak self] in
            self?.doSendSettings()
        }
    }

    private func doSendSettings() {
        guard let session = session, session.activationState == .activated else {
            NSLog("📱 Cannot send settings: session not activated")
            return
        }

        let ttsEnabled = UserDefaults.standard.bool(forKey: "ttsEnabled")
        let sttLanguage = UserDefaults.standard.string(forKey: "sttLanguage") ?? "en"

        let settings = WatchSettings(ttsEnabled: ttsEnabled, sttLanguage: sttLanguage)
        let message = WatchConnectivityMessage.settingsUpdate(settings: settings)
        sendMessage(message)
        NSLog("📱 Settings sent to Watch: ttsEnabled=%d, sttLanguage=%@", ttsEnabled ? 1 : 0, sttLanguage)
    }

    /// Sends connection status to Watch
    func sendConnectionStatus(isConnected: Bool, workstationOnline: Bool) {
        queue.async { [weak self] in
            guard let session = self?.session, session.activationState == .activated else {
                return
            }

            let status = WatchConnectionStatus(isConnected: isConnected, workstationOnline: workstationOnline)
            let message = WatchConnectivityMessage.connectionStatusUpdate(status: status)
            self?.sendMessage(message)
        }
    }

    /// Updates application context for background sync
    func updateApplicationContext() {
        queue.async { [weak self] in
            self?.doUpdateApplicationContext()
        }
    }

    private func doUpdateApplicationContext() {
        guard let session = session, session.activationState == .activated else {
            NSLog("📱 Cannot update context: session not activated")
            return
        }

        // Don't check isPaired or isWatchAppInstalled - they may report incorrectly
        // Just try to update and handle error if it fails

        let tunnelURL = UserDefaults.standard.string(forKey: "tunnelURL") ?? ""
        let tunnelId = UserDefaults.standard.string(forKey: "tunnelId") ?? ""
        let authKey = KeychainManager().getAuthKey() ?? ""
        let ttsEnabled = UserDefaults.standard.bool(forKey: "ttsEnabled")
        let sttLanguage = UserDefaults.standard.string(forKey: "sttLanguage") ?? "en"

        NSLog("📱 Preparing context: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
              tunnelURL.isEmpty ? "empty" : "present", tunnelId, authKey.count)

        let context: [String: Any] = [
            WatchConnectivityKey.tunnelURL: tunnelURL,
            WatchConnectivityKey.tunnelId: tunnelId,
            WatchConnectivityKey.authKey: authKey,
            WatchConnectivityKey.ttsEnabled: ttsEnabled,
            WatchConnectivityKey.sttLanguage: sttLanguage
        ]

        do {
            try session.updateApplicationContext(context)
            NSLog("📱 Application context updated successfully")
        } catch {
            NSLog("📱 Failed to update application context: %@", error.localizedDescription)
        }
    }

    // MARK: - Private Methods

    private func sendMessage(_ message: [String: Any]) {
        guard let session = session, session.activationState == .activated else {
            NSLog("📱 Cannot send message: session not activated")
            return
        }

        // Always try sendMessage first, fall back to transferUserInfo on error
        // Don't rely on isReachable as it may report false even when Watch is reachable
        session.sendMessage(message, replyHandler: nil) { [weak self] error in
            NSLog("📱 sendMessage failed: %@, falling back to transferUserInfo", error.localizedDescription)
            // Fall back to transferUserInfo which queues for delivery
            self?.session?.transferUserInfo(message)
        }
        NSLog("📱 Message sent via sendMessage")
    }

    private func handleCredentialsRequest(replyHandler: (([String: Any]) -> Void)?) {
        NSLog("📱 Handling credentials request...")

        let tunnelURL = UserDefaults.standard.string(forKey: "tunnelURL") ?? ""
        let tunnelId = UserDefaults.standard.string(forKey: "tunnelId") ?? ""
        let authKey = KeychainManager().getAuthKey() ?? ""

        NSLog("📱 Credentials: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
              tunnelURL.isEmpty ? "empty" : "present",
              tunnelId.isEmpty ? "empty" : tunnelId,
              authKey.count)

        let credentials = WatchCredentials(
            tunnelURL: tunnelURL,
            tunnelId: tunnelId,
            authKey: authKey
        )

        if credentials.isValid {
            NSLog("📱 Replying with valid credentials")
            if let replyHandler = replyHandler {
                replyHandler(credentials.toDictionary())
            } else {
                // No reply handler, send as message
                let message = WatchConnectivityMessage.credentialsResponse(credentials: credentials)
                sendMessage(message)
            }
        } else {
            NSLog("📱 No valid credentials to send")
            if let replyHandler = replyHandler {
                replyHandler([WatchConnectivityKey.error: "No credentials configured on iPhone"])
            } else {
                let message = WatchConnectivityMessage.credentialsError(error: "No credentials configured on iPhone")
                sendMessage(message)
            }
        }
    }

    private func updatePublishedState(isPaired: Bool, isInstalled: Bool, isReachable: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isWatchPaired = isPaired
            self?.isWatchAppInstalled = isInstalled
            self?.isWatchReachable = isReachable
        }
    }

}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if let error = error {
            NSLog("📱 WatchConnectivity activation failed: %@", error.localizedDescription)
            return
        }

        NSLog("📱 WatchConnectivity activated: state=%d, isPaired=%d, isInstalled=%d, isReachable=%d",
              activationState.rawValue,
              session.isPaired ? 1 : 0,
              session.isWatchAppInstalled ? 1 : 0,
              session.isReachable ? 1 : 0)

        updatePublishedState(
            isPaired: session.isPaired,
            isInstalled: session.isWatchAppInstalled,
            isReachable: session.isReachable
        )

        // Update context and send credentials proactively on activation
        if activationState == .activated {
            doUpdateApplicationContext()
            // Also send credentials via message for faster delivery
            doSendCredentials()
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        NSLog("📱 WatchConnectivity session became inactive")
    }

    func sessionDidDeactivate(_ session: WCSession) {
        NSLog("📱 WatchConnectivity session deactivated, reactivating...")
        queue.async { [weak self] in
            self?.session?.activate()
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        NSLog("📱 Watch reachability changed: %d", session.isReachable ? 1 : 0)
        DispatchQueue.main.async { [weak self] in
            self?.isWatchReachable = session.isReachable
        }

        // When Watch becomes reachable, proactively send credentials
        // This helps work around simulator issues with updateApplicationContext
        if session.isReachable {
            NSLog("📱 Watch became reachable, sending credentials proactively")
            queue.async { [weak self] in
                self?.doSendCredentials()
            }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        NSLog("📱 didReceiveMessage (no reply): %d keys", message.count)

        guard let messageType = WatchConnectivityMessage.messageType(from: message) else {
            NSLog("📱 Unknown message type")
            return
        }

        NSLog("📱 Message type: %@", messageType.rawValue)

        switch messageType {
        case .credentialsRequest:
            handleCredentialsRequest(replyHandler: nil)

        default:
            break
        }
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        NSLog("📱 didReceiveMessage WITH replyHandler: %d keys", message.count)

        guard let messageType = WatchConnectivityMessage.messageType(from: message) else {
            NSLog("📱 Unknown message type, replying empty")
            replyHandler([:])
            return
        }

        NSLog("📱 Message type: %@", messageType.rawValue)

        switch messageType {
        case .credentialsRequest:
            // IMPORTANT: replyHandler must be called synchronously on the same thread
            // to avoid WCErrorCodeGenericError
            NSLog("📱 Handling credentials request synchronously...")

            let tunnelURL = UserDefaults.standard.string(forKey: "tunnelURL") ?? ""
            let tunnelId = UserDefaults.standard.string(forKey: "tunnelId") ?? ""
            let authKey = KeychainManager().getAuthKey() ?? ""

            NSLog("📱 Credentials: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
                  tunnelURL.isEmpty ? "empty" : "present",
                  tunnelId.isEmpty ? "empty" : tunnelId,
                  authKey.count)

            let credentials = WatchCredentials(
                tunnelURL: tunnelURL,
                tunnelId: tunnelId,
                authKey: authKey
            )

            if credentials.isValid {
                NSLog("📱 Replying with valid credentials")
                replyHandler(credentials.toDictionary())
            } else {
                NSLog("📱 No valid credentials to send")
                replyHandler([WatchConnectivityKey.error: "No credentials configured on iPhone"])
            }

        default:
            replyHandler([:])
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        NSLog("📱 didReceiveUserInfo: %d keys", userInfo.count)

        guard let messageType = WatchConnectivityMessage.messageType(from: userInfo) else {
            NSLog("📱 Unknown userInfo type")
            return
        }

        NSLog("📱 UserInfo type: %@", messageType.rawValue)

        switch messageType {
        case .credentialsRequest:
            handleCredentialsRequest(replyHandler: nil)

        default:
            break
        }
    }
}
