/**
 * @file main.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { randomUUID } from "crypto";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import {
  getWorkstationVersion,
  getProtocolVersion,
} from "./config/constants.js";
import { createLogger } from "./infrastructure/logging/pino-logger.js";
import { registerHealthRoute } from "./infrastructure/http/health-route.js";
import { registerConnectionInfoRoute } from "./infrastructure/http/connection-info-route.js";
import {
  initDatabase,
  closeDatabase,
} from "./infrastructure/persistence/database/client.js";
import { InMemoryClientRegistry } from "./infrastructure/persistence/in-memory-registry.js";
import { WorkstationMetadataRepository } from "./infrastructure/persistence/repositories/workstation-metadata-repository.js";
import { SubscriptionRepository } from "./infrastructure/persistence/repositories/subscription-repository.js";
import { TunnelClient } from "./infrastructure/websocket/tunnel-client.js";
import {
  MessageRouter,
  type MessageHandlers,
} from "./infrastructure/websocket/message-router.js";
import { FileSystemWorkspaceDiscovery } from "./infrastructure/workspace/workspace-discovery.js";
import { PtyManager } from "./infrastructure/terminal/pty-manager.js";
import {
  AgentSessionManager,
  type AgentSessionState,
} from "./infrastructure/agents/agent-session-manager.js";
import { AuthKey } from "./domain/value-objects/auth-key.js";
import { SessionId } from "./domain/value-objects/session-id.js";
import { DeviceId } from "./domain/value-objects/device-id.js";
import type { ContentBlock } from "./domain/value-objects/content-block.js";
import { mergeToolBlocks, accumulateBlocks } from "./domain/value-objects/content-block.js";
import {
  isTerminalSession,
  type TerminalSession,
} from "./domain/entities/terminal-session.js";
import type { SessionCreatedMessage } from "./protocol/messages.js";
import QRCode from "qrcode";
import { AuthenticateClientUseCase } from "./application/commands/authenticate-client.js";
import { CreateSessionUseCase } from "./application/commands/create-session.js";
import { TerminateSessionUseCase } from "./application/commands/terminate-session.js";
import { ListSessionsUseCase } from "./application/queries/list-sessions.js";
import { SubscriptionService } from "./application/services/subscription-service.js";
import { MessageBroadcasterImpl } from "./application/services/message-broadcaster-impl.js";
import { ChatHistoryService } from "./application/services/chat-history-service.js";
import { InMemorySessionManager } from "./infrastructure/persistence/in-memory-session-manager.js";
import { DomainError } from "./domain/errors/domain-errors.js";
import {
  getAvailableAgents,
  getAgentConfig,
  getDisabledBaseAgents,
  type BaseAgentType,
} from "./config/constants.js";
import { SupervisorAgent } from "./infrastructure/agents/supervisor/supervisor-agent.js";
import { MockSupervisorAgent } from "./infrastructure/mock/mock-supervisor-agent.js";
import { MockAgentSessionManager } from "./infrastructure/mock/mock-agent-session-manager.js";
import {
  AuthMessageSchema,
  getMessageType,
  parseClientMessageWithErrors,
} from "./protocol/schemas.js";
import {
  createSTTService,
  type AudioFormat,
} from "./infrastructure/speech/stt-service.js";
import { createTTSService } from "./infrastructure/speech/tts-service.js";
import { createSummarizationService } from "./infrastructure/speech/summarization-service.js";
import {
  createVoiceInputBlock,
  createVoiceOutputBlock,
} from "./domain/value-objects/content-block.js";
import type WebSocket from "ws";

/**
 * Prints the startup banner to console.
 */
