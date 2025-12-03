# TypeScript & Node.js Server Stack

> Technology stack, architecture, and best practices for server-side components.

**Last Updated:** 2025-12-03

---

## Overview

This document defines the development standards for **tiflis-code-tunnel** and **tiflis-code-workstation** servers.

---

## Technology Stack

### Runtime & Language

| Technology     | Version | Purpose                              |
| -------------- | ------- | ------------------------------------ |
| **Node.js**    | 22 LTS  | JavaScript runtime                   |
| **TypeScript** | 5.x     | Static typing, strict mode enabled   |
| **pnpm**       | 9.x+    | Fast, disk-efficient package manager |

### Core Libraries

| Library      | Purpose               | Notes                                       |
| ------------ | --------------------- | ------------------------------------------- |
| **Fastify**  | HTTP server framework | Fast, low-overhead, TypeScript-first        |
| **ws**       | WebSocket server      | Battle-tested, performant                   |
| **node-pty** | PTY (pseudo-terminal) | For terminal sessions (workstation only)    |
| **zod**      | Schema validation     | Runtime type checking for protocol messages |
| **pino**     | Structured logging    | Fast JSON logger                            |
| **dotenv**   | Environment config    | Load .env files                             |

### AI/LLM Stack (Workstation only)

| Library                  | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| **@langchain/core**      | LangChain core framework for building AI agents           |
| **@langchain/langgraph** | LangGraph for stateful agent graphs with tools            |
| **@langchain/openai**    | LangChain OpenAI integration (works with compatible APIs) |
| **nanoid**               | Unique ID generation for sessions and messages            |

> **LLM Provider Support**: The Supervisor Agent uses LangGraph with OpenAI-compatible APIs:
>
> - **OpenAI** (gpt-4o, gpt-4o-mini)
> - **Cerebras** (llama3.1-70b, llama3.1-8b) via OpenAI-compatible API
> - **Anthropic** (claude-3-5-sonnet, claude-3-haiku) via OpenAI-compatible API

> **Speech Provider Support**:
>
> - **TTS**: OpenAI (tts-1, tts-1-hd), ElevenLabs (eleven_multilingual_v2, eleven_flash_v2_5)
> - **STT**: OpenAI Whisper (whisper-1), ElevenLabs

### Data Persistence (Workstation only)

| Library            | Purpose                                      |
| ------------------ | -------------------------------------------- |
| **better-sqlite3** | Embedded SQLite database (fast, synchronous) |
| **drizzle-orm**    | TypeScript ORM with type-safe queries        |
| **drizzle-kit**    | Database migrations                          |

> **Storage Strategy**: SQLite for metadata (messages, sessions, timestamps), file system for audio blobs. No external database required.

### Development Tools

| Tool            | Purpose                                |
| --------------- | -------------------------------------- |
| **tsx**         | TypeScript execution (dev mode)        |
| **tsup**        | TypeScript bundler (production builds) |
| **vitest**      | Unit & integration testing             |
| **eslint**      | Code linting (v9 flat config)          |
| **prettier**    | Code formatting                        |
| **husky**       | Git hooks                              |
| **lint-staged** | Pre-commit linting                     |

---

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## ESLint 9 Configuration

ESLint 9 uses the new **flat config** format (`eslint.config.js`):

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/"],
  }
);
```

**Required packages:**

| Package             | Purpose                |
| ------------------- | ---------------------- |
| `eslint`            | ESLint v9 core         |
| `@eslint/js`        | Base recommended rules |
| `typescript-eslint` | TypeScript support     |

---

## Architecture: Clean Architecture + CQRS

### Layer Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  Adapters — WebSocket, HTTP, PTY, Speech APIs, File System      │
│  • Implements ports defined in Domain                           │
│  • Depends on Application and Domain                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  Use Cases — Commands, Queries, Services                        │
│  • Orchestrates domain logic                                    │
│  • Depends only on Domain                                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Domain Layer                               │
│  Core — Entities, Value Objects, Ports (interfaces)             │
│  • Zero external dependencies                                   │
│  • Pure TypeScript, fully testable                              │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.ts                     # Fastify app setup
│
├── domain/                    # Business logic (no external deps)
│   ├── entities/              # Session, Client, etc.
│   ├── value-objects/         # SessionId, AuthKey, etc.
│   ├── errors/                # Typed domain errors
│   └── ports/                 # Interfaces (ports)
│
├── application/               # Use cases
│   ├── commands/              # CreateSession, TerminateSession
│   ├── queries/               # ListSessions
│   └── services/              # SubscriptionService, etc.
│
├── infrastructure/            # External adapters
│   ├── websocket/             # WebSocket server/client
│   ├── http/                  # Health routes
│   ├── agents/                # Agent implementations (workstation)
│   ├── terminal/              # PTY manager (workstation)
│   ├── speech/                # STT/TTS services (workstation)
│   ├── persistence/           # Database, repositories
│   └── logging/               # Pino logger
│
├── protocol/                  # Protocol types & validation
│   ├── messages.ts            # All message type definitions
│   ├── schemas.ts             # Zod schemas for validation
│   └── errors.ts              # Protocol error codes
│
└── config/
    ├── env.ts                 # Environment variables
    └── constants.ts           # Application constants
```

