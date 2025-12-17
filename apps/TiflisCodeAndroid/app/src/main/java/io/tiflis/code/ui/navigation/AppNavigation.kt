/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.navigation

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import io.tiflis.code.MainActivity
import io.tiflis.code.domain.models.SessionType
import io.tiflis.code.ui.chat.ChatScreen
import io.tiflis.code.ui.settings.QRScannerScreen
import io.tiflis.code.ui.settings.SettingsScreen
import io.tiflis.code.ui.sidebar.SidebarScreen
import io.tiflis.code.ui.splash.SplashScreen
import io.tiflis.code.ui.state.AppState
import io.tiflis.code.ui.terminal.TerminalScreen
import kotlinx.coroutines.launch

/**
 * Navigation routes for the app.
 */
sealed class Screen(val route: String) {
    data object Splash : Screen("splash")
    data object Supervisor : Screen("supervisor")
    data object Settings : Screen("settings")
    data object QRScanner : Screen("qr_scanner")

    companion object {
        const val AGENT_ROUTE = "agent/{sessionId}"
        const val TERMINAL_ROUTE = "terminal/{sessionId}"

        fun agentRoute(sessionId: String) = "agent/$sessionId"
        fun terminalRoute(sessionId: String) = "terminal/$sessionId"
    }
}

/**
 * Main navigation component with adaptive layout.
 * - Phone: Modal navigation drawer
 * - Tablet: Permanent navigation rail/drawer
 */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun AppNavigation(
    appState: AppState = hiltViewModel()
) {
    val context = LocalContext.current
    val activity = context as? MainActivity

    // Calculate window size class for adaptive layout
    val windowSizeClass = activity?.let { calculateWindowSizeClass(it) }
    val isExpandedScreen = windowSizeClass?.widthSizeClass == WindowWidthSizeClass.Expanded

    val navController = rememberNavController()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    // Hide keyboard when drawer starts opening (either by button tap or gesture)
    // Use targetValue to detect opening intent immediately, not after animation completes
    LaunchedEffect(drawerState.targetValue) {
        if (drawerState.targetValue == DrawerValue.Open) {
            keyboardController?.hide()
            focusManager.clearFocus()
        }
    }

    // Current route - need to build actual route with sessionId for proper matching
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.let { entry ->
        val route = entry.destination.route
        val sessionId = entry.arguments?.getString("sessionId")
        when {
            route == Screen.AGENT_ROUTE && sessionId != null -> Screen.agentRoute(sessionId)
            route == Screen.TERMINAL_ROUTE && sessionId != null -> Screen.terminalRoute(sessionId)
            else -> route
        }
    }

    // Auto-connect on app start if credentials exist
    LaunchedEffect(Unit) {
        if (appState.hasCredentials()) {
            appState.connect()
        }
    }

    // Navigation callback
    val onNavigate: (String) -> Unit = { route ->
        Log.d("AppNavigation", "Navigating to: $route, current: $currentRoute")
        // For agent/terminal routes, simply navigate without complex back stack manipulation
        // This ensures switching between different sessions works correctly
        navController.navigate(route) {
            // Only pop to supervisor for non-session routes (settings, etc.)
            // For session routes, just ensure we don't create duplicate entries
            if (!route.startsWith("agent/") && !route.startsWith("terminal/")) {
                popUpTo(Screen.Supervisor.route) {
                    saveState = true
                }
            }
            launchSingleTop = true
        }
        scope.launch { drawerState.close() }
    }

    // Session selection callback
    val onSessionSelected: (String, SessionType) -> Unit = { sessionId, type ->
        when (type) {
            SessionType.SUPERVISOR -> onNavigate(Screen.Supervisor.route)
            SessionType.TERMINAL -> onNavigate(Screen.terminalRoute(sessionId))
            else -> onNavigate(Screen.agentRoute(sessionId))
        }
    }

    if (isExpandedScreen) {
        // Tablet: Permanent drawer/rail layout
        PermanentNavigationDrawer(
            drawerContent = {
                PermanentDrawerSheet(
                    modifier = Modifier.width(DrawerDefaults.MaximumDrawerWidth)
                ) {
                    SidebarScreen(
                        appState = appState,
                        currentRoute = currentRoute,
                        onSessionSelected = onSessionSelected,
                        onSettingsClick = { onNavigate(Screen.Settings.route) }
                    )
                }
            }
        ) {
            NavigationContent(
                navController = navController,
                appState = appState,
                onMenuClick = { /* No-op for tablet */ }
            )
        }
    } else {
        // Phone: Modal drawer
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = true,
            drawerContent = {
                ModalDrawerSheet {
                    SidebarScreen(
                        appState = appState,
                        currentRoute = currentRoute,
                        onSessionSelected = onSessionSelected,
                        onSettingsClick = { onNavigate(Screen.Settings.route) }
                    )
                }
            }
        ) {
            NavigationContent(
                navController = navController,
                appState = appState,
                onMenuClick = { scope.launch { drawerState.open() } }
            )
        }
    }
}

@Composable
private fun NavigationContent(
    navController: NavHostController,
    appState: AppState,
    onMenuClick: () -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Splash.route,
        modifier = Modifier.fillMaxSize()
    ) {
        // Splash screen
        composable(Screen.Splash.route) {
            SplashScreen(
                onSplashComplete = {
                    navController.navigate(Screen.Supervisor.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                }
            )
        }

        // Supervisor chat
        composable(Screen.Supervisor.route) {
            ChatScreen(
                appState = appState,
                sessionId = "supervisor",
                sessionType = SessionType.SUPERVISOR,
                onMenuClick = onMenuClick
            )
        }

        // Agent chat
        composable(
            route = Screen.AGENT_ROUTE,
            arguments = listOf(navArgument("sessionId") { type = NavType.StringType })
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
            val session = appState.sessions.collectAsState().value.find { it.id == sessionId }

            ChatScreen(
                appState = appState,
                sessionId = sessionId,
                sessionType = session?.type ?: SessionType.CLAUDE,
                sessionName = session?.displayName,
                onMenuClick = onMenuClick,
                onSessionTerminated = {
                    // Navigate back to supervisor after session termination
                    navController.navigate(Screen.Supervisor.route) {
                        popUpTo(Screen.Supervisor.route) { inclusive = true }
                    }
                }
            )
        }

        // Terminal
        composable(
            route = Screen.TERMINAL_ROUTE,
            arguments = listOf(navArgument("sessionId") { type = NavType.StringType })
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable

            TerminalScreen(
                appState = appState,
                sessionId = sessionId,
                onMenuClick = onMenuClick,
                onSessionTerminated = {
                    // Navigate back to supervisor after session termination
                    navController.navigate(Screen.Supervisor.route) {
                        popUpTo(Screen.Supervisor.route) { inclusive = true }
                    }
                }
            )
        }

        // Settings
        composable(Screen.Settings.route) {
            SettingsScreen(
                appState = appState,
                onMenuClick = onMenuClick,
                onNavigateBack = { navController.popBackStack() },
                onScanQR = { navController.navigate(Screen.QRScanner.route) }
            )
        }

        // QR Scanner
        composable(Screen.QRScanner.route) {
            QRScannerScreen(
                onCredentialsScanned = { credentials ->
                    appState.connect(credentials)
                },
                onNavigateBack = { navController.popBackStack() }
            )
        }
    }
}
