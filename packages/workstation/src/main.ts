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
import { registerConnectionInfoRoute } from './infrastructure/http/connection-info-route.js';
import { initDatabase, closeDatabase } from './infrastructure/persistence/database/client.js';
import { InMemoryClientRegistry } from './infrastructure/persistence/in-memory-registry.js';
import { WorkstationMetadataRepository } from './infrastructure/persistence/repositories/workstation-metadata-repository.js';
import { TunnelClient } from './infrastructure/websocket/tunnel-client.js';
import { MessageRouter, type MessageHandlers } from './infrastructure/websocket/message-router.js';
import { FileSystemWorkspaceDiscovery } from './infrastructure/workspace/workspace-discovery.js';
import { PtyManager } from './infrastructure/terminal/pty-manager.js';
import { AgentSessionManager, type AgentSessionState } from './infrastructure/agents/agent-session-manager.js';
import { AuthKey } from './domain/value-objects/auth-key.js';
import { SessionId } from './domain/value-objects/session-id.js';
import { DeviceId } from './domain/value-objects/device-id.js';
import type { ContentBlock } from './domain/value-objects/content-block.js';
import { isTerminalSession, type TerminalSession } from './domain/entities/terminal-session.js';
import type { SessionCreatedMessage } from './protocol/messages.js';
import QRCode from 'qrcode';
import { AuthenticateClientUseCase } from './application/commands/authenticate-client.js';
import { CreateSessionUseCase } from './application/commands/create-session.js';
import { TerminateSessionUseCase } from './application/commands/terminate-session.js';
import { ListSessionsUseCase } from './application/queries/list-sessions.js';
import { SubscriptionService } from './application/services/subscription-service.js';
import { MessageBroadcasterImpl } from './application/services/message-broadcaster-impl.js';
import { ChatHistoryService } from './application/services/chat-history-service.js';
import { InMemorySessionManager } from './infrastructure/persistence/in-memory-session-manager.js';
import { DomainError } from './domain/errors/domain-errors.js';
import { SupervisorAgent } from './infrastructure/agents/supervisor/supervisor-agent.js';
import { AuthMessageSchema, getMessageType, parseClientMessage } from './protocol/schemas.js';
import type WebSocket from 'ws';

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
 * Handles non-auth messages received via tunnel.
 * Routes messages through message handlers and sends responses via tunnel.
 */
