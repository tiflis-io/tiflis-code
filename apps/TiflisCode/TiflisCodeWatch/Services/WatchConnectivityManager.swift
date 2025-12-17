//
//  WatchConnectivityManager.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
@preconcurrency import WatchConnectivity
import Combine

/// Relay connection state from iPhone
struct RelayConnectionState {
    let isConnected: Bool
    let workstationOnline: Bool
    let error: String?
}

/// Manages WatchConnectivity communication from watchOS side
/// Receives credentials and settings from paired iPhone
/// Note: Uses @unchecked Sendable because WCSession delegate methods are called from arbitrary threads
@MainActor
final class WatchConnectivityManager: NSObject, ObservableObject, @unchecked Sendable {
    /// Shared instance for app-wide access
    static let shared = WatchConnectivityManager()

    // MARK: - Sync State

    /// Sync state for credential synchronization
    enum SyncState: Equatable {
        case idle
        case syncing(attempt: Int)
        case error(String)
        case success
    }

    /// Current sync state for UI feedback
    @Published private(set) var syncState: SyncState = .idle

    // MARK: - Published Properties

    /// Whether iPhone is reachable
    @Published private(set) var isPhoneReachable = false

    /// Stored credentials from iPhone
    @Published private(set) var credentials: WatchCredentials?

    /// Settings synced from iPhone
    @Published private(set) var settings: WatchSettings?

    /// Connection status from iPhone (when using iPhone's connection)
    @Published private(set) var phoneConnectionStatus: WatchConnectionStatus?

    /// Error message if credential sync failed
    @Published private(set) var credentialError: String?

    // MARK: - Relay Properties

    /// Relayed message from iPhone (WebSocket messages forwarded from server)
    @Published private(set) var relayedMessage: [String: Any]?

    /// Relay connection state from iPhone
    @Published private(set) var relayConnectionState: RelayConnectionState?

    /// Whether credentials have been received
    var hasCredentials: Bool {
        credentials?.isValid ?? false
    }

    #if DEBUG
    /// Debug: Returns description of WCSession activation state
    var activationStateDescription: String {
        guard let session = session else { return "no session" }
        switch session.activationState {
        case .notActivated: return "notActivated"
        case .inactive: return "inactive"
        case .activated: return "activated"
        @unknown default: return "unknown"
        }
    }

    /// Debug: Returns number of keys in receivedApplicationContext
    var receivedContextKeyCount: Int {
        session?.receivedApplicationContext.count ?? -1
    }

    /// Debug: Returns number of keys in shared App Group defaults
    var sharedDefaultsKeyCount: Int {
        guard let shared = sharedDefaults else { return -1 }
        let url = shared.string(forKey: sharedTunnelURLKey) ?? ""
        let id = shared.string(forKey: sharedTunnelIdKey) ?? ""
        let key = shared.string(forKey: sharedAuthKeyKey) ?? ""
        var count = 0
        if !url.isEmpty { count += 1 }
        if !id.isEmpty { count += 1 }
        if !key.isEmpty { count += 1 }
        return count
    }
    #endif

    // MARK: - Retry Configuration

    private let maxRetryAttempts = 8
    private let initialRetryDelay: TimeInterval = 0.5
    private var retryTask: Task<Void, Never>?

    // MARK: - Private

    private var session: WCSession?
    private let userDefaults: UserDefaults

    // Keys for storing credentials locally
    private let tunnelURLKey = "watch_tunnelURL"
    private let tunnelIdKey = "watch_tunnelId"
    private let authKeyKey = "watch_authKey"
    private let ttsEnabledKey = "watch_ttsEnabled"
    private let sttLanguageKey = "watch_sttLanguage"

    // App Group for shared storage (fallback for Simulator)
    private let appGroupId = "group.io.tiflis.TiflisCode"
    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // Keys for App Group shared storage
    private let sharedTunnelURLKey = "shared_tunnelURL"
    private let sharedTunnelIdKey = "shared_tunnelId"
    private let sharedAuthKeyKey = "shared_authKey"

