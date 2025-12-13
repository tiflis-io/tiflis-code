/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.di

import android.content.Context
import io.tiflis.code.data.audio.AudioPlayerService
import io.tiflis.code.data.audio.AudioRecorderService
import io.tiflis.code.data.network.NetworkMonitor
import io.tiflis.code.data.storage.DeviceIdManager
import io.tiflis.code.data.storage.SecureStorage
import io.tiflis.code.data.websocket.CommandSender
import io.tiflis.code.data.websocket.ConnectionService
import io.tiflis.code.data.websocket.WebSocketClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module providing application-wide dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideWebSocketClient(): WebSocketClient {
        return WebSocketClient()
    }

    @Provides
    @Singleton
    fun provideSecureStorage(
        @ApplicationContext context: Context
    ): SecureStorage {
        return SecureStorage(context)
    }

    @Provides
    @Singleton
    fun provideDeviceIdManager(
        @ApplicationContext context: Context
    ): DeviceIdManager {
        return DeviceIdManager(context)
    }

    @Provides
    @Singleton
    fun provideCommandSender(
        webSocketClient: WebSocketClient
    ): CommandSender {
        return CommandSender(webSocketClient)
    }

    @Provides
    @Singleton
    fun provideConnectionService(
        webSocketClient: WebSocketClient,
        secureStorage: SecureStorage,
        deviceIdManager: DeviceIdManager,
        commandSender: CommandSender
    ): ConnectionService {
        return ConnectionService(webSocketClient, secureStorage, deviceIdManager, commandSender)
    }

    @Provides
    @Singleton
    fun provideAudioRecorderService(
        @ApplicationContext context: Context
    ): AudioRecorderService {
        return AudioRecorderService(context)
    }

    @Provides
    @Singleton
    fun provideAudioPlayerService(): AudioPlayerService {
        return AudioPlayerService()
    }

    @Provides
    @Singleton
    fun provideNetworkMonitor(
        @ApplicationContext context: Context
    ): NetworkMonitor {
        return NetworkMonitor(context)
    }
}
