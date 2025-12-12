# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC. See LICENSE file for details.

# ProGuard rules for TiflisCode Android app

# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.tiflis.code.**$$serializer { *; }
-keepclassmembers class com.tiflis.code.** {
    *** Companion;
}
-keepclasseswithmembers class com.tiflis.code.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep domain models
-keep class com.tiflis.code.domain.models.** { *; }

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Keep Hilt
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ComponentSupplier { *; }

# Keep WebSocket listener callbacks
-keepclassmembers class * extends okhttp3.WebSocketListener {
    public void on*(...);
}

# Keep Compose
-keep class androidx.compose.** { *; }

# Keep CameraX
-keep class androidx.camera.** { *; }

# Keep ML Kit Barcode
-keep class com.google.mlkit.** { *; }
