export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /signature/i,
  /api[_-]?key/i,
  /aadhaar/i,
  /idnumber/i,
  /license/i,
  /licence/i,
  /bankaccount/i,
  /accountnumber/i,
];

const AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9-_=.]+/gi;

/**
 * Recursively redacts sensitive keys and values from objects, arrays, and strings.
 */
export function redactSensitiveData(data: any, depth = 0): any {
  if (depth > 6) return '[MaxDepthReached]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let sanitized = data
      .replace(BEARER_REGEX, 'Bearer [REDACTED]')
      .replace(AADHAAR_REGEX, '****-****-[REDACTED]')
      .replace(PAN_REGEX, '*****[REDACTED]');
    return sanitized;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        if (typeof val === 'string' && val.length > 4 && /bank|account/i.test(key)) {
          cleanObj[key] = `****${val.slice(-4)}`;
        } else {
          cleanObj[key] = '[REDACTED]';
        }
      } else {
        cleanObj[key] = redactSensitiveData(val, depth + 1);
      }
    }
    return cleanObj;
  }

  return data;
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  action?: string;
  orderId?: string;
  deliveryId?: string;
  [key: string]: any;
}

class StructuredLogger {
  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context?.correlationId || 'no-correlation-id',
      ...redactSensitiveData(context || {}),
    };
    return JSON.stringify(entry);
  }

  info(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test' || process.env.VERBOSE_LOGS === 'true') {
      console.log(this.formatLog('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test' || process.env.VERBOSE_LOGS === 'true') {
      console.warn(this.formatLog('warn', message, context));
    }
  }

  error(message: string, context?: LogContext, error?: any): void {
    const errorDetails = error
      ? {
          errorMessage: error.message || String(error),
          errorName: error.name,
          // Exclude raw stack trace in production logs to prevent leaking internal directory structures
          stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
        }
      : {};

    const fullContext = { ...context, ...errorDetails };
    console.error(this.formatLog('error', message, fullContext));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.debug(this.formatLog('debug', message, context));
    }
  }
}

export const logger = new StructuredLogger();