---

## Protocol Message Handling

### Zod Schema Validation

```typescript
// protocol/schemas.ts
import { z } from "zod";

export const CreateSessionPayloadSchema = z.object({
  session_type: z.enum(["cursor", "claude", "opencode", "terminal"]),
  workspace: z.string().min(1),
  project: z.string().min(1),
  worktree: z.string().optional(),
});

// Type inference from schema
export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;
```

### Message Router Pattern

```typescript
// infrastructure/websocket/message-router.ts
export class MessageRouter {
  async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const parsed = JSON.parse(raw);

    switch (parsed.type) {
      case "supervisor.create_session": {
        const result = SupervisorCreateSessionSchema.safeParse(parsed);
        if (!result.success) {
          return this.sendError(ws, parsed.id, "INVALID_PAYLOAD", result.error);
        }
        return this.handleCreateSession(ws, result.data);
      }
      // ... other cases
    }
  }
}
```

---

## Error Handling

### Domain Errors

```typescript
// domain/errors/domain-errors.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

export class SessionNotFoundError extends DomainError {
  readonly code = "SESSION_NOT_FOUND";
  readonly statusCode = 404;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
  }
}

export class SessionBusyError extends DomainError {
  readonly code = "SESSION_BUSY";
  readonly statusCode = 409;

  constructor(sessionId: string) {
    super(`Session is busy: ${sessionId}`);
  }
}
```

### Error Handling in Use Cases

```typescript
try {
  await useCase.execute(sessionId, command);
} catch (error) {
  if (error instanceof DomainError) {
    this.sendError(ws, requestId, error.code, error.message);
  } else {
    this.logger.error({ error }, "Unexpected error");
    this.sendError(
      ws,
      requestId,
      "INTERNAL_ERROR",
      "An unexpected error occurred"
    );
  }
}
```

---

## Logging Best Practices

```typescript
import pino from "pino";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Redact sensitive data
    redact: ["auth_key", "api_key", "password", "*.auth_key"],
  });
}

// Usage
const logger = createLogger("workstation");
logger.info({ sessionId, sessionType }, "Session created");
logger.error({ error, sessionId }, "Failed to execute command");

// Child loggers for request context
const requestLogger = logger.child({ requestId, clientId });
```

---

## Startup Banner

> **⚠️ MANDATORY**: All backend servers must display a startup banner.

| Element            | Required | Description                             |
| ------------------ | -------- | --------------------------------------- |
| **ASCII Logo**     | ✅       | From `assets/branding/ascii-art.txt`    |
| **Component Name** | ✅       | "Tunnel Server" or "Workstation Server" |
| **Version**        | ✅       | Current version from `package.json`     |
| **Copyright**      | ✅       | `© 2025 Roman Barinov`                  |
| **License**        | ✅       | `MIT License`                           |

### Color Scheme

```typescript
const colors = {
  dim: "\x1b[2m",
  blue: "\x1b[38;5;69m",
  purple: "\x1b[38;5;135m",
  white: "\x1b[97m",
  reset: "\x1b[0m",
};
```

---

## Connection Resilience

### Tunnel Server Requirements

| Requirement                       | Implementation                                              |
| --------------------------------- | ----------------------------------------------------------- |
| **Workstation Health Monitoring** | Heartbeat every 20s, timeout after 30s                      |
| **Client Notification**           | Broadcast `workstation_offline`/`workstation_online` events |
| **Tunnel ID Persistence**         | Allow workstation to reclaim tunnel_id on reconnect         |
| **Graceful Degradation**          | Queue messages during brief disconnections                  |

### Workstation Server Requirements

