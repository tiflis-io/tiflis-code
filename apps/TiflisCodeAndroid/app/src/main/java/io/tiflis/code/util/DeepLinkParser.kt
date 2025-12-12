/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.util

import android.net.Uri
import android.util.Base64
import android.util.Log
import io.tiflis.code.domain.models.ConnectionCredentials
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Parses deep links for TiflisCode.
 *
 * Magic link format: tiflis://connect?data=<base64_encoded_json>
 *
 * Decoded JSON payload:
 * {
 *   "tunnel_id": "Z6q62aKz-F96",
 *   "url": "wss://tunnel.example.com/ws",
 *   "key": "workstation-auth-key"
 * }
 */
object DeepLinkParser {

    private const val TAG = "DeepLinkParser"
    private const val SCHEME = "tiflis"
    private const val HOST = "connect"
    private const val DATA_PARAM = "data"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    /**
     * Parse a magic link URI into connection credentials.
     *
     * @param uri The URI to parse
     * @return ConnectionCredentials if parsing succeeds, null otherwise
     */
    fun parse(uri: Uri?): ConnectionCredentials? {
        if (uri == null) return null

        // Validate scheme and host
        if (uri.scheme != SCHEME || uri.host != HOST) {
            Log.d(TAG, "Invalid scheme or host: ${uri.scheme}://${uri.host}")
            return null
        }

        // Get data parameter
        val data = uri.getQueryParameter(DATA_PARAM)
        if (data.isNullOrBlank()) {
            Log.d(TAG, "Missing data parameter")
            return null
        }

        return parseBase64Data(data)
    }

    /**
     * Parse base64 encoded JSON data into connection credentials.
     *
     * @param base64Data The base64 encoded JSON string
     * @return ConnectionCredentials if parsing succeeds, null otherwise
     */
    fun parseBase64Data(base64Data: String): ConnectionCredentials? {
        return try {
            // Decode base64
            val jsonString = String(Base64.decode(base64Data, Base64.DEFAULT))
            Log.d(TAG, "Decoded JSON: $jsonString")

            // Parse JSON
            val jsonObject = json.parseToJsonElement(jsonString).jsonObject

            val tunnelId = jsonObject["tunnel_id"]?.jsonPrimitive?.content
            val url = jsonObject["url"]?.jsonPrimitive?.content
            val key = jsonObject["key"]?.jsonPrimitive?.content

            if (tunnelId == null || url == null || key == null) {
                Log.e(TAG, "Missing required fields in JSON")
                return null
            }

            ConnectionCredentials(
                tunnelUrl = url,
                tunnelId = tunnelId,
                authKey = key
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse deep link data", e)
            null
        }
    }

    /**
     * Parse a deep link string (for QR code scanning).
     *
     * @param link The deep link string (tiflis://connect?data=...)
     * @return ConnectionCredentials if parsing succeeds, null otherwise
     */
    fun parseDeepLink(link: String): ConnectionCredentials? {
        return try {
            val uri = Uri.parse(link)
            parse(uri)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse deep link string", e)
            null
        }
    }

    /**
     * Create a magic link URI from connection credentials.
     * Useful for sharing/QR code generation.
     *
     * @param credentials The connection credentials
     * @return URI string in magic link format
     */
    fun createMagicLink(credentials: ConnectionCredentials): String {
        val jsonPayload = """
            {
                "tunnel_id": "${credentials.tunnelId}",
                "url": "${credentials.tunnelUrl}",
                "key": "${credentials.authKey}"
            }
        """.trimIndent()

        val base64Data = Base64.encodeToString(
            jsonPayload.toByteArray(),
            Base64.NO_WRAP or Base64.URL_SAFE
        )

        return "$SCHEME://$HOST?$DATA_PARAM=$base64Data"
    }
}
