/**
 * @file main.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { nanoid } from "nanoid";
import { createApp } from "./app.js";
import { getEnv, generatePublicUrl } from "./config/env.js";
import {
  CONNECTION_TIMING,
  WEBSOCKET_CONFIG,
  getProtocolVersion,
} from "./config/constants.js";
import { getTunnelVersion } from "./utils/version.js";

/**
 * Prints the startup banner to console.
 */
function printBanner(tunnelVersion: string): void {
  // Colors for terminal output
  const dim = "\x1b[2m";
  const blue = "\x1b[38;5;69m";
  const purple = "\x1b[38;5;135m";
  const white = "\x1b[97m";
  const reset = "\x1b[0m";

  const banner = `
                        ${white}-#####${reset}
                        ${white}#     #${reset}
${blue}       -####.${reset}           ${white}#     #${reset}              ${purple}-###+.${reset}
${blue}     .##    .${reset}        ${white}.. #     #....${reset}          ${purple}-   ##-${reset}
${blue}    -##    #.${reset}       ${white}#####     #####+${reset}         ${purple}--    #+.${reset}
${blue}   +#    ##-.${reset}       ${white}#              #${reset}         ${purple}.##    ##.${reset}
${blue}   #    ##.${reset}         ${white}#              #${reset}          ${purple}.+##   +.${reset}
${blue}   #   ##${reset}           ${white}#####     #####+${reset}            ${purple}.#   #-${reset}
${blue}   #   +-${reset}               ${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   +-${reset}               ${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   +-${reset}       ${blue}---.${reset}    ${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   +-${reset}       ${blue}+ ###.${reset}  ${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   +-${reset}       ${blue}+    ##-${reset}${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   +-${reset}       ${blue}-##    #${reset}${white}#     #${reset}                  ${purple}#   #-${reset}
${blue}   #   ##.${reset}      ${blue}.###    ${reset}${white}#     #.${reset}               ${purple}.+#   #.${reset}
${blue}   #    ##+${reset}     ${blue}+    ###${reset}${white}#     #####+${reset}          ${purple}.##    #.${reset}
${blue}   -##    ##.${reset}   ${blue}+  ##+. ${reset}${white}#          #${reset}         ${purple}-#     #+.${reset}
${blue}    .##     .${reset}   ${blue}-##+.${reset}   ${white}+##        #${reset}         ${purple}-    ##-${reset}
${blue}     .-##  #.${reset}            ${white}-#########+${reset}         ${purple}-+ -#+.${reset}

       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Tunnel Server
       ${dim}Secure WebSocket Relay for Remote Agents${reset}

       ${dim}v${tunnelVersion}  ·  © 2025 Roman Barinov  ·  FSL-1.1-NC${reset}
       ${dim}https://github.com/tiflis-io/tiflis-code${reset}
`;
  process.stdout.write(banner);
}
import { createLogger } from "./infrastructure/logging/pino-logger.js";
import {
  InMemoryWorkstationRegistry,
  InMemoryClientRegistry,
  InMemoryHttpClientRegistry,
} from "./infrastructure/persistence/in-memory-registry.js";
import { registerHealthRoute } from "./infrastructure/http/health-route.js";
import { registerWatchApiRoute } from "./infrastructure/http/watch-api-route.js";
import { registerWebClientRoute } from "./infrastructure/http/web-client-route.js";
import {
  ConnectionHandler,
  WebSocketServerWrapper,
} from "./infrastructure/websocket/index.js";
import {
  RegisterWorkstationUseCase,
  ConnectClientUseCase,
  ForwardMessageUseCase,
  HandleDisconnectionUseCase,
  HttpClientOperationsUseCase,
} from "./application/index.js";

/**
 * Bootstraps and starts the tunnel server.
 */