function printBanner(version: string): void {
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

       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Workstation Server
       ${dim}Agent Sessions & Terminal Access Manager${reset}

       ${dim}v${version}  ·  © 2025 Roman Barinov  ·  FSL-1.1-NC${reset}
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
    logger.warn(
      "Message broadcaster not initialized, cannot route tunnel message"
    );
    return;
  }

  try {
    const data: unknown = JSON.parse(rawMessage);
    const messageType = getMessageType(data);

    if (!messageType) {
      logger.warn(
        { message: rawMessage.slice(0, 100) },
        "No message type in tunnel message"
      );
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
      logger.warn({ type: messageType }, "No handler for tunnel message type");
      return;
    }

    const handler = handlers[messageType as keyof MessageHandlers];

    const parseResult = parseClientMessageWithErrors(data);
    if (!parseResult.success) {
      logger.warn(
        {
          type: messageType,
          errors: parseResult.errors,
          rawMessage: JSON.stringify(data).slice(0, 500),
        },
        "Failed to parse tunnel message - Zod validation failed"
      );
      return;
    }
    const parsedMessage = parseResult.data;

    // Execute the handler
    handler(virtualSocket, parsedMessage).catch((error: unknown) => {
      logger.error(
        { error, type: messageType },
        "Handler error for tunnel message"
      );
    });
  } catch (error) {
    logger.error(
      { error, message: rawMessage.slice(0, 100) },
      "Failed to handle tunnel message"
    );
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
  logger: ReturnType<typeof createLogger>,
  subscriptionService?: SubscriptionService | null
): void {
  // Validate auth message with zod schema
  const authResult = AuthMessageSchema.safeParse(data);
  if (!authResult.success) {
    logger.warn(
      {
        errors: authResult.error.errors,
        message: JSON.stringify(data).slice(0, 100),
      },
      "Invalid auth message format"
    );
    return;
  }

  const authMessage = authResult.data;
  const deviceId = authMessage.payload.device_id;

  try {
    // For tunnel connections, no socket is needed
    // The client will be registered as a tunnel connection
    const result = authenticateClient.execute({
      // socket is undefined for tunnel connections
      authKey: authMessage.payload.auth_key,
      deviceId,
    });

    // Restore subscriptions from database if subscription service is ready
    // This is important after workstation restart when in-memory state is empty
    if (subscriptionService) {
      const restored = subscriptionService.restoreSubscriptions(deviceId);
      if (restored.length > 0) {
        // Update the result with restored subscriptions from database
        result.payload.restored_subscriptions = restored;
        logger.info(
          { deviceId, restored: restored.length },
          "Restored subscriptions from database on tunnel auth"
        );
      }
    }

    // Send response back through tunnel
    // The tunnel will forward to all clients, but the client will process the auth.success message
    const responseJson = JSON.stringify(result);
    if (tunnelClient.send(responseJson)) {
      logger.info(
        { deviceId },
        "Processed auth message via tunnel and sent response"
      );
    } else {
      logger.warn({ deviceId }, "Failed to send auth response through tunnel");
    }
  } catch (error) {
    logger.error(
      { error, deviceId: authMessage.payload.device_id },
      "Failed to authenticate client via tunnel"
    );
    // Send error response back through tunnel if possible
    const errorResponse = {
      type: "auth.error",
      payload: {
        code: "AUTHENTICATION_FAILED",
        message:
          error instanceof Error ? error.message : "Authentication failed",
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
    name: "tiflis-workstation",
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === "development",
  });

  logger.info(
    {
      version: workstationVersion,
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      tunnelUrl: env.TUNNEL_URL,
      workspacesRoot: env.WORKSPACES_ROOT,
    },
    "Starting workstation server"
  );

  // Initialize database
  const dataDir = env.DATA_DIR;
  initDatabase(dataDir);
  logger.info({ dataDir }, "Database initialized");

  // Create services
  const chatHistoryService = new ChatHistoryService({
    dataDir,
    logger,
  });

  // Ensure supervisor session exists in database (for fresh installs or migrations)
  chatHistoryService.ensureSupervisorSession();

  // Create repositories
  const workstationMetadataRepository = new WorkstationMetadataRepository();
  const subscriptionRepository = new SubscriptionRepository();

  // Create infrastructure components
  const clientRegistry = new InMemoryClientRegistry(logger);
  const workspaceDiscovery = new FileSystemWorkspaceDiscovery({
    workspacesRoot: env.WORKSPACES_ROOT,
  });
  const ptyManager = new PtyManager({ logger });

  // Create agent session manager (mock or real based on MOCK_MODE)
  // Note: MockAgentSessionManager implements the same interface as AgentSessionManager
  const agentSessionManager = env.MOCK_MODE
    ? (new MockAgentSessionManager({ logger, fixturesPath: env.MOCK_FIXTURES_PATH }) as unknown as AgentSessionManager)
    : new AgentSessionManager(logger);

  if (env.MOCK_MODE) {
    logger.info(
      { fixturesPath: env.MOCK_FIXTURES_PATH ?? "built-in" },
      "Mock mode enabled - using mock agent session manager"
    );
  }

  const sessionManager = new InMemorySessionManager({
    ptyManager,
    agentSessionManager,
    workspacesRoot: env.WORKSPACES_ROOT,
    logger,
  });

  // Pre-create mock sessions for screenshot automation (after sessionManager is ready)
  if (env.MOCK_MODE) {
    const mockAgentManager = agentSessionManager as unknown as MockAgentSessionManager;

    // Create supervisor session first (iOS expects this in sync.state)
    await sessionManager.createSession({
      sessionType: "supervisor",
      workingDir: env.WORKSPACES_ROOT,
    });
    logger.info("Pre-created supervisor session for screenshots");

    // Create one agent of each type with generic demo names for screenshots
    // These sessions will appear in the sidebar when the app connects
    mockAgentManager.createSession(
      "claude",
      `${env.WORKSPACES_ROOT}/work/my-app`,
      "claude-my-app",
      "claude"
    );

    mockAgentManager.createSession(
      "cursor",
      `${env.WORKSPACES_ROOT}/personal/blog`,
      "cursor-blog",
      "cursor"
    );

    mockAgentManager.createSession(
      "opencode",
      `${env.WORKSPACES_ROOT}/work/api-service`,
      "opencode-api",
      "opencode"
    );

    logger.info("Pre-created 3 mock agent sessions for screenshots");

    // Note: Terminal session creation is deferred until after event handlers are set up
    // to ensure the terminalSessionCreated event triggers the output buffer attachment.
    // See "Create mock terminal session" section after event handlers.

    // Seed mock chat history for all sessions
    chatHistoryService.seedMockData({
      claude: {
        id: "claude-my-app",
        workingDir: `${env.WORKSPACES_ROOT}/work/my-app`,
      },
      cursor: {
        id: "cursor-blog",
        workingDir: `${env.WORKSPACES_ROOT}/personal/blog`,
      },
      opencode: {
        id: "opencode-api",
        workingDir: `${env.WORKSPACES_ROOT}/work/api-service`,
      },
    });
  }

  // Create STT service for voice transcription
  const sttService = createSTTService(env, logger);
  if (sttService) {
    logger.info(
      { provider: sttService.getProviderInfo() },
      "STT service initialized"
    );
  } else {
    logger.warn(
      "STT service not configured - voice messages will not be transcribed"
    );
  }

  // Create TTS service for voice synthesis
  const ttsService = createTTSService(env, logger);
  if (ttsService) {
    logger.info(
      { provider: ttsService.getProviderInfo() },
      "TTS service initialized"
    );
  } else {
    logger.warn(
      "TTS service not configured - voice responses will not be synthesized"
    );
  }

  // Create summarization service for condensing long responses before TTS
  const summarizationService = createSummarizationService(env, logger);
  if (summarizationService) {
    logger.info(
      "Summarization service initialized - long responses will be condensed for TTS"
    );
  }

  // Track pending voice commands that need TTS response
  // Maps deviceId to { messageId, userCommand } for supervisor voice commands
  const pendingSupervisorVoiceCommands = new Map<
    string,
    { messageId: string; userCommand: string }
  >();
  // Maps sessionId to { messageId, userCommand, deviceId } for agent session voice commands
  const pendingAgentVoiceCommands = new Map<
    string,
    { messageId: string; userCommand: string; deviceId: string }
  >();
  // Track sessions cancelled during voice transcription (to prevent execution after transcription completes)
  const cancelledDuringTranscription = new Set<string>();

  // Accumulator for supervisor streaming blocks - accessible from sync handler and output handler
  // Used for mid-stream device joins (sync returns current streaming blocks)
  const supervisorMessageAccumulator = {
    blocks: [] as ContentBlock[],
    get(): ContentBlock[] {
      return this.blocks;
    },
    set(blocks: ContentBlock[]): void {
      this.blocks = blocks;
    },
    clear(): void {
      this.blocks = [];
    },
    accumulate(newBlocks: ContentBlock[]): void {
      accumulateBlocks(this.blocks, newBlocks);
    },
  };

  // Create expected auth key
  const expectedAuthKey = new AuthKey(env.WORKSTATION_AUTH_KEY);

  // Placeholder for late-bound message broadcaster
  let messageBroadcaster: MessageBroadcasterImpl | null = null;

  // Create Supervisor Agent (mock or real based on MOCK_MODE)
  // Note: MockSupervisorAgent implements the same interface as SupervisorAgent
  const supervisorAgent = env.MOCK_MODE
    ? (new MockSupervisorAgent({
        logger,
        fixturesPath: env.MOCK_FIXTURES_PATH,
      }) as unknown as SupervisorAgent)
    : new SupervisorAgent({
        sessionManager,
        agentSessionManager,
        workspaceDiscovery,
        workspacesRoot: env.WORKSPACES_ROOT,
        logger,
        getMessageBroadcaster: () => messageBroadcaster,
        getChatHistoryService: () => chatHistoryService,
        getTerminateSession: () => terminateSession?.terminateAndBroadcast.bind(terminateSession) ?? null,
      });

  if (env.MOCK_MODE) {
    logger.info("Mock Supervisor Agent initialized for screenshot automation");
  } else {
    logger.info("Supervisor Agent initialized with LangGraph");
  }

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

  // Helper to send response to a specific device
  // Uses targeted delivery for tunnel connections, falls back to direct socket for local connections
  const sendToDevice = (
    socket: WebSocket,
    deviceId: string | undefined,
    message: string
  ): void => {
    if (deviceId) {
      broadcaster.sendToClient(deviceId, message);
    } else {
      socket.send(message);
    }
  };

  // Create message handlers
  const createMessageHandlers = (): MessageHandlers => ({
    auth: (socket, message) => {
      const authMessage = message as {
        payload: { auth_key: string; device_id: string };
      };
      const deviceId = authMessage.payload.device_id;

      const result = authenticateClient.execute({
        socket,
        authKey: authMessage.payload.auth_key,
        deviceId,
      });

      // Restore subscriptions from database if subscription service is ready
      // This is important after workstation restart when in-memory state is empty
      if (subscriptionService) {
        const restored = subscriptionService.restoreSubscriptions(deviceId);
        if (restored.length > 0) {
          // Update the result with restored subscriptions from database
          result.payload.restored_subscriptions = restored;
          logger.info(
            { deviceId, restored: restored.length },
            "Restored subscriptions from database on auth"
          );
        }
      }

      // Auth response must go to specific device
      sendToDevice(socket, deviceId, JSON.stringify(result));
      return Promise.resolve();
    },

    ping: (socket, message) => {
      const pingMessage = message as { timestamp: number; device_id?: string };
      sendToDevice(
        socket,
        pingMessage.device_id,
        JSON.stringify({ type: "pong", timestamp: pingMessage.timestamp })
      );
      return Promise.resolve();
    },

    heartbeat: (socket, message) => {
      const heartbeatMessage = message as {
        id: string;
        timestamp: number;
        device_id?: string;
      };
      // Respond with heartbeat.ack including workstation uptime
      sendToDevice(
        socket,
        heartbeatMessage.device_id,
        JSON.stringify({
          type: "heartbeat.ack",
          id: heartbeatMessage.id,
          timestamp: heartbeatMessage.timestamp,
          workstation_uptime_ms: Math.floor(process.uptime() * 1000),
        })
      );
      return Promise.resolve();
    },

    sync: async (socket, message) => {
      const syncMessage = message as { id: string; device_id?: string };
      // Helper to get client from socket (direct) or device_id (tunnel)
      const client =
        clientRegistry.getBySocket(socket) ??
        (syncMessage.device_id
          ? clientRegistry.getByDeviceId(new DeviceId(syncMessage.device_id))
          : undefined);
      const subscriptions = client ? client.getSubscriptions() : [];

      // Protocol v1.13: All syncs are lightweight — no message histories
      // Clients must use history.request for on-demand chat loading

      // Get in-memory sessions (terminal sessions + active agent sessions)
      const inMemorySessions = sessionManager.getSessionInfos();

      // Get persisted agent sessions from database (survives workstation restart)
      const persistedAgentSessions =
        chatHistoryService.getActiveAgentSessions();
      logger.debug(
        { persistedAgentSessions, inMemoryCount: inMemorySessions.length },
        "Sync: fetched sessions"
      );

      // Merge: in-memory sessions + persisted agent sessions not already in memory
      const inMemorySessionIds = new Set(
        inMemorySessions.map((s) => s.session_id)
      );
      const restoredAgentSessions = persistedAgentSessions
        .filter((s) => !inMemorySessionIds.has(s.sessionId))
        .map((s) => {
          // sessionType can be an alias (e.g., 'zai') or base type (e.g., 'claude')
          // Use getAgentConfig to resolve the base type and determine if it's an alias
          const agentConfig = getAgentConfig(s.sessionType);
          const baseType =
            agentConfig?.baseType ?? (s.sessionType as BaseAgentType);
          const agentName = agentConfig?.isAlias ? s.sessionType : undefined;

          return {
            session_id: s.sessionId,
            session_type: baseType,
            agent_name: agentName, // Include alias name for iOS display
            workspace: s.workspace,
            project: s.project,
            worktree: s.worktree,
            working_dir: s.workingDir,
            created_at: s.createdAt.getTime(),
            status: "active" as const, // Persisted sessions are always active
          };
        });

      const sessions = [...inMemorySessions, ...restoredAgentSessions];

      // Restore supervisor history into agent's in-memory cache (internal only, not sent to client)
      const supervisorHistoryRaw = chatHistoryService.getSupervisorHistory();
      if (supervisorHistoryRaw.length > 0) {
        const historyForAgent = supervisorHistoryRaw
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }));
        supervisorAgent.restoreHistory(historyForAgent);
      }

      // Get available agents (base + aliases from environment)
      const availableAgentsMap = getAvailableAgents();
      const availableAgents = Array.from(availableAgentsMap.values()).map(
        (agent) => ({
          name: agent.name,
          base_type: agent.baseType,
          description: agent.description,
          is_alias: agent.isAlias,
        })
      );

      // Get disabled base agent types
      const hiddenBaseTypes: string[] = getDisabledBaseAgents();

      // Get workspaces with their projects
      const workspacesList = await workspaceDiscovery.listWorkspaces();
      const workspaces = await Promise.all(
        workspacesList.map(async (ws) => {
          const projects = await workspaceDiscovery.listProjects(ws.name);
          return {
            name: ws.name,
            projects: projects.map((p) => ({
              name: p.name,
              is_git_repo: p.isGitRepo,
              default_branch: p.defaultBranch,
            })),
          };
        })
      );

      // Build execution state for each agent session
      const executingStates: Record<string, boolean> = {};
      for (const session of sessions) {
        if (
          session.session_type === "cursor" ||
          session.session_type === "claude" ||
          session.session_type === "opencode"
        ) {
          executingStates[session.session_id] = agentSessionManager.isExecuting(
            session.session_id
          );
        }
      }

      // Check if supervisor is currently executing
      const supervisorIsExecuting = supervisorAgent.isProcessing();

      // Get current streaming blocks for supervisor only (for devices joining mid-generation)
      // Agent session streaming blocks are handled by session.subscribe → history.request flow
      let currentStreamingBlocks: unknown[] | undefined;
      if (supervisorIsExecuting) {
        const blocks = supervisorMessageAccumulator.get();
        if (blocks && blocks.length > 0) {
          currentStreamingBlocks = blocks;
        }
      }

      logger.info(
        {
          totalSessions: sessions.length,
          availableAgentsCount: availableAgents.length,
          workspacesCount: workspaces.length,
          supervisorIsExecuting,
          hasStreamingBlocks: !!currentStreamingBlocks,
        },
        "Sync: sending state to client (v1.13 - no histories)"
      );

      const syncStateMessage = JSON.stringify({
        type: "sync.state",
        id: syncMessage.id,
        payload: {
          sessions,
          subscriptions,
          availableAgents,
          hiddenBaseTypes,
          workspaces,
          supervisorIsExecuting,
          executingStates,
          // Only include supervisor streaming blocks for mid-stream join
          currentStreamingBlocks,
          // Protocol v1.13: No supervisorHistory, agentHistories
          // Clients use history.request for on-demand loading
        },
      });

      // Send response to specific device (not broadcast to all)
      sendToDevice(socket, syncMessage.device_id, syncStateMessage);
    },

    "supervisor.list_sessions": (socket, message) => {
      const listMessage = message as { id: string; device_id?: string };
      const result = listSessions.execute({ requestId: listMessage.id });
      sendToDevice(socket, listMessage.device_id, JSON.stringify(result));
      return Promise.resolve();
    },

    // Natural language commands via LangGraph Supervisor Agent (streaming)
    "supervisor.command": async (socket, message) => {
      const commandMessage = message as {
        id: string;
        device_id?: string; // Injected by tunnel for tunnel connections
        payload: {
          command?: string;
          audio?: string;
          audio_format?: string;
          message_id?: string;
          session_id?: string;
        };
      };

      logger.debug(
        {
          device_id: commandMessage.device_id,
          hasSocket: !!socket,
          hasAudio: !!commandMessage.payload.audio,
        },
        "supervisor.command received"
      );

      // Try to get client from socket (direct connection) or from device_id (tunnel connection)
      let deviceId: string | undefined;
      const directClient = clientRegistry.getBySocket(socket);
      if (directClient) {
        deviceId = directClient.deviceId.value;
        logger.debug({ deviceId }, "Found client by socket");
      } else if (commandMessage.device_id) {
        // Tunnel connection - device_id is injected by tunnel server
        const tunnelClient = clientRegistry.getByDeviceId(
          new DeviceId(commandMessage.device_id)
        );
        logger.debug(
          {
            device_id: commandMessage.device_id,
            found: !!tunnelClient,
            isAuthenticated: tunnelClient?.isAuthenticated,
          },
          "Looking up tunnel client"
        );
        if (tunnelClient?.isAuthenticated) {
          deviceId = commandMessage.device_id;
        }
      }

      if (!deviceId) {
        logger.warn(
          { device_id: commandMessage.device_id },
          "supervisor.command: client not authenticated"
        );
        sendToDevice(
          socket,
          commandMessage.device_id,
          JSON.stringify({
            type: "error",
            id: commandMessage.id,
            payload: { code: "UNAUTHENTICATED", message: "Not authenticated" },
          })
        );
        return;
      }

      // Handle voice command with audio payload
      let commandText: string;
      const messageId = commandMessage.payload.message_id;

      // Send immediate acknowledgment to client so they can show "Sent" status
      // Use payload.message_id (client's message ID) if available, fallback to command.id
      if (messageBroadcaster) {
        const ackMessageId = messageId ?? commandMessage.id;
        const ackMessage = {
          type: "message.ack",
          payload: {
            message_id: ackMessageId,
            status: "received",
          },
        };
        messageBroadcaster.sendToClient(deviceId, JSON.stringify(ackMessage));
        logger.debug(
          { messageId: ackMessageId, deviceId },
          "Sent message.ack for supervisor.command"
        );
      }

      // Reset stale cancellation state from previous commands BEFORE starting new one
      // This prevents previous cancellation from blocking new commands
      supervisorAgent.resetCancellationState();

      // Start tracking command processing immediately for voice commands
      // This allows cancel to work during STT transcription
      let abortController: AbortController | undefined;
      if (commandMessage.payload.audio) {
        abortController = supervisorAgent.startProcessing();
      }

      if (commandMessage.payload.audio) {
        logger.info(
          { messageId, hasAudio: true },
          "Received supervisor voice command"
        );

        if (!sttService) {
          logger.error(
            "STT service not configured, cannot transcribe voice command"
          );
          supervisorAgent.endProcessing();
          // Send error back to client
          if (messageBroadcaster) {
            const errorEvent = {
              type: "supervisor.transcription",
              payload: {
                transcription: "",
                error:
                  "Voice transcription not available - STT service not configured",
                message_id: messageId,
                timestamp: Date.now(),
              },
            };
            messageBroadcaster.broadcastToAll(JSON.stringify(errorEvent));
          }
          return;
        }

        try {
          // Decode base64 audio
          const audioBuffer = Buffer.from(
            commandMessage.payload.audio,
            "base64"
          );
          const format = (commandMessage.payload.audio_format ??
            "m4a") as AudioFormat;

          // Transcribe audio with abort signal for cancellation
          const transcriptionResult = await sttService.transcribe(
            audioBuffer,
            format,
            abortController?.signal
          );

          // Check if cancelled during transcription
          if (supervisorAgent.wasCancelled()) {
            logger.info(
              { messageId },
              "Supervisor command cancelled during transcription"
            );
            return;
          }

          commandText = transcriptionResult.text;

          logger.info(
            {
              textLength: commandText.length,
              language: transcriptionResult.language,
            },
            "Supervisor voice command transcribed"
          );

          // Track this as a voice command that needs TTS response
          if (messageId && ttsService) {
            pendingSupervisorVoiceCommands.set(deviceId, {
              messageId,
              userCommand: commandText,
            });
            logger.debug(
              { deviceId, messageId },
              "Tracking supervisor voice command for TTS response"
            );
          }

          // Send transcription back to ALL clients (supervisor is global)
          if (messageBroadcaster) {
            const transcriptionEvent = {
              type: "supervisor.transcription",
              payload: {
                transcription: commandText,
                language: transcriptionResult.language,
                duration: transcriptionResult.duration,
                message_id: messageId,
                timestamp: Date.now(),
                from_device_id: deviceId,
              },
            };
            messageBroadcaster.broadcastToAll(
              JSON.stringify(transcriptionEvent)
            );
          }
        } catch (error) {
          // Check if this was a cancellation
          if (
            supervisorAgent.wasCancelled() ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            logger.info(
              { messageId },
              "Supervisor voice command cancelled during transcription"
            );
            return;
          }

          logger.error(
            { error },
            "Failed to transcribe supervisor voice command"
          );
          supervisorAgent.endProcessing();
          if (messageBroadcaster) {
            const errorEvent = {
              type: "supervisor.transcription",
              payload: {
                transcription: "",
                error:
                  error instanceof Error
                    ? error.message
                    : "Transcription failed",
                message_id: messageId,
                timestamp: Date.now(),
                from_device_id: deviceId,
              },
            };
            messageBroadcaster.broadcastToAll(JSON.stringify(errorEvent));
          }
          return;
        }
      } else {
        commandText = commandMessage.payload.command ?? "";
      }

      if (!commandText) {
        logger.warn("supervisor.command: no command text after processing");
        return;
      }

      // Save user message to persistent history (global, not per-device)
      // For voice commands, save with audio; for text commands, save as plain text
      const audioPayload = commandMessage.payload.audio;
      if (audioPayload) {
        // Voice command - save with audio file and voice_input block
        const audioBuffer = Buffer.from(audioPayload, "base64");
        const format = (commandMessage.payload.audio_format ??
          "m4a") as AudioFormat;
        const voiceInputBlock = createVoiceInputBlock(
          commandText,
          undefined,
          0
        ); // duration will be added from audio
        await chatHistoryService.saveVoiceInput(
          "supervisor",
          audioBuffer,
          commandText,
          [voiceInputBlock],
          format
        );
        // Note: Voice commands are synced via supervisor.transcription, not supervisor.user_message
      } else {
        // Text command - save as plain message
        chatHistoryService.saveSupervisorMessage("user", commandText);

        // Broadcast user message to ALL clients for sync (text commands only)
        // Voice commands are synced via supervisor.transcription instead
        if (messageBroadcaster) {
          const userMessageEvent = {
            type: "supervisor.user_message",
            payload: {
              content: commandText,
              timestamp: Date.now(),
              from_device_id: deviceId, // So sender can skip duplicate
            },
          };
          logger.info(
            { deviceId, messageType: "supervisor.user_message" },
            "Broadcasting user message to all clients"
          );
          messageBroadcaster.broadcastToAll(JSON.stringify(userMessageEvent));
        } else {
          logger.warn(
            { deviceId },
            "Cannot broadcast user message - messageBroadcaster is null"
          );
        }
      }

      // Check if THIS command was cancelled (during STT processing)
      // Only relevant for voice commands where startProcessing() was called
      // We check abortController directly to avoid false positives from previous cancellations
      if (abortController?.signal.aborted) {
        logger.info(
          { deviceId },
          "Supervisor command cancelled during STT processing"
        );
        return;
      }

      // Acknowledge command receipt
      sendToDevice(
        socket,
        deviceId,
        JSON.stringify({
          type: "response",
          id: commandMessage.id,
          payload: { acknowledged: true },
        })
      );

      // Execute with streaming - output will be sent via 'blocks' events
      // Note: For voice commands, isProcessingCommand is already true from startProcessing()
      // executeWithStream will set isExecuting=true and handle the rest
      try {
        await supervisorAgent.executeWithStream(commandText, deviceId);
      } finally {
        // End processing if it was a voice command (for text commands, this is a no-op)
        supervisorAgent.endProcessing();
      }
    },

    // Cancel supervisor execution
    "supervisor.cancel": (socket, message) => {
      const cancelMessage = message as { id: string; device_id?: string };
      logger.info(
        { requestId: cancelMessage.id, deviceId: cancelMessage.device_id },
        "supervisor.cancel received"
      );

      // Verify client is authenticated
      const directClient = clientRegistry.getBySocket(socket);
      const tunnelClient = cancelMessage.device_id
        ? clientRegistry.getByDeviceId(new DeviceId(cancelMessage.device_id))
        : undefined;
      const isAuthenticated =
        directClient?.isAuthenticated ?? tunnelClient?.isAuthenticated;

      if (isAuthenticated) {
        // Try to cancel the supervisor agent execution
        const wasCancelled = supervisorAgent.cancel();
        logger.info({ wasCancelled }, "supervisorAgent.cancel() returned");

        // Always broadcast cancellation message to all clients
        // This ensures UI updates even if nothing was executing
        if (messageBroadcaster) {
          const cancelBlock = {
            id: randomUUID(),
            block_type: "cancel",
            content: "Cancelled by user",
          };
          const cancelOutput = {
            type: "supervisor.output",
            payload: {
              content_type: "supervisor",
              content: "",
              content_blocks: [cancelBlock],
              timestamp: Date.now(),
              is_complete: true,
            },
          };
          messageBroadcaster.broadcastToAll(JSON.stringify(cancelOutput));
          logger.info("Broadcasted supervisor cancel message to all clients");

          // Persist cancellation message to database for history sync
          chatHistoryService.saveSupervisorMessage("assistant", "", [
            cancelBlock,
          ]);
          logger.info("Saved supervisor cancel message to database");
        }

        sendToDevice(
          socket,
          cancelMessage.device_id,
          JSON.stringify({
            type: "response",
            id: cancelMessage.id,
            payload: { cancelled: true, was_executing: wasCancelled },
          })
        );
      } else {
        logger.warn("supervisor.cancel: not authenticated");
        sendToDevice(
          socket,
          cancelMessage.device_id,
          JSON.stringify({
            type: "error",
            id: cancelMessage.id,
            payload: { code: "UNAUTHORIZED", message: "Not authenticated" },
          })
        );
      }

      return Promise.resolve();
    },

    // Clear supervisor conversation history (global)
    "supervisor.clear_context": (socket, message) => {
      const clearMessage = message as { id: string; device_id?: string };

      // Verify client is authenticated
      const directClient = clientRegistry.getBySocket(socket);
      const tunnelClient = clearMessage.device_id
        ? clientRegistry.getByDeviceId(new DeviceId(clearMessage.device_id))
        : undefined;
      const isAuthenticated =
        directClient?.isAuthenticated ?? tunnelClient?.isAuthenticated;

      if (isAuthenticated) {
        // Clear context (in-memory, persistent, and notifies all clients)
        supervisorAgent.clearContext();

        sendToDevice(
          socket,
          clearMessage.device_id,
          JSON.stringify({
            type: "response",
            id: clearMessage.id,
            payload: { success: true },
          })
        );
      } else {
        sendToDevice(
          socket,
          clearMessage.device_id,
          JSON.stringify({
            type: "error",
            id: clearMessage.id,
            payload: { code: "UNAUTHENTICATED", message: "Not authenticated" },
          })
        );
      }
      return Promise.resolve();
    },

    "supervisor.create_session": async (socket, message) => {
      if (!createSession || !messageBroadcaster || !subscriptionService) return;
      const createMessage = message as {
        id: string;
        device_id?: string;
        payload: {
          session_type: "cursor" | "claude" | "opencode" | "terminal";
          agent_name?: string;
          workspace: string;
          project: string;
          worktree?: string;
        };
      };

      try {
        const result = await createSession.execute({
          requestId: createMessage.id,
          sessionType: createMessage.payload.session_type,
          agentName: createMessage.payload.agent_name,
          workspace: createMessage.payload.workspace,
          project: createMessage.payload.project,
          worktree: createMessage.payload.worktree,
        });
        sendToDevice(
          socket,
          createMessage.device_id,
          JSON.stringify(result.response)
        );
        messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));

        // Note: Terminal output streaming is now handled via the 'terminalSessionCreated' event
        // emitted by SessionManager. This ensures consistent output handling regardless of
        // how the terminal session was created (via API or supervisor tool).
      } catch (error) {
        logger.error(
          { error, requestId: createMessage.id },
          "Failed to create session"
        );
        sendToDevice(
          socket,
          createMessage.device_id,
          JSON.stringify({
            type: "error",
            id: createMessage.id,
            payload: {
              code:
                error instanceof DomainError ? error.code : "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to create session",
            },
          })
        );
      }
    },

    "supervisor.terminate_session": async (socket, message) => {
      const terminateMessage = message as {
        id: string;
        device_id?: string;
        payload: { session_id: string };
      };

      if (!terminateSession || !messageBroadcaster) {
        sendToDevice(
          socket,
          terminateMessage.device_id,
          JSON.stringify({
            type: "error",
            id: terminateMessage.id,
            payload: {
              code: "INTERNAL_ERROR",
              message: "Server not ready to process terminate requests",
            },
          })
        );
        return;
      }

      try {
        const result = await terminateSession.execute({
          requestId: terminateMessage.id,
          sessionId: terminateMessage.payload.session_id,
        });
        sendToDevice(
          socket,
          terminateMessage.device_id,
          JSON.stringify(result.response)
        );
        messageBroadcaster.broadcastToAll(JSON.stringify(result.broadcast));
      } catch (error) {
        logger.error(
          { error, sessionId: terminateMessage.payload.session_id },
          "Failed to terminate session"
        );
        sendToDevice(
          socket,
          terminateMessage.device_id,
          JSON.stringify({
            type: "error",
            id: terminateMessage.id,
            payload: {
              code:
                error instanceof DomainError ? error.code : "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to terminate session",
            },
          })
        );
      }
    },

    "session.subscribe": async (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const subscribeMessage = message as {
        session_id: string;
        device_id?: string;
      };
      const client =
        clientRegistry.getBySocket(socket) ??
        (subscribeMessage.device_id
          ? clientRegistry.getByDeviceId(
              new DeviceId(subscribeMessage.device_id)
            )
          : undefined);
      if (client?.isAuthenticated) {
        const sessionId = subscribeMessage.session_id;

        // Check if this is an agent session (in-memory or persisted)
        const agentSession = agentSessionManager.getSession(sessionId);
        const isPersistedAgent =
          !agentSession &&
          chatHistoryService
            .getActiveAgentSessions()
            .some((s) => s.sessionId === sessionId);

        if (agentSession || isPersistedAgent) {
          // For agent sessions, just track subscription without sessionManager validation
          client.subscribe(new SessionId(sessionId));
          logger.info(
            {
              deviceId: client.deviceId.value,
              sessionId,
              allSubscriptions: client.getSubscriptions(),
              clientStatus: client.status,
            },
            "Client subscribed to agent session"
          );

          const isExecuting = agentSessionManager.isExecuting(sessionId);

          const currentStreamingBlocks =
            agentMessageAccumulator.get(sessionId) ?? [];

          sendToDevice(
            socket,
            subscribeMessage.device_id,
            JSON.stringify({
              type: "session.subscribed",
              session_id: sessionId,
              is_executing: isExecuting,
              current_streaming_blocks:
                currentStreamingBlocks.length > 0
                  ? currentStreamingBlocks
                  : undefined,
            })
          );

          logger.debug(
            {
              deviceId: client.deviceId.value,
              sessionId,
              isExecuting,
              streamingBlocksCount: currentStreamingBlocks.length,
            },
            "Agent session subscribed (v1.13 - use history.request for messages)"
          );
        } else {
          // For terminal sessions, use full subscriptionService with master logic
          const result = subscriptionService.subscribe(
            client.deviceId.value,
            sessionId
          );
          sendToDevice(
            socket,
            subscribeMessage.device_id,
            JSON.stringify(result)
          );

          // In mock mode, generate fresh terminal output when a client subscribes
          // This ensures the content is sent AFTER the client is subscribed
          if (env.MOCK_MODE) {
            const session = sessionManager.getSession(new SessionId(sessionId));
            if (session?.type === "terminal") {
              // Small delay to ensure subscription is fully processed
              setTimeout(() => {
                // Clear screen and send a welcome banner using printf
                // The escape sequences must be processed by the shell, not sent raw
                const clearAndBanner = `clear && printf '\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\033[1;32m  Tiflis Code - Remote Development Workstation\\033[0m\\n\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n\\033[1;33m  System Information:\\033[0m\\n  ├─ OS:       macOS Sequoia 15.1\\n  ├─ Shell:    zsh 5.9\\n  ├─ Node:     v22.11.0\\n  └─ Uptime:   2 days, 14 hours\\n\\n\\033[1;33m  Active Sessions:\\033[0m\\n  ├─ Claude Code  ─  tiflis/tiflis-code\\n  ├─ Cursor       ─  personal/portfolio\\n  └─ OpenCode     ─  tiflis/tiflis-api\\n\\n\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n'\r`;
                ptyManager.write(
                  session as Parameters<typeof ptyManager.write>[0],
                  clearAndBanner
                );
                logger.info(
                  { sessionId },
                  "Mock mode: Generated terminal banner on subscribe"
                );
              }, 100);
            }
          }
        }
      }
      return Promise.resolve();
    },

    "session.unsubscribe": (socket, message) => {
      if (!subscriptionService) return Promise.resolve();
      const unsubscribeMessage = message as {
        session_id: string;
        device_id?: string;
      };
      const client =
        clientRegistry.getBySocket(socket) ??
        (unsubscribeMessage.device_id
          ? clientRegistry.getByDeviceId(
              new DeviceId(unsubscribeMessage.device_id)
            )
          : undefined);
      if (client?.isAuthenticated) {
        const result = subscriptionService.unsubscribe(
          client.deviceId.value,
          unsubscribeMessage.session_id
        );
        sendToDevice(
          socket,
          unsubscribeMessage.device_id,
          JSON.stringify(result)
        );
      }
      return Promise.resolve();
    },

    "session.execute": async (_socket, message) => {
      const execMessage = message as {
        id: string;
        session_id: string;
        device_id?: string; // Injected by tunnel
        payload: {
          content?: string;
          text?: string;
          audio?: string;
          audio_format?: string;
          message_id?: string;
        };
      };

      const deviceId = execMessage.device_id;
      const sessionId = execMessage.session_id;
      const messageId = execMessage.payload.message_id;

      // Send immediate acknowledgment to client so they can show "Sent" status
      // Use payload.message_id (client's message ID) if available, fallback to command.id
      if (deviceId && messageBroadcaster) {
        const ackMessageId = messageId ?? execMessage.id;
        const ackMessage = {
          type: "message.ack",
          payload: {
            message_id: ackMessageId,
            session_id: sessionId,
            status: "received",
          },
        };
        messageBroadcaster.sendToClient(deviceId, JSON.stringify(ackMessage));
        logger.debug(
          { messageId: ackMessageId, sessionId, deviceId },
          "Sent message.ack for session.execute"
        );
      }

      // Clear any previous cancellation state - new command starts fresh
      cancelledDuringTranscription.delete(sessionId);

      // Handle voice message with audio payload
      if (execMessage.payload.audio) {
        logger.info(
          { sessionId, hasAudio: true, messageId },
          "Received voice message"
        );

        if (!sttService) {
          logger.error(
            { sessionId },
            "STT service not configured, cannot transcribe voice message"
          );
          // Send error back to client
          if (messageBroadcaster) {
            const errorEvent = {
              type: "session.output",
              session_id: sessionId,
              payload: {
                content_type: "transcription",
                content: "",
                content_blocks: [
                  {
                    block_type: "error",
                    content:
                      "Voice transcription not available - STT service not configured",
                  },
                ],
                timestamp: Date.now(),
                is_complete: true,
                message_id: messageId,
              },
            };
            messageBroadcaster.broadcastToSubscribers(
              sessionId,
              JSON.stringify(errorEvent)
            );
          }
          return;
        }

        try {
          // Decode base64 audio
          const audioBuffer = Buffer.from(execMessage.payload.audio, "base64");
          const format = (execMessage.payload.audio_format ??
            "m4a") as AudioFormat;

          // Transcribe audio
          const transcriptionResult = await sttService.transcribe(
            audioBuffer,
            format
          );
          const transcribedText = transcriptionResult.text;

          logger.info(
            {
              sessionId,
              textLength: transcribedText.length,
              language: transcriptionResult.language,
            },
            "Voice message transcribed"
          );

          // Send transcription back to client
          if (messageBroadcaster) {
            const transcriptionEvent = {
              type: "session.transcription",
              session_id: sessionId,
              payload: {
                transcription: transcribedText,
                language: transcriptionResult.language,
                duration: transcriptionResult.duration,
                message_id: messageId,
                timestamp: Date.now(),
                from_device_id: deviceId,
              },
            };
            messageBroadcaster.broadcastToSubscribers(
              sessionId,
              JSON.stringify(transcriptionEvent)
            );
          }

          // Now execute the transcribed text as a command
          // Check if this is an agent session
          let agentSession = agentSessionManager.getSession(sessionId);

          if (!agentSession) {
            const persistedSessions =
              chatHistoryService.getActiveAgentSessions();
            const persistedSession = persistedSessions.find(
              (s) => s.sessionId === sessionId
            );

            if (persistedSession) {
              // Get agent config to resolve aliases to base types
              const agentConfig = getAgentConfig(persistedSession.sessionType);
              const baseType: BaseAgentType =
                agentConfig?.baseType ??
                (persistedSession.sessionType as BaseAgentType);
              const agentName = agentConfig?.isAlias
                ? persistedSession.sessionType
                : undefined;

              logger.info(
                {
                  sessionId,
                  sessionType: persistedSession.sessionType,
                  baseType,
                  agentName,
                },
                "Restoring persisted agent session for voice command"
              );
              agentSession = agentSessionManager.createSession(
                baseType,
                persistedSession.workingDir,
                persistedSession.sessionId,
                agentName
              );
            }
          }

          if (agentSession) {
            // Check if session was cancelled during transcription
            if (cancelledDuringTranscription.has(sessionId)) {
              cancelledDuringTranscription.delete(sessionId);
              logger.info(
                { sessionId, transcribedText },
                "Skipping command execution - session was cancelled during transcription"
              );
              // Don't save voice input or execute command - user cancelled before we could process
              return;
            }

            // Save voice input with audio and transcription to database
            const voiceInputBlock = createVoiceInputBlock(
              transcribedText,
              undefined,
              transcriptionResult.duration
            );
            await chatHistoryService.saveVoiceInput(
              sessionId,
              audioBuffer,
              transcribedText,
              [voiceInputBlock],
              format
            );

            // Track this as a voice command that needs TTS response
            if (messageId && ttsService && deviceId) {
              pendingAgentVoiceCommands.set(sessionId, {
                messageId,
                userCommand: transcribedText,
                deviceId,
              });
              logger.debug(
                { sessionId, messageId, deviceId },
                "Tracking agent voice command for TTS response"
              );
            }

            // Execute transcribed command
            await agentSessionManager.executeCommand(
              sessionId,
              transcribedText
            );
          } else {
            // Fall back to terminal
            const sid = new SessionId(sessionId);
            const session = sessionManager.getSession(sid);
            if (session && isTerminalSession(session)) {
              ptyManager.write(session, transcribedText + "\n");
            }
          }
        } catch (error) {
          logger.error(
            { error, sessionId },
            "Failed to transcribe voice message"
          );
          if (messageBroadcaster) {
            const errorEvent = {
              type: "session.transcription",
              session_id: sessionId,
              payload: {
                transcription: "",
                error:
                  error instanceof Error
                    ? error.message
                    : "Transcription failed",
                message_id: messageId,
                timestamp: Date.now(),
              },
            };
            messageBroadcaster.broadcastToSubscribers(
              sessionId,
              JSON.stringify(errorEvent)
            );
          }
        }
        return;
      }

      // Handle text message (original logic)
      const textContent =
        execMessage.payload.content ?? execMessage.payload.text ?? "";

      try {
        // Check if this is an agent session (in-memory)
        let agentSession = agentSessionManager.getSession(
          execMessage.session_id
        );

        // If not in memory, check if it's a persisted agent session and restore it
        if (!agentSession) {
          const persistedSessions = chatHistoryService.getActiveAgentSessions();
          const persistedSession = persistedSessions.find(
            (s) => s.sessionId === execMessage.session_id
          );

          if (persistedSession) {
            // Get agent config to resolve aliases to base types
            const agentConfig = getAgentConfig(persistedSession.sessionType);
            const baseType: BaseAgentType =
              agentConfig?.baseType ??
              (persistedSession.sessionType as BaseAgentType);
            const agentName = agentConfig?.isAlias
              ? persistedSession.sessionType
              : undefined;

            logger.info(
              {
                sessionId: execMessage.session_id,
                sessionType: persistedSession.sessionType,
                baseType,
                agentName,
              },
              "Restoring persisted agent session"
            );
            // Restore the session in agentSessionManager
            agentSession = agentSessionManager.createSession(
              baseType,
              persistedSession.workingDir,
              persistedSession.sessionId, // Use same session ID
              agentName
            );
          }
        }

        if (agentSession) {
          // Save user message to database for history persistence
          const savedMsgId = chatHistoryService.saveAgentMessage(
            execMessage.session_id,
            "user",
            textContent
          );
          logger.info(
            {
              sessionId: execMessage.session_id,
              messageId: savedMsgId,
              textLength: textContent.length,
            },
            "Saved user message to agent history"
          );

          // Broadcast user message to ALL clients for sync
          // (so other devices see the message immediately)
          if (messageBroadcaster && deviceId) {
            const userMessageEvent = {
              type: "session.user_message",
              session_id: execMessage.session_id,
              payload: {
                content: textContent,
                timestamp: Date.now(),
                from_device_id: deviceId,
              },
            };
            logger.info(
              { deviceId, sessionId: execMessage.session_id },
              "Broadcasting agent user message to all clients"
            );
            messageBroadcaster.broadcastToAll(JSON.stringify(userMessageEvent));
          }

          await agentSessionManager.executeCommand(
            execMessage.session_id,
            textContent
          );
          return;
        }

        // Fall back to terminal input
        const sid = new SessionId(execMessage.session_id);
        const session = sessionManager.getSession(sid);
        if (session && isTerminalSession(session)) {
          ptyManager.write(session, textContent + "\n");
        }
      } catch (error) {
        logger.error(
          { error, sessionId: execMessage.session_id },
          "Failed to execute command"
        );
      }
    },

    "session.cancel": (socket, message) => {
      const cancelMessage = message as {
        id: string;
        session_id: string;
      };

      try {
        const sessionId = cancelMessage.session_id;
        logger.info(
          { sessionId, requestId: cancelMessage.id },
          "session.cancel received"
        );

        let wasCancelled = false;

        // Mark session as cancelled during transcription (prevents execution after STT completes)
        cancelledDuringTranscription.add(sessionId);
        logger.debug(
          { sessionId },
          "Marked session as cancelled during transcription"
        );

        // Try to cancel agent session execution if it exists in memory
        const session = agentSessionManager.getSession(sessionId);
        if (session) {
          agentSessionManager.cancelCommand(sessionId);
          wasCancelled = true;
          logger.info(
            { sessionId },
            "Agent session cancelled via cancelCommand"
          );
        }

        // Always broadcast cancellation message to subscribers
        // This ensures UI updates even if session wasn't in memory
        if (messageBroadcaster) {
          const cancelBlock = {
            id: randomUUID(),
            block_type: "cancel",
            content: "Cancelled by user",
          };
          const cancelOutput = {
            type: "session.output",
            session_id: sessionId,
            payload: {
              content_type: "agent",
              content: "",
              content_blocks: [cancelBlock],
              timestamp: Date.now(),
              is_complete: true,
            },
          };
          messageBroadcaster.broadcastToSubscribers(
            sessionId,
            JSON.stringify(cancelOutput)
          );
          logger.info(
            { sessionId },
            "Broadcasted cancel message to subscribers"
          );

          // Persist cancellation message to database for history sync
          chatHistoryService.saveAgentMessage(sessionId, "assistant", "", [
            cancelBlock,
          ]);
          logger.info({ sessionId }, "Saved agent cancel message to database");
        }

        // Send acknowledgement
        socket.send(
          JSON.stringify({
            type: "response",
            id: cancelMessage.id,
            payload: {
              session_id: sessionId,
              cancelled: true,
              was_executing: wasCancelled,
            },
          })
        );
      } catch (error) {
        logger.error(
          { error, sessionId: cancelMessage.session_id },
          "Failed to cancel session"
        );
        socket.send(
          JSON.stringify({
            type: "error",
            id: cancelMessage.id,
            payload: {
              code: "CANCEL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to cancel session",
            },
          })
        );
      }

      return Promise.resolve();
    },

    "session.input": (_socket, message) => {
      const inputMessage = message as {
        session_id: string;
        payload: { data: string };
      };
      try {
        const sessionId = new SessionId(inputMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session?.type === "terminal") {
          ptyManager.write(
            session as Parameters<typeof ptyManager.write>[0],
            inputMessage.payload.data
          );
        }
      } catch {
        // Invalid session ID
      }
      return Promise.resolve();
    },

    "session.resize": (socket, message) => {
      const resizeMessage = message as {
        session_id: string;
        device_id?: string;
        payload: { cols: number; rows: number };
      };
      try {
        const sessionId = new SessionId(resizeMessage.session_id);
        const session = sessionManager.getSession(sessionId);
        if (session?.type === "terminal") {
          // Get device ID from socket (direct) or message (tunnel)
          const client =
            clientRegistry.getBySocket(socket) ??
            (resizeMessage.device_id
              ? clientRegistry.getByDeviceId(
                  new DeviceId(resizeMessage.device_id)
                )
              : undefined);
          const deviceId = client?.deviceId.value;

          const result = ptyManager.resize(
            session as Parameters<typeof ptyManager.resize>[0],
            resizeMessage.payload.cols,
            resizeMessage.payload.rows,
            deviceId
          );

          // Send resize result back to client
          socket.send(
            JSON.stringify({
              type: "session.resized",
              session_id: resizeMessage.session_id,
              payload: {
                success: result.success,
                cols: result.cols,
                rows: result.rows,
                reason: result.reason,
              },
            })
          );
        }
      } catch {
        // Invalid session ID
      }
      return Promise.resolve();
    },

    "session.replay": (socket, message) => {
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
          socket.send(
            JSON.stringify({
              type: "error",
              session_id: replayMessage.session_id,
              payload: {
                code: "SESSION_NOT_FOUND",
                message: `Session not found: ${replayMessage.session_id}`,
              },
            })
          );
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
            content_type: "terminal" as const,
            content: msg.content,
            timestamp: msg.timestamp,
            sequence: msg.sequence,
          }));

          // Check if there are more messages (if we got exactly the limit, there might be more)
          const hasMore = outputHistory.length === limit;

          // Get sequence range for gap detection on client side
          const firstMsg = outputHistory[0];
          const lastMsg = outputHistory[outputHistory.length - 1];

          socket.send(
            JSON.stringify({
              type: "session.replay.data",
              session_id: replayMessage.session_id,
              payload: {
                messages: replayedMessages,
                has_more: hasMore,
                first_sequence: firstMsg?.sequence ?? 0,
                last_sequence: lastMsg?.sequence ?? 0,
                current_sequence: session.currentSequence,
              },
            })
          );

          logger.debug(
            {
              sessionId: replayMessage.session_id,
              messageCount: replayedMessages.length,
              hasMore,
              sinceTimestamp,
              sinceSequence,
              limit,
              currentSequence: session.currentSequence,
              bufferSize: session.getOutputHistory().length,
            },
            "Terminal session replay sent"
          );
        } else {
          // For agent sessions, use SessionReplayService (if available)
          // For now, return empty replay for non-terminal sessions
          socket.send(
            JSON.stringify({
              type: "session.replay.data",
              session_id: replayMessage.session_id,
              payload: {
                messages: [],
                has_more: false,
                first_sequence: 0,
                last_sequence: 0,
                current_sequence: 0,
              },
            })
          );

          logger.debug(
            { sessionId: replayMessage.session_id, sessionType: session.type },
            "Session replay not implemented for this session type"
          );
        }
      } catch (error) {
        logger.error(
          { error, sessionId: replayMessage.session_id },
          "Failed to replay session"
        );
        socket.send(
          JSON.stringify({
            type: "error",
            session_id: replayMessage.session_id,
            payload: {
              code: "REPLAY_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to replay session",
            },
          })
        );
      }

      return Promise.resolve();
    },

    "history.request": async (socket, message) => {
      const historyRequest = message as {
        id: string;
        device_id?: string;
        payload?: {
          session_id?: string;
          before_sequence?: number;
          limit?: number;
        };
      };

      const sessionId = historyRequest.payload?.session_id;
      const beforeSequence = historyRequest.payload?.before_sequence;
      const limit = historyRequest.payload?.limit;
      const isSupervisor = !sessionId;

      logger.debug(
        { sessionId, isSupervisor, beforeSequence, limit, requestId: historyRequest.id },
        "Paginated history request received"
      );

      try {
        if (isSupervisor) {
          const result = chatHistoryService.getSupervisorHistoryPaginated({
            beforeSequence,
            limit,
          });

          const supervisorHistory = await Promise.all(
            result.messages.map(async (msg) => ({
              message_id: msg.id,
              sequence: msg.sequence,
              role: msg.role,
              content: msg.content,
              content_blocks: await chatHistoryService.enrichBlocksWithAudio(
                msg.contentBlocks,
                msg.audioOutputPath,
                msg.audioInputPath,
                false
              ),
              createdAt: msg.createdAt.toISOString(),
            }))
          );

          const isExecuting = supervisorAgent.isProcessing();

          let currentStreamingBlocks: unknown[] | undefined;
          if (isExecuting && !beforeSequence) {
            const blocks = supervisorMessageAccumulator.get();
            if (blocks && blocks.length > 0) {
              currentStreamingBlocks = blocks;
            }
          }

          socket.send(
            JSON.stringify({
              type: "history.response",
              id: historyRequest.id,
              payload: {
                session_id: null,
                history: supervisorHistory,
                has_more: result.hasMore,
                oldest_sequence: result.oldestSequence,
                newest_sequence: result.newestSequence,
                is_executing: isExecuting,
                current_streaming_blocks: currentStreamingBlocks,
              },
            })
          );

          logger.debug(
            {
              messageCount: supervisorHistory.length,
              hasMore: result.hasMore,
              oldestSeq: result.oldestSequence,
              newestSeq: result.newestSequence,
              isExecuting,
            },
            "Paginated supervisor history sent"
          );
        } else {
          const result = chatHistoryService.getAgentHistoryPaginated(sessionId, {
            beforeSequence,
            limit,
          });

          const enrichedHistory = await Promise.all(
            result.messages.map(async (msg) => ({
              message_id: msg.id,
              sequence: msg.sequence,
              role: msg.role,
              content: msg.content,
              content_blocks: await chatHistoryService.enrichBlocksWithAudio(
                msg.contentBlocks,
                msg.audioOutputPath,
                msg.audioInputPath,
                false
              ),
              createdAt: msg.createdAt.toISOString(),
            }))
          );

          const isExecuting = agentSessionManager.isExecuting(sessionId);

          let currentStreamingBlocks: unknown[] | undefined;
          if (isExecuting && !beforeSequence) {
            const blocks = agentMessageAccumulator.get(sessionId);
            if (blocks && blocks.length > 0) {
              currentStreamingBlocks = blocks;
            }
          }

          socket.send(
            JSON.stringify({
              type: "history.response",
              id: historyRequest.id,
              payload: {
                session_id: sessionId,
                history: enrichedHistory,
                has_more: result.hasMore,
                oldest_sequence: result.oldestSequence,
                newest_sequence: result.newestSequence,
                is_executing: isExecuting,
                current_streaming_blocks: currentStreamingBlocks,
              },
            })
          );

          logger.debug(
            { sessionId, messageCount: enrichedHistory.length, isExecuting },
            "Agent session history sent"
          );
        }
      } catch (error) {
        logger.error({ error, sessionId }, "Failed to get history");
        socket.send(
          JSON.stringify({
            type: "history.response",
            id: historyRequest.id,
            payload: {
              session_id: sessionId ?? null,
              error: error instanceof Error ? error.message : "Failed to get history",
            },
          })
        );
      }
    },

    "audio.request": async (socket, message) => {
      const audioRequest = message as {
        id: string;
        payload: {
          message_id: string;
          type?: "input" | "output";
        };
      };

      const { message_id, type = "output" } = audioRequest.payload;

      logger.debug({ messageId: message_id, type }, "Audio request received");

      try {
        const audioBase64 = await chatHistoryService.getAudioForMessage(
          message_id,
          type
        );

        if (audioBase64) {
          socket.send(
            JSON.stringify({
              type: "audio.response",
              id: audioRequest.id,
              payload: {
                message_id,
                audio_base64: audioBase64,
              },
            })
          );
          logger.debug({ messageId: message_id }, "Audio sent");
        } else {
          socket.send(
            JSON.stringify({
              type: "audio.response",
              id: audioRequest.id,
              payload: {
                message_id,
                error: "Audio not found",
              },
            })
          );
          logger.debug({ messageId: message_id }, "Audio not found");
        }
      } catch (error) {
        logger.error({ error, messageId: message_id }, "Failed to get audio");
        socket.send(
          JSON.stringify({
            type: "audio.response",
            id: audioRequest.id,
            payload: {
              message_id,
              error:
                error instanceof Error ? error.message : "Failed to get audio",
            },
          })
        );
      }
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
        logger.info({ tunnelId, publicUrl }, "🚀 Connected to tunnel");

        // Strip tunnel_id query parameter from URL if present (for backward compatibility)
        // URL should only contain the base address
        const urlObj = new URL(publicUrl);
        urlObj.searchParams.delete("tunnel_id");
        const cleanUrl = urlObj.toString();

        // Generate and display magic link for mobile clients
        // Magic link uses base64-encoded JSON payload
        const payload = {
          tunnel_id: tunnelId,
          url: cleanUrl,
          key: env.WORKSTATION_AUTH_KEY,
        };
        const jsonPayload = JSON.stringify(payload);
        const base64Payload = Buffer.from(jsonPayload, "utf-8").toString(
          "base64"
        );
        const magicLink = `tiflis://connect?data=${encodeURIComponent(
          base64Payload
        )}`;

        logger.info(
          {
            tunnelId,
            publicUrl: cleanUrl,
            magicLink,
          },
          "📱 Magic link for mobile clients"
        );

        // Also print to console for easy copy-paste (using logger for consistency)
        logger.info({ magicLink }, "📱 Magic Link for Mobile App");

        // Print QR code to terminal for easy scanning
        // eslint-disable-next-line no-console
        console.log("\n📱 Scan QR Code to Connect:\n");
        QRCode.toString(
          magicLink,
          { type: "terminal", small: true },
          (err, qr) => {
            if (!err && qr) {
              // eslint-disable-next-line no-console
              console.log(qr);
            }
            // eslint-disable-next-line no-console
            console.log("📱 Magic Link:");
            // eslint-disable-next-line no-console
            console.log(magicLink);
            // eslint-disable-next-line no-console
            console.log("\n");
          }
        );
      },
      onDisconnected: () => {
        logger.warn("Disconnected from tunnel");
      },
      onError: (error) => {
        logger.error({ error }, "Tunnel error");
      },
      onClientMessage: (message) => {
        // Route messages from clients through tunnel
        // Parse and validate the message before routing
        try {
          const data: unknown = JSON.parse(message);
          const messageType = getMessageType(data);

          if (messageType === "auth") {
            handleAuthMessageViaTunnel(
              data,
              tunnelClient,
              authenticateClient,
              logger,
              subscriptionService
            );
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
            "Failed to process client message via tunnel"
          );
        }
      },
      onClientDisconnected: (deviceId) => {
        // Remove client from registry when tunnel notifies us of disconnection
        const removed = clientRegistry.remove(new DeviceId(deviceId));
        logger.info(
          { deviceId, removed },
          "Client disconnected via tunnel notification - removed from registry"
        );
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
    agentSessionManager,
    messageBroadcaster,
    chatHistoryService,
    logger,
  });

  subscriptionService = new SubscriptionService({
    clientRegistry,
    sessionManager,
    subscriptionRepository,
    logger,
  });

  // ─────────────────────────────────────────────────────────────
  // Output Streaming Setup
  // ─────────────────────────────────────────────────────────────

  // Stream agent session output to subscribed clients
  const broadcaster = messageBroadcaster;

  // Accumulator for agent message blocks - save only when complete
  const agentMessageAccumulator = new Map<string, ContentBlock[]>();

  agentSessionManager.on(
    "blocks",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (sessionId: string, blocks: ContentBlock[], isComplete: boolean) => {
      // CRITICAL: Check if session was cancelled - don't broadcast late-arriving blocks
      if (agentSessionManager.wasCancelled(sessionId)) {
        logger.debug(
          { sessionId, blockCount: blocks.length, isComplete },
          "Ignoring agent blocks - session was cancelled"
        );
        return;
      }

      // Filter out status blocks for history persistence (they're transient UI hints)
      const persistableBlocks = blocks.filter((b) => b.block_type !== "status");

      // Accumulate blocks for this session, merging tool blocks in-place
      if (persistableBlocks.length > 0) {
        const accumulated = agentMessageAccumulator.get(sessionId) ?? [];
        const wasEmpty = accumulated.length === 0;
        accumulateBlocks(accumulated, persistableBlocks);
        agentMessageAccumulator.set(sessionId, accumulated);

        // Log first blocks being accumulated (helps debug missing first lines issue)
        if (wasEmpty) {
          logger.debug(
            {
              sessionId,
              firstBlockTypes: persistableBlocks.map((b) => b.block_type),
              firstBlockCount: persistableBlocks.length,
            },
            "Started accumulating blocks for new response"
          );
        }
      }

      // Save to database only when message is complete
      let fullTextContent = "";
      if (isComplete) {
        const allBlocks = agentMessageAccumulator.get(sessionId) ?? [];
        agentMessageAccumulator.delete(sessionId);

        // Warn if completion arrives without accumulated blocks (potential issue)
        if (allBlocks.length === 0) {
          logger.warn(
            {
              sessionId,
              currentBlocks: blocks.map((b) => b.block_type),
              persistableBlocks: persistableBlocks.map((b) => b.block_type),
            },
            "Completion received but no blocks were accumulated - blocks may be lost"
          );
        }

        if (allBlocks.length > 0) {
          // Count block types for debugging
          const blockTypeCounts = allBlocks.reduce<Record<string, number>>(
            (acc, b) => {
              acc[b.block_type] = (acc[b.block_type] ?? 0) + 1;
              return acc;
            },
            {}
          );

          logger.info(
            {
              sessionId,
              totalBlocks: allBlocks.length,
              blockTypes: blockTypeCounts,
            },
            "Saving agent message with accumulated blocks"
          );

          fullTextContent = allBlocks
            .filter((b) => b.block_type === "text")
            .map((b) => b.content)
            .join("\n");

          const hasError = allBlocks.some((b) => b.block_type === "error");
          const role: "assistant" | "system" = hasError
            ? "system"
            : "assistant";
          chatHistoryService.saveAgentMessage(
            sessionId,
            role,
            fullTextContent,
            allBlocks
          );
        }
      }

      // Get accumulated blocks to send full state (iOS expects full state, not incremental)
      const accumulatedBlocks = agentMessageAccumulator.get(sessionId) ?? [];

      // Merge tool blocks with the same tool_use_id
      // This handles the case where tool_use and tool_result arrive as separate blocks
      const mergedBlocks = mergeToolBlocks(accumulatedBlocks);

      // Build full text content from accumulated blocks for backward compat
      const fullAccumulatedText = mergedBlocks
        .filter((b) => b.block_type === "text")
        .map((b) => b.content)
        .join("\n");

      const outputEvent = {
        type: "session.output",
        session_id: sessionId,
        payload: {
          content_type: "agent",
          content: fullAccumulatedText, // Full accumulated text for backward compat
          content_blocks: mergedBlocks, // Full accumulated blocks for rich UI (merged)
          timestamp: Date.now(),
          is_complete: isComplete,
        },
      };

      // Send to all subscribers via broadcaster
      // Broadcaster handles both direct WebSocket and tunnel connections
      broadcaster.broadcastToSubscribers(
        sessionId,
        JSON.stringify(outputEvent)
      );

      // Check if this was a voice command that needs TTS response
      if (isComplete && fullTextContent.length > 0) {
        const pendingVoiceCommand = pendingAgentVoiceCommands.get(sessionId);
        if (pendingVoiceCommand && ttsService) {
          const {
            messageId: pendingMessageId,
            userCommand,
            deviceId: originDeviceId,
          } = pendingVoiceCommand;
          pendingAgentVoiceCommands.delete(sessionId);
          logger.info(
            {
              sessionId,
              messageId: pendingMessageId,
              textLength: fullTextContent.length,
            },
            "Synthesizing TTS response for agent voice command"
          );

          try {
            // Summarize long responses before TTS (if summarization service is available)
            let textForTTS = fullTextContent;
            if (summarizationService) {
              textForTTS = await summarizationService.summarize(
                fullTextContent,
                { userCommand }
              );
              logger.debug(
                {
                  originalLength: fullTextContent.length,
                  summaryLength: textForTTS.length,
                },
                "Response summarized for TTS"
              );
            }

            const ttsResult = await ttsService.synthesize(textForTTS);
            const audioBase64 = ttsResult.audio.toString("base64");

            // Create voice output block for history (without audio_base64 to save storage)
            const voiceOutputBlock = createVoiceOutputBlock(textForTTS, {
              messageId: pendingMessageId,
              duration: ttsResult.duration,
            });

            // Save TTS audio to disk and append voice_output block to message
            await chatHistoryService.saveTTSWithVoiceBlock(
              sessionId,
              ttsResult.audio,
              voiceOutputBlock,
              "mp3"
            );

            // Send voice output message to subscribers of this session
            const voiceOutputEvent = {
              type: "session.voice_output",
              session_id: sessionId,
              payload: {
                text: textForTTS,
                audio_base64: audioBase64,
                audio_format: "mp3",
                duration: ttsResult.duration,
                message_id: pendingMessageId,
                timestamp: Date.now(),
                from_device_id: originDeviceId,
              },
            };
            broadcaster.broadcastToSubscribers(
              sessionId,
              JSON.stringify(voiceOutputEvent)
            );
            logger.info(
              { sessionId, audioSize: ttsResult.audio.length },
              "TTS response sent and saved for agent session"
            );
          } catch (error) {
            logger.error(
              { error, sessionId },
              "Failed to synthesize TTS response for agent session"
            );
          }
        }
      }
    }
  );

  // Stream Supervisor Agent output to ALL clients (supervisor chat is global/shared)
  supervisorAgent.on(
    "blocks",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (
      deviceId: string,
      blocks: ContentBlock[],
      isComplete: boolean,
      finalOutput?: string,
      _allBlocks?: ContentBlock[]  // Not used - we use our own accumulator
    ) => {
      // CRITICAL: Check if supervisor was cancelled - don't broadcast late-arriving blocks
      const wasCancelled = supervisorAgent.wasCancelled();
      logger.debug(
        { deviceId, blockCount: blocks.length, isComplete, wasCancelled },
        "Supervisor blocks event received"
      );
      if (wasCancelled) {
        logger.info(
          { deviceId, blockCount: blocks.length, isComplete },
          "Ignoring supervisor blocks - execution was cancelled"
        );
        supervisorMessageAccumulator.clear();
        return;
      }

      // Filter out status blocks (transient UI hints)
      const persistableBlocks = blocks.filter((b) => b.block_type !== "status");

      if (persistableBlocks.length > 0) {
        supervisorMessageAccumulator.accumulate(persistableBlocks);
      }

      const mergedBlocks = mergeToolBlocks(supervisorMessageAccumulator.get());

      // Build plain text content for backward compatibility
      const textContent = mergedBlocks
        .filter((b) => b.block_type === "text")
        .map((b) => b.content)
        .join("\n");

      const outputEvent = {
        type: "supervisor.output",
        payload: {
          content_type: "supervisor",
          content: textContent,
          content_blocks: mergedBlocks,
          timestamp: Date.now(),
          is_complete: isComplete,
        },
      };

      const message = JSON.stringify(outputEvent);

      // Broadcast to ALL clients since supervisor chat is shared across devices
      broadcaster.broadcastToAll(message);

      if (isComplete) {
        supervisorMessageAccumulator.clear();
      }

      // Save assistant response to persistent history when streaming completes (global)
      if (isComplete && finalOutput && finalOutput.length > 0) {
        // Save with merged content blocks for history restoration
        // Use mergedBlocks (already computed above) for consistency
        chatHistoryService.saveSupervisorMessage(
          "assistant",
          finalOutput,
          mergedBlocks
        );

        // Check if this was a voice command that needs TTS response
        const pendingVoiceCommand =
          pendingSupervisorVoiceCommands.get(deviceId);
        if (pendingVoiceCommand && ttsService) {
          const { messageId: pendingMessageId, userCommand } =
            pendingVoiceCommand;
          pendingSupervisorVoiceCommands.delete(deviceId);
          logger.info(
            {
              deviceId,
              messageId: pendingMessageId,
              textLength: finalOutput.length,
            },
            "Synthesizing TTS response for supervisor voice command"
          );

          try {
            // Summarize long responses before TTS (if summarization service is available)
            let textForTTS = finalOutput;
            if (summarizationService) {
              textForTTS = await summarizationService.summarize(finalOutput, {
                userCommand,
              });
              logger.debug(
                {
                  originalLength: finalOutput.length,
                  summaryLength: textForTTS.length,
                },
                "Response summarized for TTS"
              );
            }

            const ttsResult = await ttsService.synthesize(textForTTS);
            const audioBase64 = ttsResult.audio.toString("base64");

            // Create voice output block for history (without audio_base64 to save storage)
            const voiceOutputBlock = createVoiceOutputBlock(textForTTS, {
              messageId: pendingMessageId,
              duration: ttsResult.duration,
            });

            // Save TTS audio to disk and append voice_output block to message
            // Use 'supervisor' as the session ID (global supervisor session)
            await chatHistoryService.saveTTSWithVoiceBlock(
              "supervisor",
              ttsResult.audio,
              voiceOutputBlock,
              "mp3"
            );

            // Send voice output message to all clients
            const voiceOutputEvent = {
              type: "supervisor.voice_output",
              payload: {
                text: textForTTS,
                audio_base64: audioBase64,
                audio_format: "mp3",
                duration: ttsResult.duration,
                message_id: pendingMessageId,
                timestamp: Date.now(),
                from_device_id: deviceId,
              },
            };
            broadcaster.broadcastToAll(JSON.stringify(voiceOutputEvent));
            logger.info(
              {
                deviceId,
                fromDeviceId: deviceId,
                audioSize: ttsResult.audio.length,
              },
              "TTS supervisor voice_output sent with from_device_id"
            );
          } catch (error) {
            logger.error(
              { error, deviceId },
              "Failed to synthesize TTS response"
            );
          }
        }
      }
    }
  );

  // Broadcast agent session creation to all clients
  // Listen for agent sessions created from ANY source (API, supervisor tool, etc.)
  agentSessionManager.on("sessionCreated", (state: AgentSessionState) => {
    logger.info(
      {
        sessionId: state.sessionId,
        agentType: state.agentType,
        workingDir: state.workingDir,
      },
      "Agent session created via event, broadcasting to clients"
    );

    // Broadcast session.created to all clients
    // Include agent_name only if it differs from base type (i.e., it's an alias)
    const agentNameForBroadcast =
      state.agentName !== state.agentType ? state.agentName : undefined;
    const broadcastMessage: SessionCreatedMessage = {
      type: "session.created",
      session_id: state.sessionId,
      payload: {
        session_type: state.agentType,
        agent_name: agentNameForBroadcast,
        working_dir: state.workingDir,
        // workspace/project are not available in AgentSessionState
        // Clients will get full info from sync.state if needed
      },
    };
    broadcaster.broadcastToAll(JSON.stringify(broadcastMessage));

    // Record session in database for history persistence
    // Pass agentName to preserve alias (e.g., 'zai') for session restoration
    chatHistoryService.recordSessionCreated({
      sessionId: state.sessionId,
      sessionType: state.agentType,
      agentName: state.agentName,
      workingDir: state.workingDir,
    });
  });

  // Stream terminal output to subscribed clients
  // Listen for terminal sessions created from ANY source (API, supervisor tool, etc.)
  // This ensures broadcast and output handler attachment regardless of creation path
  sessionManager.on("terminalSessionCreated", (session: TerminalSession) => {
    const sessionId = session.id;

    logger.info(
      { sessionId: sessionId.value, workingDir: session.workingDir },
      "Terminal session created via event, attaching output handler"
    );

    // Broadcast session.created to all clients
    const broadcastMessage: SessionCreatedMessage = {
      type: "session.created",
      session_id: sessionId.value,
      payload: {
        session_type: "terminal",
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
        type: "session.output",
        session_id: sessionId.value,
        payload: {
          content_type: "terminal",
          content: data,
          timestamp: outputMessage.timestamp,
          sequence: outputMessage.sequence,
        },
      };

      broadcaster.broadcastToSubscribers(
        sessionId.value,
        JSON.stringify(outputEvent)
      );
    });
  });

  // Create mock terminal session for screenshots (after event handlers are set up)
  // This ensures the terminalSessionCreated event triggers output buffer attachment
  if (env.MOCK_MODE) {
    const terminalSession = await sessionManager.createSession({
      sessionType: "terminal",
      workingDir: env.WORKSPACES_ROOT,
      terminalSize: { cols: 80, rows: 24 },
    });
    logger.info(
      { sessionId: terminalSession.id.value },
      "Pre-created terminal session for screenshots"
    );

    // Run commands in the terminal to show some content for screenshots
    if (terminalSession.type === "terminal") {
      // Use a longer delay to ensure the output handler is fully attached
      setTimeout(() => {
        try {
          // Run printf to show the content - the output will display nicely with colors
          const command = `printf $'\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\033[1;32m  Tiflis Code - Remote Development Workstation\\033[0m\\n\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n\\033[1;33m  System Information:\\033[0m\\n  ├─ OS:       macOS Sequoia 15.1\\n  ├─ Shell:    zsh 5.9\\n  ├─ Node:     v22.11.0\\n  └─ Uptime:   2 days, 14 hours\\n\\n\\033[1;33m  Active Sessions:\\033[0m\\n  ├─ Claude Code  ─  tiflis/tiflis-code\\n  ├─ Cursor       ─  personal/portfolio\\n  └─ OpenCode     ─  tiflis/tiflis-api\\n\\n\\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n'`;
          ptyManager.write(terminalSession as TerminalSession, command + "\r");
          logger.info("Ran terminal commands for screenshots");

          // Check buffer status after a short delay
          setTimeout(() => {
            const ts = terminalSession as TerminalSession;
            const history = ts.getOutputHistory();
            logger.info(
              {
                sessionId: ts.id.value,
                bufferSize: history.length,
                currentSequence: ts.currentSequence,
              },
              "Terminal output buffer status after command"
            );
          }, 500);
        } catch (error) {
          logger.warn({ error }, "Failed to run terminal commands");
        }
      }, 100);
    }
  }

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
      "HTTP server started"
    );
  } catch (error) {
    logger.fatal({ error }, "Failed to start HTTP server");
    process.exit(1);
  }

  // Connect to tunnel
  try {
    await tunnelClient.connect();
  } catch (error) {
    logger.error({ error }, "Failed to connect to tunnel (will retry)");
    // Tunnel client will automatically retry
  }

  // Graceful shutdown with timeout
  const SHUTDOWN_TIMEOUT_MS = 10000; // 10 seconds max for graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress, forcing exit");
      process.exit(1);
    }
    isShuttingDown = true;

    logger.info({ signal }, "Shutdown signal received");

    // Set up force exit timeout
    const forceExitTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Disconnect from tunnel (fast, non-blocking)
      logger.info("Disconnecting from tunnel...");
      tunnelClient.disconnect();

      // Cleanup agent sessions (kills all agent processes)
      logger.info("Cleaning up agent sessions...");
      agentSessionManager.cleanup();

      // Terminate all sessions with timeout
      // Each terminal session has its own 2s timeout, but we wrap in overall timeout
      logger.info("Terminating all sessions...");
      const terminatePromise = sessionManager.terminateAll();
      const sessionTimeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Session termination timeout")), 5000);
      });

      try {
        await Promise.race([terminatePromise, sessionTimeoutPromise]);
        logger.info("All sessions terminated");
      } catch (error) {
        logger.warn({ error }, "Session termination timed out, continuing shutdown");
      }

      // Close HTTP server with timeout
      logger.info("Closing HTTP server...");
      const closePromise = app.close();
      const closeTimeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("HTTP server close timeout")), 2000);
      });

      try {
        await Promise.race([closePromise, closeTimeoutPromise]);
      } catch (error) {
        logger.warn({ error }, "HTTP server close timed out, continuing shutdown");
      }

      // Close database (should be fast)
      logger.info("Closing database...");
      closeDatabase();

      clearTimeout(forceExitTimeout);
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
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
