import type express from "express";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const requestedLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
const configuredLevel = requestedLevel && requestedLevel in LEVEL_RANK
  ? requestedLevel
  : (process.env.NODE_ENV === "production" ? "info" : "debug");
const production = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel];
}

function normalizeMeta(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const normalized: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      normalized[key] = {
        name: value.name,
        message: value.message,
        stack: production ? undefined : value.stack,
      };
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function write(level: LogLevel, event: string, meta?: LogMeta) {
  if (!shouldLog(level)) return;

  const normalized = normalizeMeta(meta);
  if (production) {
    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...normalized,
    };
    const line = safeJson(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  const details = normalized && Object.keys(normalized).length > 0 ? ` ${JSON.stringify(normalized)}` : "";
  const line = `[${level}] ${event}${details}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
}

export const logger = {
  debug: (event: string, meta?: LogMeta) => write("debug", event, meta),
  info: (event: string, meta?: LogMeta) => write("info", event, meta),
  warn: (event: string, meta?: LogMeta) => write("warn", event, meta),
  error: (event: string, meta?: LogMeta) => write("error", event, meta),
};

export function clientIp(req: express.Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  return req.socket.remoteAddress ?? undefined;
}

export function requestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/health" || req.path.startsWith("/assets/")) {
    next();
    return;
  }

  const start = Date.now();
  res.on("finish", () => {
    const status = res.statusCode;
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logger[level]("http_request", {
      method: req.method,
      path: req.path,
      status,
      duration_ms: Date.now() - start,
      user_agent: req.headers["user-agent"] ?? null,
      ip: clientIp(req) ?? null,
    });
  });
  next();
}
