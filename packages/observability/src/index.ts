import pino from "pino";

const REDACTION_PATHS = [
  "*.apiKey",
  "*.accessToken",
  "*.refreshToken",
  "*.authorization",
  "req.headers.authorization",
  "config.providers.*.apiKey"
];

const REDACTION_CENSOR = "[REDACTED]";

const TOKEN_LIKE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/i,
  /\bBearer\s+[A-Za-z0-9._-]{10,}\b/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/
];

const SENSITIVE_KEY_FRAGMENTS = [
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "token",
  "secret",
  "password",
  "passphrase",
  "authorization",
  "auth",
  "cookie",
  "private_key",
  "client_secret"
];

function normalizeKeyName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKeyName(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isTokenLikeString(value: string): boolean {
  return TOKEN_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

function redactValue(value: unknown, forceRedactValue = false): unknown {
  if (typeof value === "string") {
    if (forceRedactValue || isTokenLikeString(value)) {
      return REDACTION_CENSOR;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, forceRedactValue));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    const keyIsSensitive = isSensitiveKey(key);
    const normalizedKey = normalizeKeyName(key);
    const redactChildren = forceRedactValue || normalizedKey === "env";
    if (keyIsSensitive) {
      redacted[key] = REDACTION_CENSOR;
      continue;
    }
    redacted[key] = redactValue(entry, redactChildren);
  }
  return redacted;
}

export function redactSensitiveData<T>(value: T): T {
  return redactValue(value) as T;
}

export interface LoggerOptions {
  level?: string;
  service?: string;
}

export function createLogger(options: LoggerOptions = {}) {
  return pino({
    name: options.service ?? "openassist",
    level: options.level ?? process.env.OPENASSIST_LOG_LEVEL ?? "info",
    redact: {
      paths: REDACTION_PATHS,
      censor: REDACTION_CENSOR
    }
  });
}

export type OpenAssistLogger = ReturnType<typeof createLogger>;
