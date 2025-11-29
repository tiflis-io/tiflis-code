/**
 * @file main.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { getWorkstationVersion, getProtocolVersion } from './config/constants.js';
import { createLogger } from './infrastructure/logging/pino-logger.js';
import { registerHealthRoute } from './infrastructure/http/health-route.js';
import { initDatabase, closeDatabase } from './infrastructure/persistence/database/client.js';
import { InMemoryClientRegistry } from './infrastructure/persistence/in-memory-registry.js';
import { WorkstationMetadataRepository } from './infrastructure/persistence/repositories/workstation-metadata-repository.js';
import { TunnelClient } from './infrastructure/websocket/tunnel-client.js';
import { MessageRouter, type MessageHandlers } from './infrastructure/websocket/message-router.js';
import { FileSystemWorkspaceDiscovery } from './infrastructure/workspace/workspace-discovery.js';
import { PtyManager } from './infrastructure/terminal/pty-manager.js';
import { AgentSessionManager } from './infrastructure/agents/agent-session-manager.js';
import { AuthKey } from './domain/value-objects/auth-key.js';
import { SessionId } from './domain/value-objects/session-id.js';
import type { ChatMessage } from './domain/value-objects/chat-message.js';
import { isTerminalSession } from './domain/entities/terminal-session.js';
import { AuthenticateClientUseCase } from './application/commands/authenticate-client.js';
import { CreateSessionUseCase } from './application/commands/create-session.js';
import { TerminateSessionUseCase } from './application/commands/terminate-session.js';
import { ListSessionsUseCase } from './application/queries/list-sessions.js';
import { SubscriptionService } from './application/services/subscription-service.js';
import { MessageBroadcasterImpl } from './application/services/message-broadcaster-impl.js';
import { InMemorySessionManager } from './infrastructure/persistence/in-memory-session-manager.js';
import { SupervisorAgent } from './infrastructure/agents/supervisor/supervisor-agent.js';
import { AuthMessageSchema, getMessageType } from './protocol/schemas.js';

/**
 * Prints the startup banner to console.
 */
