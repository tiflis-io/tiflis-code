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
 * Error thrown when the API key provided for workstation registration is invalid.
 */
export class InvalidApiKeyError extends DomainError {
  readonly code = 'INVALID_API_KEY';
  readonly statusCode = 401;

  constructor() {
    super('Invalid API key for workstation registration');
  }
}

/**
 * Error thrown when the auth key provided by a mobile client is invalid.
 */
export class InvalidAuthKeyError extends DomainError {
  readonly code = 'INVALID_AUTH_KEY';
  readonly statusCode = 401;

  constructor() {
    super('Invalid authentication key');
  }
}

/**
 * Error thrown when a tunnel with the specified ID is not found.
 */
export class TunnelNotFoundError extends DomainError {
  readonly code = 'TUNNEL_NOT_FOUND';
  readonly statusCode = 404;

  constructor(tunnelId: string) {
    super(`Tunnel not found: ${tunnelId}`);
  }
}

/**
 * Error thrown when attempting to connect to an offline workstation.
 */
export class WorkstationOfflineError extends DomainError {
  readonly code = 'WORKSTATION_OFFLINE';
  readonly statusCode = 503;

  constructor(tunnelId: string) {
    super(`Workstation is offline: ${tunnelId}`);
  }
}

/**
 * Error thrown when workstation registration fails.
 */
export class RegistrationFailedError extends DomainError {
  readonly code = 'REGISTRATION_FAILED';
  readonly statusCode = 500;

  constructor(reason: string) {
    super(`Workstation registration failed: ${reason}`);
  }
}

/**
 * Error thrown when a message payload is invalid.
 */
export class InvalidPayloadError extends DomainError {
  readonly code = 'INVALID_PAYLOAD';
  readonly statusCode = 400;
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
 * Error thrown when attempting to register a workstation with an already-used tunnel ID.
 */
export class TunnelIdAlreadyExistsError extends DomainError {
  readonly code = 'TUNNEL_ID_EXISTS';
  readonly statusCode = 409;

  constructor(tunnelId: string) {
    super(`Tunnel ID already exists: ${tunnelId}`);
  }
}

