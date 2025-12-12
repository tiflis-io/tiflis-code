/**
 * @file domain-errors.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Base class for all domain errors.
 * Provides structured error information for protocol responses.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Error thrown when the auth key provided by a client is invalid.
 */
export class InvalidAuthKeyError extends DomainError {
  readonly code = 'INVALID_AUTH_KEY';
  readonly statusCode = 401;

  constructor() {
    super('Invalid authentication key');
  }
}

/**
 * Error thrown when a session with the specified ID is not found.
 */
export class SessionNotFoundError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';
  readonly statusCode = 404;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
  }
}

/**
 * Error thrown when a session is busy processing another command.
 */
export class SessionBusyError extends DomainError {
  readonly code = 'SESSION_BUSY';
  readonly statusCode = 409;

  constructor(sessionId: string) {
    super(`Session is busy: ${sessionId}`);
  }
}

/**
 * Error thrown when a message payload is invalid.
 */
export class InvalidPayloadError extends DomainError {
  readonly code = 'INVALID_PAYLOAD';
  readonly statusCode = 400;

  constructor(message = 'Invalid request payload') {
    super(message);
  }
}

/**
 * Error thrown when an internal server error occurs.
 */
export class InternalError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;

  constructor(message = 'An internal error occurred') {
    super(message);
  }
}

/**
 * Error thrown when a workspace is not found.
 */
export class WorkspaceNotFoundError extends DomainError {
  readonly code = 'WORKSPACE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(workspace: string) {
    super(`Workspace not found: ${workspace}`);
  }
}

/**
 * Error thrown when a project is not found.
 */
export class ProjectNotFoundError extends DomainError {
  readonly code = 'PROJECT_NOT_FOUND';
  readonly statusCode = 404;

  constructor(workspace: string, project: string) {
    super(`Project not found: ${workspace}/${project}`);
  }
}

/**
 * Error thrown when maximum session limit is reached.
 */
export class SessionLimitReachedError extends DomainError {
  readonly code = 'SESSION_LIMIT_REACHED';
  readonly statusCode = 429;

  constructor(sessionType: string, limit: number) {
    super(`Maximum ${sessionType} sessions limit (${limit}) reached`);
  }
}

/**
 * Error thrown when session creation fails.
 */
export class SessionCreationError extends DomainError {
  readonly code = 'SESSION_CREATION_FAILED';
  readonly statusCode = 500;

  constructor(reason: string) {
    super(`Failed to create session: ${reason}`);
  }
}

/**
 * Error thrown when an agent command fails.
 */
export class AgentCommandError extends DomainError {
  readonly code = 'AGENT_COMMAND_FAILED';
  readonly statusCode = 500;

  constructor(reason: string) {
    super(`Agent command failed: ${reason}`);
  }
}

/**
 * Error thrown when the client is not subscribed to a session.
 */
export class NotSubscribedError extends DomainError {
  readonly code = 'NOT_SUBSCRIBED';
  readonly statusCode = 403;

  constructor(sessionId: string) {
    super(`Not subscribed to session: ${sessionId}`);
  }
}

/**
 * Error thrown when the workstation is not connected to the tunnel.
 */
export class TunnelNotConnectedError extends DomainError {
  readonly code = 'TUNNEL_NOT_CONNECTED';
  readonly statusCode = 503;

  constructor() {
    super('Workstation is not connected to tunnel');
  }
}