    // MARK: - Initialization

    private override init() {
        self.userDefaults = .standard
        super.init()
        NSLog("⌚️ WatchConnectivityManager init started")
        loadStoredCredentials()
        loadStoredSettings()

        // Also check App Group shared defaults on init (for Simulator)
        checkSharedDefaultsSync()
        NSLog("⌚️ WatchConnectivityManager init completed, hasCredentials=%d", hasCredentials ? 1 : 0)
    }

    /// Synchronous check of App Group shared defaults (called from init)
    private func checkSharedDefaultsSync() {
        guard let shared = sharedDefaults else {
            NSLog("⌚️ checkSharedDefaultsSync: could not access App Group defaults")
            return
        }

        let tunnelURL = shared.string(forKey: sharedTunnelURLKey) ?? ""
        let tunnelId = shared.string(forKey: sharedTunnelIdKey) ?? ""
        let authKey = shared.string(forKey: sharedAuthKeyKey) ?? ""

        NSLog("⌚️ checkSharedDefaultsSync: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
              tunnelURL.isEmpty ? "empty" : "present",
              tunnelId.isEmpty ? "empty" : tunnelId,
              authKey.count)

        if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
            // Store directly without Task since we're in init
            userDefaults.set(tunnelURL, forKey: tunnelURLKey)
            userDefaults.set(tunnelId, forKey: tunnelIdKey)
            userDefaults.set(authKey, forKey: authKeyKey)
            userDefaults.synchronize()

            credentials = WatchCredentials(tunnelURL: tunnelURL, tunnelId: tunnelId, authKey: authKey)
            NSLog("⌚️ checkSharedDefaultsSync: credentials loaded from App Group!")
        }
    }

    // MARK: - Public Methods

    /// Activates WatchConnectivity session
    /// Call this from App init
    func activate() {
        NSLog("⌚️ WatchConnectivityManager.activate() called")

        guard WCSession.isSupported() else {
            NSLog("⌚️ WatchConnectivity is not supported")
            return
        }

        NSLog("⌚️ WCSession.isSupported() = true, activating...")
        session = WCSession.default
        session?.delegate = self
        session?.activate()
        NSLog("⌚️ WatchConnectivity session activate() called, waiting for delegate callback...")
    }

    /// Forces a check of application context for credentials
    /// Call this if credentials haven't synced
    func checkApplicationContext() {
        NSLog("⌚️ checkApplicationContext called")

        // First try WatchConnectivity context
        if let session = session, session.activationState == .activated {
            let context = session.receivedApplicationContext
            NSLog("⌚️ checkApplicationContext: receivedApplicationContext has %d keys", context.count)

            if !context.isEmpty {
                let tunnelURL = context[WatchConnectivityKey.tunnelURL] as? String ?? ""
                let tunnelId = context[WatchConnectivityKey.tunnelId] as? String ?? ""
                let authKey = context[WatchConnectivityKey.authKey] as? String ?? ""

                NSLog("⌚️ checkApplicationContext: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
                      tunnelURL.isEmpty ? "empty" : "present",
                      tunnelId.isEmpty ? "empty" : tunnelId,
                      authKey.count)

                if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
                    let creds = WatchCredentials(tunnelURL: tunnelURL, tunnelId: tunnelId, authKey: authKey)
                    Task { @MainActor in
                        self.storeCredentials(creds)
                        NSLog("⌚️ checkApplicationContext: credentials stored from WC context!")
                    }
                    return
                }
            }
        } else {
            NSLog("⌚️ checkApplicationContext: session not activated, skipping WC context check")
        }

        // Fallback: Check App Group shared defaults (works in Simulator)
        checkSharedDefaults()
    }

    /// Checks App Group shared UserDefaults for credentials
    /// This is a fallback for Simulator where WatchConnectivity is unreliable
    func checkSharedDefaults() {
        NSLog("⌚️ checkSharedDefaults called")

        guard let shared = sharedDefaults else {
            NSLog("⌚️ checkSharedDefaults: could not access App Group defaults")
            return
        }

        let tunnelURL = shared.string(forKey: sharedTunnelURLKey) ?? ""
        let tunnelId = shared.string(forKey: sharedTunnelIdKey) ?? ""
        let authKey = shared.string(forKey: sharedAuthKeyKey) ?? ""

        NSLog("⌚️ checkSharedDefaults: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
              tunnelURL.isEmpty ? "empty" : "present",
              tunnelId.isEmpty ? "empty" : tunnelId,
              authKey.count)

        if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
            let creds = WatchCredentials(tunnelURL: tunnelURL, tunnelId: tunnelId, authKey: authKey)
            Task { @MainActor in
                self.storeCredentials(creds)
                NSLog("⌚️ checkSharedDefaults: credentials stored from App Group!")
            }
        } else {
            NSLog("⌚️ checkSharedDefaults: no valid credentials in shared defaults")
        }
    }

    /// Requests credentials from iPhone
    func requestCredentials() {
        NSLog("⌚️ requestCredentials called")

        guard let session = session, session.activationState == .activated else {
            NSLog("⌚️ requestCredentials: session not activated")
            credentialError = "Not connected to iPhone"
            return
        }

        // First, check if we already have credentials in received application context
        let context = session.receivedApplicationContext
        NSLog("⌚️ requestCredentials: checking context with %d keys", context.count)
        if !context.isEmpty {
            let tunnelURL = context[WatchConnectivityKey.tunnelURL] as? String ?? ""
            let tunnelId = context[WatchConnectivityKey.tunnelId] as? String ?? ""
            let authKey = context[WatchConnectivityKey.authKey] as? String ?? ""
            NSLog("⌚️ requestCredentials: context tunnelURL=%@, tunnelId=%@, authKey length=%d",
                  tunnelURL.isEmpty ? "empty" : "present",
                  tunnelId.isEmpty ? "empty" : tunnelId,
                  authKey.count)

            if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
                let creds = WatchCredentials(tunnelURL: tunnelURL, tunnelId: tunnelId, authKey: authKey)
                storeCredentials(creds)
                NSLog("⌚️ requestCredentials: found credentials in context, stored!")
                print("⌚️ Credentials found in application context")
                return
            }
        }

        let message = WatchConnectivityMessage.credentialsRequest()
        NSLog("⌚️ requestCredentials: isReachable=%d", session.isReachable ? 1 : 0)

        if session.isReachable {
            print("⌚️ Requesting credentials from iPhone (reachable)...")
            NSLog("⌚️ requestCredentials: sending message to iPhone (no reply handler)...")
            credentialError = nil

            // Send message WITHOUT replyHandler - iOS will send credentials back via separate message
            // This works better in Simulator where replyHandler often fails with WCErrorCodeGenericError
            session.sendMessage(message, replyHandler: nil) { error in
                let errorMessage = error.localizedDescription
                NSLog("⌚️ requestCredentials: sendMessage error: %@", errorMessage)
                DispatchQueue.main.async { [weak self] in
                    self?.credentialError = "Failed to request: \(errorMessage)"
                    print("⌚️ Failed to request credentials: \(errorMessage)")
                }
            }
        } else {
            print("⌚️ iPhone not reachable, queuing request...")
            NSLog("⌚️ requestCredentials: iPhone not reachable, using transferUserInfo")
            credentialError = nil
            // Transfer as user info, will be delivered when iPhone becomes available
            session.transferUserInfo(message)
            print("⌚️ Credentials request queued (iPhone not reachable)")
        }
    }

    /// Starts credential sync with automatic retry logic
    /// Use this instead of requestCredentials() for robust syncing
    func startCredentialSync() {
        // Cancel any existing retry task
        retryTask?.cancel()
        retryTask = nil

        // First, check application context directly (most reliable in Simulator)
        checkApplicationContext()

        // If we already have credentials after context check, no need to sync
        if hasCredentials {
            syncState = .success
            NSLog("⌚️ startCredentialSync: already have credentials")
            return
        }

        NSLog("⌚️ startCredentialSync: starting retry loop")

        retryTask = Task { @MainActor [weak self] in
            guard let self = self else { return }

            for attempt in 1...self.maxRetryAttempts {
                // Check cancellation
                guard !Task.isCancelled else {
                    NSLog("⌚️ startCredentialSync: cancelled at attempt %d", attempt)
                    break
                }

                // Check if we got credentials during previous attempt
                guard !self.hasCredentials else {
                    NSLog("⌚️ startCredentialSync: credentials received, stopping")
                    self.syncState = .success
                    break
                }

                NSLog("⌚️ startCredentialSync: attempt %d/%d", attempt, self.maxRetryAttempts)
                self.syncState = .syncing(attempt: attempt)

                // Try multiple methods:
                // 1. Check application context again (may have been updated)
                self.checkApplicationContext()

                // 2. If still no credentials, request from iPhone
                if !self.hasCredentials {
                    self.requestCredentials()
                }

                // Wait with exponential backoff (0.5s, 1s, 2s, 4s...) capped at 30s
                let delay = min(self.initialRetryDelay * pow(2.0, Double(attempt - 1)), 30.0)
                NSLog("⌚️ startCredentialSync: waiting %.1fs before next attempt", delay)

                try? await Task.sleep(for: .seconds(delay))
            }

            // Final check after all attempts
            await MainActor.run { [weak self] in
                guard let self = self else { return }
                if !self.hasCredentials && !Task.isCancelled {
                    NSLog("⌚️ startCredentialSync: failed after all attempts")
                    self.syncState = .error("Could not sync after \(self.maxRetryAttempts) attempts. Make sure iPhone app is open.")
                }
            }
        }
    }

    /// Cancels ongoing credential sync
    func cancelCredentialSync() {
        NSLog("⌚️ cancelCredentialSync called")
        retryTask?.cancel()
        retryTask = nil
        if case .syncing = syncState {
            syncState = .idle
        }
    }

    /// Gets the stored tunnel URL
    func getTunnelURL() -> String? {
        credentials?.tunnelURL ?? userDefaults.string(forKey: tunnelURLKey)
    }

    /// Gets the stored tunnel ID
    func getTunnelId() -> String? {
        credentials?.tunnelId ?? userDefaults.string(forKey: tunnelIdKey)
    }

    /// Gets the stored auth key
    func getAuthKey() -> String? {
        credentials?.authKey ?? userDefaults.string(forKey: authKeyKey)
    }

    /// Gets whether TTS is enabled
    func getTTSEnabled() -> Bool {
        settings?.ttsEnabled ?? userDefaults.bool(forKey: ttsEnabledKey)
    }

    /// Gets the STT language
    func getSTTLanguage() -> String {
        settings?.sttLanguage ?? userDefaults.string(forKey: sttLanguageKey) ?? "en"
    }

    // MARK: - Relay Methods

    /// Requests iPhone to connect to WebSocket server
    func requestRelayConnect() {
        guard let session = session, session.activationState == .activated else {
            NSLog("⌚️ requestRelayConnect: session not activated")
            return
        }

        let message = WatchConnectivityMessage.relayConnect()
        NSLog("⌚️ requestRelayConnect: sending to iPhone")

        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { error in
                NSLog("⌚️ requestRelayConnect: sendMessage failed: %@", error.localizedDescription)
            }
        } else {
            session.transferUserInfo(message)
            NSLog("⌚️ requestRelayConnect: iPhone not reachable, queued via transferUserInfo")
        }
    }

    /// Requests iPhone to disconnect from WebSocket server
    func requestRelayDisconnect() {
        guard let session = session, session.activationState == .activated else {
            return
        }

        let message = WatchConnectivityMessage.relayDisconnect()
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        }
    }

    /// Sends a message to be relayed to WebSocket server via iPhone
    func sendRelayMessage(_ payload: [String: Any]) {
        guard let session = session, session.activationState == .activated else {
            NSLog("⌚️ sendRelayMessage: session not activated")
            return
        }

        let message = WatchConnectivityMessage.relayMessage(payload: payload)

        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { error in
                NSLog("⌚️ sendRelayMessage: sendMessage failed: %@", error.localizedDescription)
            }
        } else {
            session.transferUserInfo(message)
            NSLog("⌚️ sendRelayMessage: iPhone not reachable, queued via transferUserInfo")
        }
    }

    /// Requests state sync via iPhone relay
    func requestRelaySync() {
        guard let session = session, session.activationState == .activated else {
            return
        }

        let message = WatchConnectivityMessage.relaySync()
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        } else {
            session.transferUserInfo(message)
        }
    }

    // MARK: - Private Methods

    private func loadStoredCredentials() {
        let tunnelURL = userDefaults.string(forKey: tunnelURLKey) ?? ""
        let tunnelId = userDefaults.string(forKey: tunnelIdKey) ?? ""
        let authKey = userDefaults.string(forKey: authKeyKey) ?? ""

        NSLog("⌚️ loadStoredCredentials: tunnelURL=%@, tunnelId=%@, authKey length=%d",
              tunnelURL.isEmpty ? "empty" : "present", tunnelId, authKey.count)

        if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
            credentials = WatchCredentials(
                tunnelURL: tunnelURL,
                tunnelId: tunnelId,
                authKey: authKey
            )
            NSLog("⌚️ loadStoredCredentials: credentials set, hasCredentials=%d", hasCredentials ? 1 : 0)
        } else {
            NSLog("⌚️ loadStoredCredentials: no credentials found")
        }
    }

    private func loadStoredSettings() {
        // Only load if we have stored settings
        if userDefaults.object(forKey: ttsEnabledKey) != nil {
            let ttsEnabled = userDefaults.bool(forKey: ttsEnabledKey)
            let sttLanguage = userDefaults.string(forKey: sttLanguageKey) ?? "en"
            settings = WatchSettings(ttsEnabled: ttsEnabled, sttLanguage: sttLanguage)
            print("⌚️ Loaded stored settings")
        }
    }

    private func storeCredentials(_ creds: WatchCredentials) {
        NSLog("⌚️ storeCredentials: storing tunnelURL=%@, tunnelId=%@",
              creds.tunnelURL.isEmpty ? "empty" : "present", creds.tunnelId)
        userDefaults.set(creds.tunnelURL, forKey: tunnelURLKey)
        userDefaults.set(creds.tunnelId, forKey: tunnelIdKey)
        userDefaults.set(creds.authKey, forKey: authKeyKey)
        userDefaults.synchronize() // Force immediate save
        credentials = creds
        credentialError = nil

        // Update sync state and cancel retry task
        syncState = .success
        retryTask?.cancel()
        retryTask = nil

        NSLog("⌚️ storeCredentials: credentials stored and published!")
        print("⌚️ Credentials stored")
    }

    private func storeSettings(_ settings: WatchSettings) {
        userDefaults.set(settings.ttsEnabled, forKey: ttsEnabledKey)
        userDefaults.set(settings.sttLanguage, forKey: sttLanguageKey)
        self.settings = settings
        print("⌚️ Settings stored: ttsEnabled=\(settings.ttsEnabled), sttLanguage=\(settings.sttLanguage)")
    }

    private func handleReceivedMessage(_ message: [String: Any]) {
        // First check if this is application context (no messageType)
        if message[WatchConnectivityKey.messageType] == nil {
            handleApplicationContext(message)
            return
        }

        guard let messageType = WatchConnectivityMessage.messageType(from: message) else {
            print("⌚️ Received unknown message type")
            return
        }

        switch messageType {
        case .credentialsResponse:
            if let error = message[WatchConnectivityKey.error] as? String {
                credentialError = error
                print("⌚️ Received credential error: \(error)")
            } else if let creds = WatchCredentials.from(dictionary: message) {
                storeCredentials(creds)
                print("⌚️ Received credentials from iPhone")
            }

        case .settingsUpdate:
            if let settings = WatchSettings.from(dictionary: message) {
                storeSettings(settings)
                print("⌚️ Received settings update from iPhone")
            }

        case .connectionStatusUpdate:
            if let status = WatchConnectionStatus.from(dictionary: message) {
                phoneConnectionStatus = status
                print("⌚️ Received connection status: connected=\(status.isConnected), workstationOnline=\(status.workstationOnline)")
            }

        case .credentialsRequest:
            // This is an outgoing message type, ignore if received
            break

        // MARK: - Relay Message Handling

        case .relayResponse:
            // Forward the relayed WebSocket message to subscribers
            if let payload = message[WatchConnectivityKey.relayPayload] as? [String: Any] {
                let messageType = payload["type"] as? String ?? "unknown"
                NSLog("⌚️ Received relayed message from iPhone: %@", messageType)
                relayedMessage = payload
            }

        case .relayConnectionState:
            // Handle connection state update from iPhone
            let isConnected = message[WatchConnectivityKey.isConnected] as? Bool ?? false
            let workstationOnline = message[WatchConnectivityKey.workstationOnline] as? Bool ?? false
            let error = message[WatchConnectivityKey.error] as? String

            NSLog("⌚️ Received relay connection state: connected=%d, online=%d, error=%@",
                  isConnected ? 1 : 0, workstationOnline ? 1 : 0, error ?? "none")

            relayConnectionState = RelayConnectionState(
                isConnected: isConnected,
                workstationOnline: workstationOnline,
                error: error
            )

        case .relayConnect, .relayDisconnect, .relayMessage, .relaySync:
            // These are outgoing message types from Watch, ignore if received
            break
        }
    }

    private func handleApplicationContext(_ context: [String: Any]) {
        // Extract credentials from application context
        let tunnelURL = context[WatchConnectivityKey.tunnelURL] as? String ?? ""
        let tunnelId = context[WatchConnectivityKey.tunnelId] as? String ?? ""
        let authKey = context[WatchConnectivityKey.authKey] as? String ?? ""

        if !tunnelURL.isEmpty && !tunnelId.isEmpty && !authKey.isEmpty {
            let creds = WatchCredentials(
                tunnelURL: tunnelURL,
                tunnelId: tunnelId,
                authKey: authKey
            )
            storeCredentials(creds)
            print("⌚️ Received credentials from application context")
        }

        // Extract settings
        if let ttsEnabled = context[WatchConnectivityKey.ttsEnabled] as? Bool,
           let sttLanguage = context[WatchConnectivityKey.sttLanguage] as? String {
            let settings = WatchSettings(ttsEnabled: ttsEnabled, sttLanguage: sttLanguage)
            storeSettings(settings)
            print("⌚️ Received settings from application context")
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        // Capture values outside Task to avoid data race
        let isReachable = session.isReachable
        let context = session.receivedApplicationContext
        let storedURL = UserDefaults.standard.string(forKey: "watch_tunnelURL") ?? ""
        let storedId = UserDefaults.standard.string(forKey: "watch_tunnelId") ?? ""
        let storedKey = UserDefaults.standard.string(forKey: "watch_authKey") ?? ""
        let hasCredsLocally = !storedURL.isEmpty && !storedId.isEmpty && !storedKey.isEmpty

        // Log immediately for debugging
        NSLog("⌚️ Watch WCSession activation: state=%d, isReachable=%d, contextKeys=%d, hasLocalCreds=%d",
              activationState.rawValue, isReachable ? 1 : 0, context.count, hasCredsLocally ? 1 : 0)

        // Log context contents for debugging
        if !context.isEmpty {
            let contextURL = context[WatchConnectivityKey.tunnelURL] as? String ?? ""
            let contextId = context[WatchConnectivityKey.tunnelId] as? String ?? ""
            let contextKey = context[WatchConnectivityKey.authKey] as? String ?? ""
            NSLog("⌚️ Watch context details: tunnelURL=%@, tunnelId=%@, authKey=%d chars",
                  contextURL.isEmpty ? "empty" : "present", contextId, contextKey.count)
        } else {
            NSLog("⌚️ Watch: receivedApplicationContext is EMPTY")
        }

        Task { @MainActor in
            if let error = error {
                NSLog("⌚️ Watch WCSession activation failed: %@", error.localizedDescription)
                print("⌚️ WatchConnectivity activation failed: \(error)")
                self.credentialError = "Connection failed: \(error.localizedDescription)"
                return
            }

            print("⌚️ WatchConnectivity activated: \(activationState.rawValue)")
            NSLog("⌚️ Watch WCSession activated successfully")
            self.isPhoneReachable = isReachable

            // Check received application context for credentials FIRST
            if !context.isEmpty {
                NSLog("⌚️ Watch found application context with %d keys", context.count)
                self.handleApplicationContext(context)
            } else {
                NSLog("⌚️ Watch: no application context received")
            }

            // After handling context, check if we now have credentials
            // Only request if we still don't have them
            if !self.hasCredentials {
                NSLog("⌚️ Watch: still no credentials after context check, requesting from iPhone")
                self.requestCredentials()
            } else {
                NSLog("⌚️ Watch: has valid credentials now, skipping request")
            }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        // Capture values outside Task to avoid data race
        let isReachable = session.isReachable

        Task { @MainActor in
            self.isPhoneReachable = isReachable
            NSLog("⌚️ iPhone reachability changed: %d, hasCredentials: %d",
                  isReachable ? 1 : 0, self.hasCredentials ? 1 : 0)

            // Start credential sync when iPhone becomes reachable if we don't have credentials
            if isReachable && !self.hasCredentials {
                NSLog("⌚️ iPhone became reachable without credentials, starting sync")
                self.startCredentialSync()
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        // Log immediately before MainActor dispatch
        let msgType = message[WatchConnectivityKey.messageType] as? String ?? "no-type"
        NSLog("⌚️ didReceiveMessage (no reply): type=%@, keys=%d", msgType, message.count)

        // Use nonisolated(unsafe) to bypass Sendable check for [String: Any]
        // This is safe because we immediately dispatch to MainActor
        nonisolated(unsafe) let messageCopy = message

        Task { @MainActor in
            self.handleReceivedMessage(messageCopy)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        // Log immediately before MainActor dispatch
        let msgType = message[WatchConnectivityKey.messageType] as? String ?? "no-type"
        NSLog("⌚️ didReceiveMessage (WITH reply): type=%@, keys=%d", msgType, message.count)

        // Use nonisolated(unsafe) to bypass Sendable check for [String: Any]
        nonisolated(unsafe) let messageCopy = message

        Task { @MainActor in
            self.handleReceivedMessage(messageCopy)
        }

        // Reply immediately outside the Task
        replyHandler([:])
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        // Log immediately before MainActor dispatch
        let msgType = userInfo[WatchConnectivityKey.messageType] as? String ?? "no-type"
        NSLog("⌚️ didReceiveUserInfo: type=%@, keys=%d", msgType, userInfo.count)

        // Use nonisolated(unsafe) to bypass Sendable check for [String: Any]
        nonisolated(unsafe) let userInfoCopy = userInfo

        Task { @MainActor in
            self.handleReceivedMessage(userInfoCopy)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        // Log immediately before MainActor dispatch
        let tunnelURL = applicationContext[WatchConnectivityKey.tunnelURL] as? String ?? ""
        let tunnelId = applicationContext[WatchConnectivityKey.tunnelId] as? String ?? ""
        let authKey = applicationContext[WatchConnectivityKey.authKey] as? String ?? ""
        NSLog("⌚️ didReceiveApplicationContext: keys=%d, tunnelURL=%@, tunnelId=%@, authKey=%d chars",
              applicationContext.count,
              tunnelURL.isEmpty ? "empty" : "present",
              tunnelId.isEmpty ? "empty" : tunnelId,
              authKey.count)

        // Use nonisolated(unsafe) to bypass Sendable check for [String: Any]
        nonisolated(unsafe) let contextCopy = applicationContext

        Task { @MainActor in
            self.handleApplicationContext(contextCopy)
        }
    }
}