function printBanner(version: string): void {
  // Colors for terminal output
  const dim = '\x1b[2m';
  const blue = '\x1b[38;5;69m';
  const purple = '\x1b[38;5;135m';
  const white = '\x1b[97m';
  const reset = '\x1b[0m';

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

       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Workstation Server
       ${dim}Agent Sessions & Terminal Access Manager${reset}

       ${dim}v${version}  ·  © 2025 Roman Barinov  ·  MIT License${reset}
       ${dim}https://github.com/tiflis-io/tiflis-code${reset}
`;
  process.stdout.write(banner);
}

/**
 * Handles authentication messages received via tunnel.
 * Validates the message, authenticates the client, and sends the response back through the tunnel.
 */
function handleAuthMessageViaTunnel(
  data: unknown,
  tunnelClient: TunnelClient,
  authenticateClient: AuthenticateClientUseCase,
  logger: ReturnType<typeof createLogger>
): void {
  // Validate auth message with zod schema
  const authResult = AuthMessageSchema.safeParse(data);
  if (!authResult.success) {
    logger.warn(
      { errors: authResult.error.errors, message: JSON.stringify(data).slice(0, 100) },
      'Invalid auth message format'
    );
    return;
  }
  
  const authMessage = authResult.data;
  
  try {
    // For tunnel connections, no socket is needed
    // The client will be registered as a tunnel connection
    const result = authenticateClient.execute({
      // socket is undefined for tunnel connections
      authKey: authMessage.payload.auth_key,
      deviceId: authMessage.payload.device_id,
    });
    
    // Send response back through tunnel
    // The tunnel will forward to all clients, but the client will process the auth.success message
    const responseJson = JSON.stringify(result);
    if (tunnelClient.send(responseJson)) {
      logger.info(
        { deviceId: authMessage.payload.device_id },
        'Processed auth message via tunnel and sent response'
      );
    } else {
      logger.warn(
        { deviceId: authMessage.payload.device_id },
        'Failed to send auth response through tunnel'
      );
    }
  } catch (error) {
    logger.error(
      { error, deviceId: authMessage.payload.device_id },
      'Failed to authenticate client via tunnel'
    );
    // Send error response back through tunnel if possible
    const errorResponse = {
      type: 'auth.error',
      payload: {
        code: 'AUTHENTICATION_FAILED',
        message: error instanceof Error ? error.message : 'Authentication failed',
      },
    };
    tunnelClient.send(JSON.stringify(errorResponse));
  }
}

/**
 * Bootstraps and starts the workstation server.
 */
async function bootstrap(): Promise<void> {
  // Get versions from package.json
  const workstationVersion = getWorkstationVersion();
  const protocolVersion = getProtocolVersion();
  
  // Print startup banner
  printBanner(workstationVersion);

  // Load configuration
  const env = getEnv();

  // Create logger
  const logger = createLogger({
    name: 'tiflis-workstation',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  logger.info(
    {
      version: workstationVersion,
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      tunnelUrl: env.TUNNEL_URL,
      workspacesRoot: env.WORKSPACES_ROOT,
    },
    'Starting workstation server'
  );

  // Initialize database
  const dataDir = env.DATA_DIR;
  initDatabase(dataDir);
  logger.info({ dataDir }, 'Database initialized');

  // Create repositories
  const workstationMetadataRepository = new WorkstationMetadataRepository();

  // Create infrastructure components
  const clientRegistry = new InMemoryClientRegistry();
  const workspaceDiscovery = new FileSystemWorkspaceDiscovery({
    workspacesRoot: env.WORKSPACES_ROOT,
  });
  const ptyManager = new PtyManager({ logger });
  const agentSessionManager = new AgentSessionManager(logger);
  const sessionManager = new InMemorySessionManager({
    ptyManager,
    agentSessionManager,
    workspacesRoot: env.WORKSPACES_ROOT,
    logger,
  });

  // Create expected auth key
  const expectedAuthKey = new AuthKey(env.WORKSTATION_AUTH_KEY);

  // Create Supervisor Agent with LangGraph
  const supervisorAgent = new SupervisorAgent({
    sessionManager,
    agentSessionManager,
    workspaceDiscovery,
    workspacesRoot: env.WORKSPACES_ROOT,
    logger,
  });
  logger.info('Supervisor Agent initialized with LangGraph');

  // Tunnel client will be initialized below

  // Create use cases (using versions loaded at bootstrap start)
  const authenticateClient = new AuthenticateClientUseCase({
    clientRegistry,
    expectedAuthKey,
    workstationName: env.WORKSTATION_NAME,
    workstationVersion,
    protocolVersion,
    logger,
  });

  const listSessions = new ListSessionsUseCase({
    sessionManager,
    logger,
  });

  // Placeholder for late-bound dependencies
  let messageBroadcaster: MessageBroadcasterImpl | null = null;
  let createSession: CreateSessionUseCase | null = null;
  let terminateSession: TerminateSessionUseCase | null = null;
  let subscriptionService: SubscriptionService | null = null;

  // Create message handlers
  const createMessageHandlers = (): MessageHandlers => ({
    auth: (socket, message) => {
      const authMessage = message as { payload: { auth_key: string; device_id: string } };
      const result = authenticateClient.execute({
        socket,
        authKey: authMessage.payload.auth_key,
        deviceId: authMessage.payload.device_id,
      });
      socket.send(JSON.stringify(result));
      return Promise.resolve();
    },

    ping: (socket, message) => {
      const pingMessage = message as { timestamp: number };
      socket.send(JSON.stringify({ type: 'pong', timestamp: pingMessage.timestamp }));
      return Promise.resolve();
    },

    sync: (socket, message) => {
      const syncMessage = message as { id: string };
      const client = clientRegistry.getBySocket(socket);
      const subscriptions = client ? client.getSubscriptions() : [];
      const sessions = sessionManager.getSessionInfos();
      
      socket.send(JSON.stringify({
        type: 'sync.state',
        id: syncMessage.id,
        payload: { sessions, subscriptions },
      }));
      return Promise.resolve();
    },

    'supervisor.list_sessions': (socket, message) => {
      const listMessage = message as { id: string };
      const result = listSessions.execute({ requestId: listMessage.id });
      socket.send(JSON.stringify(result));
      return Promise.resolve();
    },

    // Natural language commands via LangGraph Supervisor Agent
    'supervisor.command': async (socket, message) => {
      const commandMessage = message as {
        id: string;
        payload: { command: string; session_id?: string };
      };
      const client = clientRegistry.getBySocket(socket);
      if (!client) {
        socket.send(JSON.stringify({
          type: 'error',
          id: commandMessage.id,
          payload: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
        }));
        return;
      }

      try {
        const result = await supervisorAgent.execute(
          commandMessage.payload.command,
          client.deviceId.value,
          commandMessage.payload.session_id
        );
        socket.send(JSON.stringify({
          type: 'response',
          id: commandMessage.id,
          payload: {
            output: result.output,
            session_id: result.sessionId,
          },
        }));
      } catch (error) {
        logger.error({ error }, 'Supervisor command execution failed');
        socket.send(JSON.stringify({
          type: 'error',
          id: commandMessage.id,
          payload: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        }));
      }
    },

    // Clear supervisor conversation history
    'supervisor.clear_context': (socket, message) => {
      const clearMessage = message as { id: string };
      const client = clientRegistry.getBySocket(socket);
      if (client) {
        supervisorAgent.clearHistory(client.deviceId.value);
        socket.send(JSON.stringify({
          type: 'response',
          id: clearMessage.id,
          payload: { success: true },
        }));
      }
      return Promise.resolve();
    },

    'supervisor.create_session': async (socket, message) => {
      if (!createSession || !messageBroadcaster || !subscriptionService) return;
      const createMessage = message as {
        id: string;
        payload: {
          session_type: 'cursor' | 'claude' | 'opencode' | 'terminal';
          workspace: string;
          project: string;
          worktree?: string;
        };
      };
      const result = await createSession.execute({
        requestId: createMessage.id,
        sessionType: createMessage.payload.session_type,
        workspace: createMessage.payload.workspace,
        project: createMessage.payload.project,
        worktree: createMessage.payload.worktree,
      });
      socket.send(JSON.stringify(result.response));
      messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));

      // Attach terminal output streaming for terminal sessions
      if (createMessage.payload.session_type === 'terminal') {
        const sessionId = new SessionId(result.response.payload.session_id as string);
        const session = sessionManager.getSession(sessionId);
        // Capture reference for the callback closure (guaranteed non-null from parent check)
        const bcaster = messageBroadcaster;
        if (session && isTerminalSession(session)) {
          session.onOutput((data: string) => {
            const outputEvent = {
              type: 'session.output',
              session_id: sessionId.value,
              payload: {
                content_type: 'terminal',
                data,
              },
            };
            // Send to all subscribers via broadcaster
            // Note: Direct socket.send() is not used for tunnel connections
            // All messages go through broadcaster which handles both direct and tunnel connections
            // Also broadcast through tunnel
            bcaster.broadcastToSubscribers(sessionId.value, JSON.stringify(outputEvent));
          });
        }
      }
    },

    'supervisor.terminate_session': async (socket, message) => {
      if (!terminateSession || !messageBroadcaster) return;
      const terminateMessage = message as {
        id: string;
        payload: { session_id: string };
      };
      const result = await terminateSession.execute({
        requestId: terminateMessage.id,
        sessionId: terminateMessage.payload.session_id,
      });
      socket.send(JSON.stringify(result.response));
      messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));
    },

    'session.subscribe': (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const subscribeMessage = message as { session_id: string };
      const client = clientRegistry.getBySocket(socket);
      if (client) {
        const result = subscriptionService.subscribe(
          client.deviceId.value,
          subscribeMessage.session_id
        );
        socket.send(JSON.stringify(result));
      }
      return Promise.resolve();
    },

    'session.unsubscribe': (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const unsubscribeMessage = message as { session_id: string };
      const client = clientRegistry.getBySocket(socket);
      if (client) {
        const result = subscriptionService.unsubscribe(
          client.deviceId.value,
          unsubscribeMessage.session_id
        );
        socket.send(JSON.stringify(result));
      }
      return Promise.resolve();
    },

    'session.execute': async (_socket, message) => {
      const execMessage = message as {
        id: string;
        session_id: string;
        payload: { content: string };
      };
      
      try {
        // Check if this is an agent session
        const agentSession = agentSessionManager.getSession(execMessage.session_id);
        if (agentSession) {
          await agentSessionManager.executeCommand(
            execMessage.session_id,
            execMessage.payload.content
          );
          return;
        }

        // Fall back to terminal input
        const sessionId = new SessionId(execMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session && isTerminalSession(session)) {
          ptyManager.write(session, execMessage.payload.content + '\n');
        }
      } catch (error) {
        logger.error({ error, sessionId: execMessage.session_id }, 'Failed to execute command');
      }
    },

    'session.input': (_socket, message) => {
      const inputMessage = message as { session_id: string; payload: { data: string } };
      try {
        const sessionId = new SessionId(inputMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session?.type === 'terminal') {
          ptyManager.write(session as Parameters<typeof ptyManager.write>[0], inputMessage.payload.data);
        }
      } catch {
        // Invalid session ID
      }
      return Promise.resolve();
    },

    'session.resize': (_socket, message) => {
      const resizeMessage = message as {
        session_id: string;
        payload: { cols: number; rows: number };
      };
      try {
        const sessionId = new SessionId(resizeMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session?.type === 'terminal') {
          ptyManager.resize(
            session as Parameters<typeof ptyManager.resize>[0],
            resizeMessage.payload.cols,
            resizeMessage.payload.rows
          );
        }
      } catch {
        // Invalid session ID
      }
      return Promise.resolve();
    },

    'session.replay': (_socket, _message) => {
      // TODO: Implement session replay
      logger.warn('session.replay not yet implemented');
      return Promise.resolve();
    },
  });

  // Create message router (for future use with direct WebSocket connections)
  // Currently unused as messages are routed through tunnel
  void new MessageRouter({
    logger,
    handlers: createMessageHandlers(),
  });

  // Create tunnel client
  const tunnelClient = new TunnelClient(
    {
      tunnelUrl: env.TUNNEL_URL,
      apiKey: env.TUNNEL_API_KEY,
      workstationName: env.WORKSTATION_NAME,
      authKey: env.WORKSTATION_AUTH_KEY,
      logger,
      metadataRepository: workstationMetadataRepository,
    },
    {
      onConnected: (tunnelId, publicUrl) => {
        logger.info({ tunnelId, publicUrl }, '🚀 Connected to tunnel');
        
        // Strip tunnel_id query parameter from URL if present (for backward compatibility)
        // URL should only contain the base address
        const urlObj = new URL(publicUrl);
        urlObj.searchParams.delete('tunnel_id');
        const cleanUrl = urlObj.toString();
        
        // Generate and display magic link for mobile clients
        // Magic link uses base64-encoded JSON payload
        const payload = {
          tunnel_id: tunnelId,
          url: cleanUrl,
          key: env.WORKSTATION_AUTH_KEY,
        };
        const jsonPayload = JSON.stringify(payload);
        const base64Payload = Buffer.from(jsonPayload, 'utf-8').toString('base64');
        const magicLink = `tiflis://connect?data=${encodeURIComponent(base64Payload)}`;
        
        logger.info(
          {
            tunnelId,
            publicUrl: cleanUrl,
            magicLink,
          },
          '📱 Magic link for mobile clients'
        );
        
        // Also print to console for easy copy-paste (using logger for consistency)
        logger.info({ magicLink }, '📱 Magic Link for Mobile App');
        // eslint-disable-next-line no-console
        console.log('\n📱 Magic Link for Mobile App:');
        // eslint-disable-next-line no-console
        console.log(magicLink);
        // eslint-disable-next-line no-console
        console.log('\n');
      },
      onDisconnected: () => {
        logger.warn('Disconnected from tunnel');
      },
      onError: (error) => {
        logger.error({ error }, 'Tunnel error');
      },
      onClientMessage: (message) => {
        // Route messages from clients through tunnel
        // Parse and validate the message before routing
        try {
          const data: unknown = JSON.parse(message);
          const messageType = getMessageType(data);
          
          if (messageType === 'auth') {
            handleAuthMessageViaTunnel(data, tunnelClient, authenticateClient, logger);
          } else {
            logger.debug(
              { type: messageType, message: message.slice(0, 100) },
              'Received client message via tunnel'
            );
            // TODO: Route other message types through message router
          }
        } catch (error) {
          logger.warn(
            { error, message: message.slice(0, 100) },
            'Failed to process client message via tunnel'
          );
        }
      },
    }
  );

  // Initialize broadcaster and remaining use cases
  messageBroadcaster = new MessageBroadcasterImpl({
    clientRegistry,
    tunnelClient,
    logger,
  });

  createSession = new CreateSessionUseCase({
    sessionManager,
    workspaceDiscovery,
    messageBroadcaster,
    logger,
  });

  terminateSession = new TerminateSessionUseCase({
    sessionManager,
    messageBroadcaster,
    logger,
  });

  subscriptionService = new SubscriptionService({
    clientRegistry,
    sessionManager,
    logger,
  });

  // ─────────────────────────────────────────────────────────────
  // Output Streaming Setup
  // ─────────────────────────────────────────────────────────────

  // Stream agent session output to subscribed clients
  const broadcaster = messageBroadcaster;
  
  agentSessionManager.on('message', (sessionId: string, message: ChatMessage, isComplete: boolean) => {
    const outputEvent = {
      type: 'session.output',
      session_id: sessionId,
      payload: {
        content_type: 'chat_message',
        message: {
          id: message.id,
          timestamp: message.timestamp,
          type: message.type,
          content: message.content,
          metadata: message.metadata,
        },
        is_complete: isComplete,
      },
    };

    // Send to all subscribers via broadcaster
    // Broadcaster handles both direct WebSocket and tunnel connections
    broadcaster.broadcastToSubscribers(sessionId, JSON.stringify(outputEvent));
  });

  // Stream terminal output to subscribed clients
  // Note: Terminal sessions emit output via their onOutput callback
  // This is handled when sessions are created in CreateSessionUseCase

  // Create Fastify app
  const app = createApp({ env, logger });

  // Register health routes
  registerHealthRoute(
    app,
    { version: workstationVersion },
    {
      sessionManager,
      clientRegistry,
      isTunnelConnected: () => tunnelClient.isConnected,
    }
  );

  // Start HTTP server
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(
      { address: `http://${env.HOST}:${env.PORT}` },
      'HTTP server started'
    );
  } catch (error) {
    logger.fatal({ error }, 'Failed to start HTTP server');
    process.exit(1);
  }

  // Connect to tunnel
  try {
    await tunnelClient.connect();
  } catch (error) {
    logger.error({ error }, 'Failed to connect to tunnel (will retry)');
    // Tunnel client will automatically retry
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      // Disconnect from tunnel
      tunnelClient.disconnect();

      // Cleanup agent sessions
      agentSessionManager.cleanup();

      // Terminate all sessions
      await sessionManager.terminateAll();

      // Close HTTP server
      await app.close();

      // Close database
      closeDatabase();

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

