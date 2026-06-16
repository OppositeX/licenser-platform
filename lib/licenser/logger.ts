/**
 * Persisted system log. Surfaced on /admin/logs. Failures are swallowed so
 * logging never breaks a request path.
 */
import { db } from './db';

export type LogLevel = 'info' | 'warn' | 'error';

export async function log(level: LogLevel, channel: string, message: string, context: Record<string, unknown> = {}): Promise<void> {
  try {
    await db().from('logs').insert({ level, channel, message, context });
  } catch {
    /* never fatal */
  }
}

export const logger = {
  info:  (channel: string, message: string, context?: Record<string, unknown>) => log('info', channel, message, context ?? {}),
  warn:  (channel: string, message: string, context?: Record<string, unknown>) => log('warn', channel, message, context ?? {}),
  error: (channel: string, message: string, context?: Record<string, unknown>) => log('error', channel, message, context ?? {}),
};