function handleTunnelMessage(
  rawMessage: string,
  tunnelClient: TunnelClient,
  messageBroadcaster: MessageBroadcasterImpl | null,
  createMessageHandlers: () => MessageHandlers,
  logger: ReturnType<typeof createLogger>
): void {
  if (!messageBroadcaster) {
    logger.warn('Message broadcaster not initialized, cannot route tunnel message');
    return;
  }

  try {
    const data: unknown = JSON.parse(rawMessage);
    const messageType = getMessageType(data);

    if (!messageType) {
      logger.warn({ message: rawMessage.slice(0, 100) }, 'No message type in tunnel message');
      return;
    }

    // Create a virtual socket that sends responses through the tunnel
    // For tunnel messages, we broadcast to all authenticated clients
    // (The tunnel server will route to the correct client based on device ID)
    const virtualSocket = {
      send: (response: string) => {
        // Send response through tunnel - it will be broadcast to all clients
        // The tunnel server routes based on message content
        tunnelClient.send(response);
        return true;
      },
      readyState: 1, // Always ready for tunnel
    } as unknown as WebSocket;

    // Get the message handlers
    const handlers = createMessageHandlers();

    // Check if messageType is a valid handler key
    if (!(messageType in handlers)) {
      logger.warn({ type: messageType }, 'No handler for tunnel message type');
      return;
    }

    const handler = handlers[messageType as keyof MessageHandlers];

    // Parse the message
    const parsedMessage = parseClientMessage(data);
    if (!parsedMessage) {
      logger.warn({ type: messageType }, 'Failed to parse tunnel message');
      return;
    }

    // Execute the handler
    handler(virtualSocket, parsedMessage).catch((error: unknown) => {
      logger.error({ error, type: messageType }, 'Handler error for tunnel message');
    });
  } catch (error) {
    logger.error({ error, message: rawMessage.slice(0, 100) }, 'Failed to handle tunnel message');
  }
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

  // Create services
  const chatHistoryService = new ChatHistoryService({
    dataDir,
    logger,
  });

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

  // Placeholder for late-bound message broadcaster
  let messageBroadcaster: MessageBroadcasterImpl | null = null;

  // Create Supervisor Agent with LangGraph
  const supervisorAgent = new SupervisorAgent({
    sessionManager,
    agentSessionManager,
    workspaceDiscovery,
    workspacesRoot: env.WORKSPACES_ROOT,
    logger,
    getMessageBroadcaster: () => messageBroadcaster,
    getChatHistoryService: () => chatHistoryService,
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
    workspacesRoot: env.WORKSPACES_ROOT,
    logger,
  });

  const listSessions = new ListSessionsUseCase({
    sessionManager,
    logger,
  });

  // Placeholder for late-bound dependencies
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
      const syncMessage = message as { id: string; device_id?: string };
      // Helper to get client from socket (direct) or device_id (tunnel)
      const client = clientRegistry.getBySocket(socket)
        ?? (syncMessage.device_id ? clientRegistry.getByDeviceId(new DeviceId(syncMessage.device_id)) : undefined);
      const subscriptions = client ? client.getSubscriptions() : [];

      // Get in-memory sessions (terminal sessions + active agent sessions)
      const inMemorySessions = sessionManager.getSessionInfos();

      // Get persisted agent sessions from database (survives workstation restart)
      const persistedAgentSessions = chatHistoryService.getActiveAgentSessions();
      logger.debug({ persistedAgentSessions, inMemoryCount: inMemorySessions.length }, 'Sync: fetched sessions');

      // Merge: in-memory sessions + persisted agent sessions not already in memory
      const inMemorySessionIds = new Set(inMemorySessions.map(s => s.session_id));
      const restoredAgentSessions = persistedAgentSessions
        .filter(s => !inMemorySessionIds.has(s.sessionId))
        .map(s => ({
          session_id: s.sessionId,
          session_type: s.sessionType as 'cursor' | 'claude' | 'opencode',
          workspace: s.workspace,
          project: s.project,
          worktree: s.worktree,
          working_dir: s.workingDir,
          status: 'active' as const, // Persisted sessions are always active
        }));

      const sessions = [...inMemorySessions, ...restoredAgentSessions];

      // Get global supervisor history (shared across all devices)
      const supervisorHistory = chatHistoryService.getSupervisorHistory().map(msg => ({
        sequence: msg.sequence,
        role: msg.role,
        content: msg.content,
        content_blocks: msg.contentBlocks, // Structured blocks for rich UI restoration
        createdAt: msg.createdAt.toISOString(),
      }));

      // Restore global supervisor history into agent's in-memory cache from database
      if (supervisorHistory.length > 0) {
        const historyForAgent = supervisorHistory
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));
        supervisorAgent.restoreHistory(historyForAgent);
      }

      // Get agent session histories (each session has isolated history)
      const agentSessionIds = sessions
        .filter(s => s.session_type === 'cursor' || s.session_type === 'claude' || s.session_type === 'opencode')
        .map(s => s.session_id);

      const agentHistoriesMap = chatHistoryService.getAllAgentHistories(agentSessionIds);
      const agentHistories: Record<string, Array<{
        sequence: number;
        role: string;
        content: string;
        content_blocks?: unknown[];
        createdAt: string;
      }>> = {};

      for (const [sessionId, history] of agentHistoriesMap) {
        agentHistories[sessionId] = history.map(msg => ({
          sequence: msg.sequence,
          role: msg.role,
          content: msg.content,
          content_blocks: msg.contentBlocks,
          createdAt: msg.createdAt.toISOString(),
        }));
      }

      logger.info({
        totalSessions: sessions.length,
        sessionTypes: sessions.map(s => ({ id: s.session_id, type: s.session_type })),
        agentHistoriesCount: Object.keys(agentHistories).length,
      }, 'Sync: sending state to client');

      socket.send(JSON.stringify({
        type: 'sync.state',
        id: syncMessage.id,
        payload: { sessions, subscriptions, supervisorHistory, agentHistories },
      }));
      return Promise.resolve();
    },

    'supervisor.list_sessions': (socket, message) => {
      const listMessage = message as { id: string };
      const result = listSessions.execute({ requestId: listMessage.id });
      socket.send(JSON.stringify(result));
      return Promise.resolve();
    },

    // Natural language commands via LangGraph Supervisor Agent (streaming)
    'supervisor.command': async (socket, message) => {
      const commandMessage = message as {
        id: string;
        device_id?: string; // Injected by tunnel for tunnel connections
        payload: { command: string; session_id?: string };
      };

      logger.debug(
        { device_id: commandMessage.device_id, hasSocket: !!socket },
        'supervisor.command received'
      );

      // Try to get client from socket (direct connection) or from device_id (tunnel connection)
      let deviceId: string | undefined;
      const directClient = clientRegistry.getBySocket(socket);
      if (directClient) {
        deviceId = directClient.deviceId.value;
        logger.debug({ deviceId }, 'Found client by socket');
      } else if (commandMessage.device_id) {
        // Tunnel connection - device_id is injected by tunnel server
        const tunnelClient = clientRegistry.getByDeviceId(new DeviceId(commandMessage.device_id));
        logger.debug(
          { device_id: commandMessage.device_id, found: !!tunnelClient, isAuthenticated: tunnelClient?.isAuthenticated },
          'Looking up tunnel client'
        );
        if (tunnelClient?.isAuthenticated) {
          deviceId = commandMessage.device_id;
        }
      }

      if (!deviceId) {
        logger.warn({ device_id: commandMessage.device_id }, 'supervisor.command: client not authenticated');
        socket.send(JSON.stringify({
          type: 'error',
          id: commandMessage.id,
          payload: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
        }));
        return;
      }

      // Save user message to persistent history (global, not per-device)
      chatHistoryService.saveSupervisorMessage('user', commandMessage.payload.command);

      // Broadcast user message to ALL clients for sync
      // (so other devices see the message immediately)
      if (messageBroadcaster) {
        const userMessageEvent = {
          type: 'supervisor.user_message',
          payload: {
            content: commandMessage.payload.command,
            timestamp: Date.now(),
            from_device_id: deviceId, // So sender can skip duplicate
          },
        };
        logger.info({ deviceId, messageType: 'supervisor.user_message' }, 'Broadcasting user message to all clients');
        messageBroadcaster.broadcastToAll(JSON.stringify(userMessageEvent));
      } else {
        logger.warn({ deviceId }, 'Cannot broadcast user message - messageBroadcaster is null');
      }

      // Acknowledge command receipt
      socket.send(JSON.stringify({
        type: 'response',
        id: commandMessage.id,
        payload: { acknowledged: true },
      }));

      // Execute with streaming - output will be sent via 'blocks' events
      await supervisorAgent.executeWithStream(
        commandMessage.payload.command,
        deviceId
      );
    },

    // Clear supervisor conversation history (global)
    'supervisor.clear_context': (socket, message) => {
      const clearMessage = message as { id: string; device_id?: string };

      // Verify client is authenticated
      const directClient = clientRegistry.getBySocket(socket);
      const tunnelClient = clearMessage.device_id
        ? clientRegistry.getByDeviceId(new DeviceId(clearMessage.device_id))
        : undefined;
      const isAuthenticated = directClient?.isAuthenticated || tunnelClient?.isAuthenticated;

      if (isAuthenticated) {
        // Clear both in-memory and persistent history (global)
        supervisorAgent.clearHistory();
        chatHistoryService.clearSupervisorHistory();

        // Notify all clients that context was cleared
        const clearNotification = JSON.stringify({
          type: 'supervisor.context_cleared',
          payload: { timestamp: Date.now() },
        });
        broadcaster.broadcastToAll(clearNotification);

        socket.send(JSON.stringify({
          type: 'response',
          id: clearMessage.id,
          payload: { success: true },
        }));
      } else {
        socket.send(JSON.stringify({
          type: 'error',
          id: clearMessage.id,
          payload: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
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
      
      try {
        const result = await createSession.execute({
          requestId: createMessage.id,
          sessionType: createMessage.payload.session_type,
          workspace: createMessage.payload.workspace,
          project: createMessage.payload.project,
          worktree: createMessage.payload.worktree,
        });
        socket.send(JSON.stringify(result.response));
        messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));

        // Note: Terminal output streaming is now handled via the 'terminalSessionCreated' event
        // emitted by SessionManager. This ensures consistent output handling regardless of
        // how the terminal session was created (via API or supervisor tool).
      } catch (error) {
        logger.error({ error, requestId: createMessage.id }, 'Failed to create session');
        socket.send(JSON.stringify({
          type: 'error',
          id: createMessage.id,
          payload: {
            code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create session',
          },
        }));
      }
    },

    'supervisor.terminate_session': async (socket, message) => {
      const terminateMessage = message as {
        id: string;
        payload: { session_id: string };
      };

      if (!terminateSession || !messageBroadcaster) {
        socket.send(JSON.stringify({
          type: 'error',
          id: terminateMessage.id,
          payload: {
            code: 'INTERNAL_ERROR',
            message: 'Server not ready to process terminate requests',
          },
        }));
        return;
      }

      try {
        const result = await terminateSession.execute({
          requestId: terminateMessage.id,
          sessionId: terminateMessage.payload.session_id,
        });
        socket.send(JSON.stringify(result.response));
        messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));
      } catch (error) {
        logger.error({ error, sessionId: terminateMessage.payload.session_id }, 'Failed to terminate session');
        socket.send(JSON.stringify({
          type: 'error',
          id: terminateMessage.id,
          payload: {
            code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to terminate session',
          },
        }));
      }
    },

    'session.subscribe': (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const subscribeMessage = message as { session_id: string; device_id?: string };
      const client = clientRegistry.getBySocket(socket)
        ?? (subscribeMessage.device_id ? clientRegistry.getByDeviceId(new DeviceId(subscribeMessage.device_id)) : undefined);
      if (client?.isAuthenticated) {
        const sessionId = subscribeMessage.session_id;

        // Check if this is an agent session (in-memory or persisted)
        const agentSession = agentSessionManager.getSession(sessionId);
        const isPersistedAgent = !agentSession && chatHistoryService.getActiveAgentSessions()
          .some(s => s.sessionId === sessionId);

        if (agentSession || isPersistedAgent) {
          // For agent sessions, just track subscription without sessionManager validation
          client.subscribe(new SessionId(sessionId));
          logger.debug({ deviceId: client.deviceId.value, sessionId }, 'Client subscribed to agent session');
          socket.send(JSON.stringify({
            type: 'session.subscribed',
            session_id: sessionId,
          }));
        } else {
          // For terminal sessions, use full subscriptionService with master logic
          const result = subscriptionService.subscribe(
            client.deviceId.value,
            sessionId
          );
          socket.send(JSON.stringify(result));
        }
      }
      return Promise.resolve();
    },

    'session.unsubscribe': (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const unsubscribeMessage = message as { session_id: string; device_id?: string };
      const client = clientRegistry.getBySocket(socket)
        ?? (unsubscribeMessage.device_id ? clientRegistry.getByDeviceId(new DeviceId(unsubscribeMessage.device_id)) : undefined);
      if (client?.isAuthenticated) {
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
        payload: { content?: string; text?: string };
      };

      // Support both 'content' and 'text' fields for flexibility
      const textContent = execMessage.payload.content ?? execMessage.payload.text ?? '';

      try {
        // Check if this is an agent session (in-memory)
        let agentSession = agentSessionManager.getSession(execMessage.session_id);

        // If not in memory, check if it's a persisted agent session and restore it
        if (!agentSession) {
          const persistedSessions = chatHistoryService.getActiveAgentSessions();
          const persistedSession = persistedSessions.find(s => s.sessionId === execMessage.session_id);

          if (persistedSession) {
            logger.info({ sessionId: execMessage.session_id, sessionType: persistedSession.sessionType }, 'Restoring persisted agent session');
            // Restore the session in agentSessionManager
            agentSession = agentSessionManager.createSession(
              persistedSession.sessionType as 'cursor' | 'claude' | 'opencode',
              persistedSession.workingDir,
              persistedSession.sessionId // Use same session ID
            );
          }
        }

        if (agentSession) {
          // Save user message to database for history persistence
          chatHistoryService.saveAgentMessage(
            execMessage.session_id,
            'user',
            textContent
          );

          await agentSessionManager.executeCommand(
            execMessage.session_id,
            textContent
          );
          return;
        }

        // Fall back to terminal input
        const sessionId = new SessionId(execMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session && isTerminalSession(session)) {
          ptyManager.write(session, textContent + '\n');
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

    'session.resize': (socket, message) => {
      const resizeMessage = message as {
        session_id: string;
        device_id?: string;
        payload: { cols: number; rows: number };
      };
      try {
        const sessionId = new SessionId(resizeMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session?.type === 'terminal') {
          // Get device ID from socket (direct) or message (tunnel)
          const client = clientRegistry.getBySocket(socket)
            ?? (resizeMessage.device_id ? clientRegistry.getByDeviceId(new DeviceId(resizeMessage.device_id)) : undefined);
          const deviceId = client?.deviceId.value;

          const result = ptyManager.resize(
            session as Parameters<typeof ptyManager.resize>[0],
            resizeMessage.payload.cols,
            resizeMessage.payload.rows,
            deviceId
          );

          // Send resize result back to client
          socket.send(JSON.stringify({
            type: 'session.resized',
            session_id: resizeMessage.session_id,
            payload: {
              success: result.success,
              cols: result.cols,
              rows: result.rows,
              reason: result.reason,
            },
          }));
        }
      } catch {
        // Invalid session ID
      }
      return Promise.resolve();
    },

    'session.replay': (socket, message) => {
      const replayMessage = message as {
        session_id: string;
        payload: {
          since_timestamp?: number;
          since_sequence?: number;
          limit?: number;
        };
      };

      try {
        const sessionId = new SessionId(replayMessage.session_id);
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          socket.send(JSON.stringify({
            type: 'error',
            session_id: replayMessage.session_id,
            payload: {
              code: 'SESSION_NOT_FOUND',
              message: `Session not found: ${replayMessage.session_id}`,
            },
          }));
          return Promise.resolve();
        }

        const sinceTimestamp = replayMessage.payload.since_timestamp;
        const sinceSequence = replayMessage.payload.since_sequence;
        const limit = replayMessage.payload.limit ?? 100;

        // Handle terminal sessions
        if (isTerminalSession(session)) {
          const outputHistory = session.getOutputHistory({
            sinceSequence,
            sinceTimestamp,
            limit,
          });

          // Convert to ReplayedMessage format with sequence numbers
          const replayedMessages = outputHistory.map((msg) => ({
            content_type: 'terminal' as const,
            content: msg.content,
            timestamp: msg.timestamp,
            sequence: msg.sequence,
          }));

          // Check if there are more messages (if we got exactly the limit, there might be more)
          const hasMore = outputHistory.length === limit;

          // Get sequence range for gap detection on client side
          const firstMsg = outputHistory[0];
          const lastMsg = outputHistory[outputHistory.length - 1];

          socket.send(JSON.stringify({
            type: 'session.replay.data',
            session_id: replayMessage.session_id,
            payload: {
              messages: replayedMessages,
              has_more: hasMore,
              first_sequence: firstMsg?.sequence ?? 0,
              last_sequence: lastMsg?.sequence ?? 0,
              current_sequence: session.currentSequence,
            },
          }));

          logger.debug(
            {
              sessionId: replayMessage.session_id,
              messageCount: replayedMessages.length,
              hasMore,
              sinceTimestamp,
              sinceSequence,
              limit,
              currentSequence: session.currentSequence,
              bufferSize: session.getOutputHistory().length
            },
            'Terminal session replay sent'
          );
        } else {
          // For agent sessions, use SessionReplayService (if available)
          // For now, return empty replay for non-terminal sessions
          socket.send(JSON.stringify({
            type: 'session.replay.data',
            session_id: replayMessage.session_id,
            payload: {
              messages: [],
              has_more: false,
              first_sequence: 0,
              last_sequence: 0,
              current_sequence: 0,
            },
          }));

          logger.debug(
            { sessionId: replayMessage.session_id, sessionType: session.type },
            'Session replay not implemented for this session type'
          );
        }
      } catch (error) {
        logger.error(
          { error, sessionId: replayMessage.session_id },
          'Failed to replay session'
        );
        socket.send(JSON.stringify({
          type: 'error',
          session_id: replayMessage.session_id,
          payload: {
            code: 'REPLAY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to replay session',
          },
        }));
      }

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

        // Print QR code to terminal for easy scanning
        // eslint-disable-next-line no-console
        console.log('\n📱 Scan QR Code to Connect:\n');
        QRCode.toString(magicLink, { type: 'terminal', small: true }, (err, qr) => {
          if (!err && qr) {
            // eslint-disable-next-line no-console
            console.log(qr);
          }
          // eslint-disable-next-line no-console
          console.log('📱 Magic Link:');
          // eslint-disable-next-line no-console
          console.log(magicLink);
          // eslint-disable-next-line no-console
          console.log('\n');
        });
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
            // Route other message types through message router
            // For tunnel messages, we need to send responses via tunnelClient
            // We'll create a virtual socket that sends through the tunnel
            handleTunnelMessage(
              message,
              tunnelClient,
              messageBroadcaster,
              createMessageHandlers,
              logger
            );
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
      workspacesRoot: env.WORKSPACES_ROOT,
      logger,
      terminalOutputBufferSize: env.TERMINAL_OUTPUT_BUFFER_SIZE,
    });

  terminateSession = new TerminateSessionUseCase({
    sessionManager,
    messageBroadcaster,
    chatHistoryService,
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

  // Accumulator for agent message blocks - save only when complete
  const agentMessageAccumulator = new Map<string, ContentBlock[]>();

  agentSessionManager.on('blocks', (sessionId: string, blocks: ContentBlock[], isComplete: boolean) => {
    // Build plain text content for backward compatibility
    const textContent = blocks
      .filter((b) => b.block_type === 'text')
      .map((b) => b.content)
      .join('\n');

    // Filter out status blocks for history persistence (they're transient UI hints)
    const persistableBlocks = blocks.filter((b) => b.block_type !== 'status');

    // Accumulate blocks for this session
    if (persistableBlocks.length > 0) {
      const accumulated = agentMessageAccumulator.get(sessionId) ?? [];
      accumulated.push(...persistableBlocks);
      agentMessageAccumulator.set(sessionId, accumulated);
    }

    // Save to database only when message is complete
    if (isComplete) {
      const allBlocks = agentMessageAccumulator.get(sessionId) ?? [];
      agentMessageAccumulator.delete(sessionId);

      if (allBlocks.length > 0) {
        const fullTextContent = allBlocks
          .filter((b) => b.block_type === 'text')
          .map((b) => b.content)
          .join('\n');

        const hasError = allBlocks.some((b) => b.block_type === 'error');
        const role: 'assistant' | 'system' = hasError ? 'system' : 'assistant';
        chatHistoryService.saveAgentMessage(sessionId, role, fullTextContent, allBlocks);
      }
    }

    const outputEvent = {
      type: 'session.output',
      session_id: sessionId,
      payload: {
        content_type: 'agent',
        content: textContent, // Backward compat for older clients
        content_blocks: blocks, // Structured blocks for rich UI
        timestamp: Date.now(),
        is_complete: isComplete,
      },
    };

    // Send to all subscribers via broadcaster
    // Broadcaster handles both direct WebSocket and tunnel connections
    broadcaster.broadcastToSubscribers(sessionId, JSON.stringify(outputEvent));
  });

  // Stream Supervisor Agent output to ALL clients (supervisor chat is global/shared)
  supervisorAgent.on('blocks', (_deviceId: string, blocks: ContentBlock[], isComplete: boolean, finalOutput?: string, allBlocks?: ContentBlock[]) => {
    // Build plain text content for backward compatibility
    const textContent = blocks
      .filter((b) => b.block_type === 'text')
      .map((b) => b.content)
      .join('\n');

    const outputEvent = {
      type: 'supervisor.output',
      payload: {
        content_type: 'supervisor',
        content: textContent,
        content_blocks: blocks,
        timestamp: Date.now(),
        is_complete: isComplete,
      },
    };

    const message = JSON.stringify(outputEvent);

    // Broadcast to ALL clients since supervisor chat is shared across devices
    broadcaster.broadcastToAll(message);

    // Save assistant response to persistent history when streaming completes (global)
    if (isComplete && finalOutput && finalOutput.length > 0) {
      // Save with all accumulated content blocks for history restoration
      chatHistoryService.saveSupervisorMessage('assistant', finalOutput, allBlocks);
    }
  });

  // Broadcast agent session creation to all clients
  // Listen for agent sessions created from ANY source (API, supervisor tool, etc.)
  agentSessionManager.on('sessionCreated', (state: AgentSessionState) => {
    logger.info(
      { sessionId: state.sessionId, agentType: state.agentType, workingDir: state.workingDir },
      'Agent session created via event, broadcasting to clients'
    );

    // Broadcast session.created to all clients
    const broadcastMessage: SessionCreatedMessage = {
      type: 'session.created',
      session_id: state.sessionId,
      payload: {
        session_type: state.agentType,
        working_dir: state.workingDir,
        // workspace/project are not available in AgentSessionState
        // Clients will get full info from sync.state if needed
      },
    };
    broadcaster.broadcastToAll(JSON.stringify(broadcastMessage));

    // Record session in database for history persistence
    chatHistoryService.recordSessionCreated({
      sessionId: state.sessionId,
      sessionType: state.agentType,
      workingDir: state.workingDir,
    });
  });

  // Stream terminal output to subscribed clients
  // Listen for terminal sessions created from ANY source (API, supervisor tool, etc.)
  // This ensures broadcast and output handler attachment regardless of creation path
  sessionManager.on('terminalSessionCreated', (session: TerminalSession) => {
    const sessionId = session.id;

    logger.info(
      { sessionId: sessionId.value, workingDir: session.workingDir },
      'Terminal session created via event, attaching output handler'
    );

    // Broadcast session.created to all clients
    const broadcastMessage: SessionCreatedMessage = {
      type: 'session.created',
      session_id: sessionId.value,
      payload: {
        session_type: 'terminal',
        working_dir: session.workingDir,
        terminal_config: {
          buffer_size: env.TERMINAL_OUTPUT_BUFFER_SIZE,
        },
      },
    };
    broadcaster.broadcastToAll(JSON.stringify(broadcastMessage));

    // Attach output handler for streaming
    session.onOutput((data: string) => {
      const outputMessage = session.addOutputToBuffer(data);

      const outputEvent = {
        type: 'session.output',
        session_id: sessionId.value,
        payload: {
          content_type: 'terminal',
          content: data,
          timestamp: outputMessage.timestamp,
          sequence: outputMessage.sequence,
        },
      };

      broadcaster.broadcastToSubscribers(sessionId.value, JSON.stringify(outputEvent));
    });
  });

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

  // Register connection info routes (magic link + QR code)
  registerConnectionInfoRoute(
    app,
    { authKey: env.WORKSTATION_AUTH_KEY, version: workstationVersion },
    {
      getTunnelId: () => tunnelClient.getTunnelId(),
      getPublicUrl: () => tunnelClient.getPublicUrl(),
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
      logger.info('Disconnecting from tunnel...');
      tunnelClient.disconnect();

      // Cleanup agent sessions
      logger.info('Cleaning up agent sessions...');
      agentSessionManager.cleanup();

      // Terminate all sessions (waits for all PTY processes to terminate gracefully)
      logger.info('Terminating all sessions...');
      await sessionManager.terminateAll();
      logger.info('All sessions terminated');

      // Close HTTP server
      logger.info('Closing HTTP server...');
      await app.close();

      // Close database
      logger.info('Closing database...');
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

