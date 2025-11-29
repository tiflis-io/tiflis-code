/**
 * @file main.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { nanoid } from 'nanoid';
import { createApp } from './app.js';
import { getEnv, generatePublicUrl } from './config/env.js';
import {
  CONNECTION_TIMING,
  WEBSOCKET_CONFIG,
  SERVER_VERSION,
} from './config/constants.js';
import { createLogger } from './infrastructure/logging/pino-logger.js';
import {
  InMemoryWorkstationRegistry,
  InMemoryClientRegistry,
} from './infrastructure/persistence/in-memory-registry.js';
import { registerHealthRoute } from './infrastructure/http/health-route.js';
import {
  ConnectionHandler,
  WebSocketServerWrapper,
} from './infrastructure/websocket/index.js';
import {
  RegisterWorkstationUseCase,
  ConnectClientUseCase,
  ForwardMessageUseCase,
  HandleDisconnectionUseCase,
} from './application/index.js';

/**
 * Bootstraps and starts the tunnel server.
 */
async function bootstrap(): Promise<void> {
  // Load configuration
  const env = getEnv();

  // Create logger
  const logger = createLogger({
    name: 'tiflis-tunnel',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  logger.info(
    {
      version: SERVER_VERSION,
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      trustProxy: env.TRUST_PROXY,
      publicBaseUrl: env.PUBLIC_BASE_URL ?? 'auto',
    },
    'Starting tunnel server'
  );

  // Create registries
  const workstationRegistry = new InMemoryWorkstationRegistry();
  const clientRegistry = new InMemoryClientRegistry();

  // Create use cases
  const registerWorkstation = new RegisterWorkstationUseCase({
    workstationRegistry,
    generateTunnelId: () => nanoid(12),
    getPublicUrl: (tunnelId) => generatePublicUrl(env, tunnelId),
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
    logger,
  });

  const handleDisconnection = new HandleDisconnectionUseCase({
    workstationRegistry,
    clientRegistry,
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
    logger,
  });

  // Create Fastify app
  const app = createApp({ env, logger });

  // Register health routes
  registerHealthRoute(
    app,
    { version: SERVER_VERSION },
    { workstationRegistry, clientRegistry }
  );

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
        handleDisconnection.handleTimeoutCheck(CONNECTION_TIMING.PONG_TIMEOUT_MS);
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
      '🚀 Tunnel server is running'
    );
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      // Close WebSocket server first
      await wsServer.close();

      // Close HTTP server
      await app.close();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled rejection');
  });

  // Uncaught exception handler
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });
}

// Run the server
bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap:', error);
  process.exit(1);
});