async function bootstrap(): Promise<void> {
  // Get versions
  const tunnelVersion = getTunnelVersion();
  const protocolVersion = getProtocolVersion();

  // Print startup banner
  printBanner(tunnelVersion);

  // Load configuration
  const env = getEnv();

  // Create logger
  const logger = createLogger({
    name: "tiflis-tunnel",
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === "development",
  });

  logger.info(
    {
      version: tunnelVersion,
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      trustProxy: env.TRUST_PROXY,
      publicBaseUrl: env.PUBLIC_BASE_URL ?? "auto",
    },
    "Starting tunnel server"
  );

  // Create registries
  const workstationRegistry = new InMemoryWorkstationRegistry();
  const clientRegistry = new InMemoryClientRegistry();
  const httpClientRegistry = new InMemoryHttpClientRegistry();

  // Create use cases
  const registerWorkstation = new RegisterWorkstationUseCase({
    workstationRegistry,
    generateTunnelId: () => nanoid(12),
    getPublicUrl: () => generatePublicUrl(env),
    expectedApiKey: env.TUNNEL_REGISTRATION_API_KEY,
    logger,
  });

  const connectClient = new ConnectClientUseCase({
    workstationRegistry,
    clientRegistry,
    logger,
  });

  const forwardMessage = new ForwardMessageUseCase({
    workstationRegistry,
    clientRegistry,
    httpClientRegistry,
    logger,
  });

  const httpClientOperations = new HttpClientOperationsUseCase({
    workstationRegistry,
    httpClientRegistry,
    logger,
  });

  const handleDisconnection = new HandleDisconnectionUseCase({
    workstationRegistry,
    clientRegistry,
    httpClientRegistry,
    forwardMessage,
    logger,
  });

  // Create connection handler
  const connectionHandler = new ConnectionHandler({
    workstationRegistry,
    clientRegistry,
    registerWorkstation,
    connectClient,
    forwardMessage,
    handleDisconnection,
    tunnelVersion,
    protocolVersion,
    logger,
  });

  // Create Fastify app
  const app = createApp({ env, logger });

  // Register health routes
  registerHealthRoute(
    app,
    { version: tunnelVersion },
    { workstationRegistry, clientRegistry }
  );

  // Register Watch HTTP API routes
  registerWatchApiRoute(app, {
    httpClientOperations,
    logger,
  });

  // Register Web Client static files (if configured)
  if (env.WEB_CLIENT_PATH) {
    await registerWebClientRoute(app, {
      webClientPath: env.WEB_CLIENT_PATH,
      logger,
    });
  }

  // Create WebSocket server
  const wsServer = new WebSocketServerWrapper(
    {
      path: env.WS_PATH || WEBSOCKET_CONFIG.PATH,
      heartbeatIntervalMs: CONNECTION_TIMING.TIMEOUT_CHECK_INTERVAL_MS,
      connectionTimeoutMs: CONNECTION_TIMING.PONG_TIMEOUT_MS,
    },
    {
      connectionHandler,
      onTimeoutCheck: () => {
        handleDisconnection.handleTimeoutCheck(
          CONNECTION_TIMING.PONG_TIMEOUT_MS
        );
      },
      logger,
    }
  );

  // Start server
  try {
    await app.listen({ port: env.PORT, host: env.HOST });

    // Attach WebSocket server to HTTP server
    wsServer.attach(app.server);

    logger.info(
      {
        address: `http://${env.HOST}:${env.PORT}`,
        wsPath: env.WS_PATH || WEBSOCKET_CONFIG.PATH,
      },
      "🚀 Tunnel server is running"
    );
  } catch (error) {
    logger.fatal({ error }, "Failed to start server");
    process.exit(1);
  }

  // Graceful shutdown with overall timeout
  const SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds max for entire shutdown

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received");

    // Force exit after timeout
    const forceExitTimer = setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Close WebSocket server first (has its own 5s timeout)
      await wsServer.close();

      // Close HTTP server
      await app.close();

      clearTimeout(forceExitTimer);
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error({ error }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Unhandled rejection handler
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled rejection");
  });

  // Uncaught exception handler
  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    process.exit(1);
  });
}

// Run the server
bootstrap().catch((error: unknown) => {
  console.error("Failed to bootstrap:", error);
  process.exit(1);
});
