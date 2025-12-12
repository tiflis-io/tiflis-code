/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.settings

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import io.tiflis.code.R
import io.tiflis.code.domain.models.ConnectionCredentials
import io.tiflis.code.util.DeepLinkParser
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val TAG = "QRScannerScreen"

/**
 * QR Scanner screen using CameraX and ML Kit.
 * Scans magic link QR codes for connection setup.
 * Mirrors the iOS QR Scanner functionality.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRScannerScreen(
    onCredentialsScanned: (ConnectionCredentials) -> Unit,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    var flashEnabled by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var scanningEnabled by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val cameraExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
        onDispose {
            cameraExecutor.shutdown()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_scan_qr)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            flashEnabled = !flashEnabled
                            camera?.cameraControl?.enableTorch(flashEnabled)
                        }
                    ) {
                        Icon(
                            if (flashEnabled) Icons.Default.FlashOn else Icons.Default.FlashOff,
                            contentDescription = if (flashEnabled) "Flash on" else "Flash off"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (hasCameraPermission) {
                // Camera preview
                AndroidView(
                    factory = { ctx ->
                        PreviewView(ctx).apply {
                            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                    update = { previewView ->
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
                        cameraProviderFuture.addListener({
                            val cameraProvider = cameraProviderFuture.get()

                            val preview = Preview.Builder()
                                .build()
                                .also {
                                    it.surfaceProvider = previewView.surfaceProvider
                                }

                            val resolutionSelector = androidx.camera.core.resolutionselector.ResolutionSelector.Builder()
                                .setAspectRatioStrategy(
                                    androidx.camera.core.resolutionselector.AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY
                                )
                                .build()

                            val imageAnalysis = ImageAnalysis.Builder()
                                .setResolutionSelector(resolutionSelector)
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()
                                .also { analysis ->
                                    analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                                        if (scanningEnabled) {
                                            processImage(imageProxy) { result ->
                                                result?.let { credentials ->
                                                    scanningEnabled = false
                                                    onCredentialsScanned(credentials)
                                                    onNavigateBack()
                                                }
                                            }
                                        } else {
                                            imageProxy.close()
                                        }
                                    }
                                }

                            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                            try {
                                cameraProvider.unbindAll()
                                camera = cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    cameraSelector,
                                    preview,
                                    imageAnalysis
                                )
                            } catch (e: Exception) {
                                Log.e(TAG, "Camera binding failed", e)
                                errorMessage = "Failed to start camera: ${e.message}"
                            }
                        }, ContextCompat.getMainExecutor(context))
                    }
                )

                // Scanning overlay
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    // Darkened background
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.5f))
                    )

                    // Scanning frame
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(250.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.Transparent)
                                .border(
                                    width = 3.dp,
                                    color = MaterialTheme.colorScheme.primary,
                                    shape = RoundedCornerShape(16.dp)
                                )
                        )

                        Text(
                            text = "Point camera at QR code",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyLarge
                        )

                        Text(
                            text = "Scan the magic link QR code from your workstation",
                            color = Color.White.copy(alpha = 0.7f),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                // Error message
                errorMessage?.let { error ->
                    Snackbar(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(16.dp)
                    ) {
                        Text(error)
                    }
                }
            } else {
                // No camera permission
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Camera permission required",
                        style = MaterialTheme.typography.titleMedium
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Please grant camera permission to scan QR codes",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }
                    ) {
                        Text("Grant Permission")
                    }
                }
            }
        }
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private fun processImage(
    imageProxy: ImageProxy,
    onResult: (ConnectionCredentials?) -> Unit
) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }

    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    val scanner = BarcodeScanning.getClient()

    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            for (barcode in barcodes) {
                if (barcode.valueType == Barcode.TYPE_URL || barcode.valueType == Barcode.TYPE_TEXT) {
                    val rawValue = barcode.rawValue ?: continue

                    // Try to parse as magic link
                    val credentials = DeepLinkParser.parseDeepLink(rawValue)
                    if (credentials != null) {
                        Log.d(TAG, "Scanned valid magic link")
                        onResult(credentials)
                        imageProxy.close()
                        return@addOnSuccessListener
                    }
                }
            }
            imageProxy.close()
        }
        .addOnFailureListener { e ->
            Log.e(TAG, "Barcode scanning failed", e)
            imageProxy.close()
        }
}
