/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Monitors network connectivity changes.
 * Used to detect when network changes (WiFi <-> Cellular) which may cause
 * WebSocket connections to become stale without explicit closure.
 */
@Singleton
class NetworkMonitor @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "NetworkMonitor"
    }

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _isConnected = MutableStateFlow(checkCurrentConnectivity())
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _networkType = MutableStateFlow(getCurrentNetworkType())
    val networkType: StateFlow<NetworkType> = _networkType.asStateFlow()

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    /**
     * Flow that emits when network changes occur.
     * This includes both connectivity changes and network type changes (WiFi <-> Cellular).
     */
    val networkChanges: Flow<NetworkChange> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "Network available: $network")
                val newType = getNetworkType(network)
                val oldType = _networkType.value
                _isConnected.value = true
                _networkType.value = newType

                // Emit change if network type changed (e.g., WiFi -> Cellular)
                if (oldType != NetworkType.None && oldType != newType) {
                    Log.d(TAG, "Network type changed: $oldType -> $newType")
                    trySend(NetworkChange.TypeChanged(oldType, newType))
                } else {
                    trySend(NetworkChange.Connected(newType))
                }
            }

            override fun onLost(network: Network) {
                Log.d(TAG, "Network lost: $network")
                _isConnected.value = checkCurrentConnectivity()
                if (!_isConnected.value) {
                    _networkType.value = NetworkType.None
                    trySend(NetworkChange.Disconnected)
                }
            }

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) {
                val newType = getNetworkTypeFromCapabilities(networkCapabilities)
                val oldType = _networkType.value

                if (oldType != newType && newType != NetworkType.None) {
                    Log.d(TAG, "Network capabilities changed: $oldType -> $newType")
                    _networkType.value = newType
                    trySend(NetworkChange.TypeChanged(oldType, newType))
                }
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, callback)
        networkCallback = callback

        awaitClose {
            Log.d(TAG, "Unregistering network callback")
            connectivityManager.unregisterNetworkCallback(callback)
            networkCallback = null
        }
    }.distinctUntilChanged()

    private fun checkCurrentConnectivity(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun getCurrentNetworkType(): NetworkType {
        val network = connectivityManager.activeNetwork ?: return NetworkType.None
        return getNetworkType(network)
    }

    private fun getNetworkType(network: Network): NetworkType {
        val capabilities = connectivityManager.getNetworkCapabilities(network)
            ?: return NetworkType.None
        return getNetworkTypeFromCapabilities(capabilities)
    }

    private fun getNetworkTypeFromCapabilities(capabilities: NetworkCapabilities): NetworkType {
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkType.WiFi
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkType.Cellular
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkType.Ethernet
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> NetworkType.VPN
            else -> NetworkType.Other
        }
    }
}

enum class NetworkType {
    None,
    WiFi,
    Cellular,
    Ethernet,
    VPN,
    Other
}

sealed class NetworkChange {
    data class Connected(val type: NetworkType) : NetworkChange()
    data object Disconnected : NetworkChange()
    data class TypeChanged(val oldType: NetworkType, val newType: NetworkType) : NetworkChange()
}
