//
//  QRScannerView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI
@preconcurrency import AVFoundation

/// Camera-based QR code scanner view using AVFoundation.
/// Scans for QR codes and returns the decoded string via callback.
struct QRScannerView: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var cameraPermissionGranted = false
    @State private var showPermissionAlert = false
    @State private var isScanning = true

    var body: some View {
        NavigationStack {
            ZStack {
                if cameraPermissionGranted {
                    // Camera preview with QR detection
                    QRCameraPreview(
                        isScanning: $isScanning,
                        onCodeDetected: { code in
                            // Haptic feedback on successful scan
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)

                            isScanning = false
                            onScan(code)
                        }
                    )
                    .ignoresSafeArea()

                    // Scanning overlay
                    ScannerOverlayView()
                } else {
                    // Permission not granted view
                    VStack(spacing: 24) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.secondary)

                        Text("Camera Access Required")
                            .font(.headline)

                        Text("To scan QR codes, please allow camera access in Settings.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)

                        Button("Open Settings") {
                            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(settingsURL)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                }
            }
            .navigationTitle("Scan QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                checkCameraPermission()
            }
        }
    }

    private func checkCameraPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraPermissionGranted = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    cameraPermissionGranted = granted
                }
            }
        case .denied, .restricted:
            cameraPermissionGranted = false
        @unknown default:
            cameraPermissionGranted = false
        }
    }
}

/// Camera preview using AVCaptureSession for QR code detection.
private struct QRCameraPreview: UIViewRepresentable {
    @Binding var isScanning: Bool
    let onCodeDetected: (String) -> Void

    func makeUIView(context: Context) -> QRCameraUIView {
        let view = QRCameraUIView()
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: QRCameraUIView, context: Context) {
        if isScanning {
            uiView.startScanning()
        } else {
            uiView.stopScanning()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeDetected: onCodeDetected)
    }

    class Coordinator: NSObject, QRCameraDelegate {
        let onCodeDetected: (String) -> Void

        init(onCodeDetected: @escaping (String) -> Void) {
            self.onCodeDetected = onCodeDetected
        }

        func didDetectCode(_ code: String) {
            onCodeDetected(code)
        }
    }
}

/// Protocol for QR camera delegate.
private protocol QRCameraDelegate: AnyObject {
    func didDetectCode(_ code: String)
}

/// UIView that manages AVCaptureSession for QR scanning.
private class QRCameraUIView: UIView {
    weak var delegate: QRCameraDelegate?

    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isSessionRunning = false
    private let sessionQueue = DispatchQueue(label: "io.tiflis.TiflisCode.qrscanner")

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupSession()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupSession()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    private func setupSession() {
        let session = AVCaptureSession()
        session.sessionPreset = .high

        // Get back camera
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            return
        }

        // Create input
        guard let input = try? AVCaptureDeviceInput(device: device) else {
            return
        }

        if session.canAddInput(input) {
            session.addInput(input)
        }

        // Create metadata output for QR codes
        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            output.metadataObjectTypes = [.qr]
        }

        // Create preview layer
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = bounds
        layer.addSublayer(previewLayer)

        self.captureSession = session
        self.previewLayer = previewLayer
    }

    func startScanning() {
        guard let session = captureSession, !isSessionRunning else { return }

        sessionQueue.async { [weak self] in
            session.startRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = true
            }
        }
    }

    func stopScanning() {
        guard let session = captureSession, isSessionRunning else { return }

        sessionQueue.async { [weak self] in
            session.stopRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = false
            }
        }
    }
}

extension QRCameraUIView: AVCaptureMetadataOutputObjectsDelegate {
    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              metadataObject.type == .qr,
              let stringValue = metadataObject.stringValue else {
            return
        }

        // Only process tiflis:// URLs
        if stringValue.hasPrefix("tiflis://") {
            DispatchQueue.main.async { [weak self] in
                self?.stopScanning()
                self?.delegate?.didDetectCode(stringValue)
            }
        }
    }
}

/// Visual overlay for the scanner with targeting frame.
private struct ScannerOverlayView: View {
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height) * 0.7

            ZStack {
                // Dimmed background with cutout
                Color.black.opacity(0.5)
                    .mask(
                        Rectangle()
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .frame(width: size, height: size)
                                    .blendMode(.destinationOut)
                            )
                    )

                // Corner brackets
                RoundedRectangle(cornerRadius: 20)
                    .stroke(
                        LinearGradient(
                            colors: [Color(hex: 0x2E5AA6), Color(hex: 0x6F4ABF)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 4
                    )
                    .frame(width: size, height: size)

                // Instructions
                VStack {
                    Spacer()

                    Text("Point at QR code from workstation")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 80)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    QRScannerView { code in
        print("Scanned: \(code)")
    }
}