| Requirement               | Implementation                                         |
| ------------------------- | ------------------------------------------------------ |
| **Tunnel Reconnection**   | Auto-reconnect with exponential backoff (1s → 30s max) |
| **Session Persistence**   | Sessions survive workstation-tunnel reconnection       |
| **Subscription Recovery** | Restore client subscriptions after reconnect           |
| **Message Buffering**     | Buffer messages during disconnection                   |
| **Client State Sync**     | Support `sync` message for state recovery              |

---

## Data Persistence

### Storage Architecture

```
~/.tiflis-code/
├── tiflis.db              # SQLite database
├── audio/
│   ├── input/             # User voice recordings
│   └── output/            # TTS synthesized audio
└── logs/
    └── workstation.log
```

### Database Schema (Drizzle)

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  workspace: text("workspace"),
  project: text("project"),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

### Data Retention Policy

| Data Type                   | Retention        | Cleanup Trigger                   |
| --------------------------- | ---------------- | --------------------------------- |
| **Active session messages** | Indefinite       | Manual clear or session terminate |
| **Terminated session data** | 30 days          | Background cleanup job            |
| **Audio recordings**        | Same as messages | Deleted with message              |

---

## Graceful Shutdown

```typescript
async function bootstrap() {
  const { wsServer, httpServer, sessionManager } = createApp();

  await httpServer.listen({ port: config.PORT, host: "0.0.0.0" });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    wsServer.close();
    wsServer.broadcast({
      type: "server.shutdown",
      payload: { reason: signal },
    });
    await sessionManager.terminateAll();
    await httpServer.close();

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
```

---

## Testing Strategy

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("CreateSessionUseCase", () => {
  let useCase: CreateSessionUseCase;
  let mockAgentExecutor: AgentExecutor;

  beforeEach(() => {
    mockAgentExecutor = {
      spawn: vi.fn().mockResolvedValue({ pid: 1234 }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new CreateSessionUseCase(
      new InMemorySessionManager(),
      mockAgentExecutor
    );
  });

  it("should create a new agent session", async () => {
    const session = await useCase.execute({
      sessionType: "claude",
      workspace: "tiflis",
      project: "tiflis-code",
    });

    expect(session.id).toBeDefined();
    expect(session.type).toBe("claude");
    expect(mockAgentExecutor.spawn).toHaveBeenCalled();
  });
});
```

---

## Docker Configuration

Multi-architecture Dockerfile supporting `linux/amd64` and `linux/arm64`:

```dockerfile
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/tiflis-io/tiflis-code"
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 tiflis
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
RUN chown -R tiflis:nodejs /app
USER tiflis
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["node", "dist/main.js"]
```

---

## Environment Variables

### Tunnel Server

| Variable                      | Required | Default | Description                                         |
| ----------------------------- | -------- | ------- | --------------------------------------------------- |
| `PORT`                        | No       | `3000`  | HTTP/WebSocket port                                 |
| `LOG_LEVEL`                   | No       | `info`  | Logging level                                       |
| `TUNNEL_REGISTRATION_API_KEY` | Yes      | —       | API key for workstation registration (min 32 chars) |

### Workstation Server

| Variable               | Required | Default          | Description                     |
| ---------------------- | -------- | ---------------- | ------------------------------- |
| `TUNNEL_URL`           | Yes      | —                | Tunnel server WebSocket URL     |
| `TUNNEL_API_KEY`       | Yes      | —                | API key for tunnel registration |
| `WORKSTATION_AUTH_KEY` | Yes      | —                | Auth key for client connections |
| `WORKSPACES_ROOT`      | No       | `~/work`         | Root directory for workspaces   |
| `DATA_DIR`             | No       | `~/.tiflis-code` | Data directory                  |

### Agent/LLM Configuration

| Variable           | Required | Default       | Description                                |
| ------------------ | -------- | ------------- | ------------------------------------------ |
| `AGENT_PROVIDER`   | No       | `openai`      | LLM provider (openai, cerebras, anthropic) |
| `AGENT_API_KEY`    | Yes      | —             | API key for LLM provider                   |
| `AGENT_MODEL_NAME` | No       | `gpt-4o-mini` | Model name                                 |

### Speech Configuration

| Variable       | Required | Default  |
| -------------- | -------- | -------- |
| `STT_PROVIDER` | No       | `openai` |
| `STT_API_KEY`  | Yes      | —        |
| `TTS_PROVIDER` | No       | `openai` |
| `TTS_API_KEY`  | Yes      | —        |

> See `packages/*/env.example` for full configuration.

---

## References

- [PROTOCOL.md](../PROTOCOL.md) — WebSocket protocol specification
- [Fastify Documentation](https://fastify.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Zod Documentation](https://zod.dev/)
