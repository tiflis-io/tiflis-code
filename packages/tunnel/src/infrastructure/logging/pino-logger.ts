/**
 * @file pino-logger.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  level: string;
  name: string;
  pretty?: boolean;
}

/**
 * Creates a configured pino logger instance.
 */
export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    name: config.name,
    level: config.level,
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Redact sensitive data from logs
    redact: {
      paths: [
        'api_key',
        'auth_key',
        'payload.api_key',
        'payload.auth_key',
        '*.api_key',
        '*.auth_key',
      ],
      censor: '****',
    },
  };

  // Use pino-pretty for development
  if (config.pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

export type { Logger } from 'pino';

