/**
 * Error classes thrown by LicenserClient. All extend the base LicenserError
 * so callers can do `catch (e) { if (e instanceof LicenserError) ... }`.
 */

export class LicenserError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LicenserError';
  }
}

export class NetworkError extends LicenserError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends NetworkError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class HttpError extends LicenserError {
  constructor(public readonly status: number, public readonly body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpError';
  }
}
