// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

/**
 * Development-only logger that silences output in production.
 * Use this instead of console.log/warn/error for debugging.
 */

const isDev = import.meta.env.DEV;

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

function createLogger(level: LogLevel) {
  return (...args: unknown[]): void => {
    if (isDev) {
      console[level](...args);
    }
  };
}

export const logger = {
  log: createLogger('log'),
  info: createLogger('info'),
  warn: createLogger('warn'),
  error: createLogger('error'),
  debug: createLogger('debug'),
};

/**
 * Log with a prefix emoji for visual debugging.
 */
export const devLog = {
  audio: (...args: unknown[]) => logger.log('🔊', ...args),
  voice: (...args: unknown[]) => logger.log('🎤', ...args),
  ws: (...args: unknown[]) => logger.log('🔌', ...args),
  message: (...args: unknown[]) => logger.log('💬', ...args),
  session: (...args: unknown[]) => logger.log('📋', ...args),
  auth: (...args: unknown[]) => logger.log('🔐', ...args),
};
