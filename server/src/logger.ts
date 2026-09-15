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

  const line = formatDevLogLine(level, event, normalized);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function formatDevLogLine(level: LogLevel, event: string, meta?: LogMeta): string {
  if (event === "http_request" && meta) {
    const method = String(meta.method ?? "-");
    const path = String(meta.path ?? "-");
    const status = String(meta.status ?? "-");
    const duration = typeof meta.duration_ms === "number" ? `${meta.duration_ms}ms` : "-";
    const ip = formatIp(meta.ip);
    const browser = formatUserAgent(meta.user_agent);
    const suffix = [
      ip ? `ip=${ip}` : null,
      browser ? `ua="${browser}"` : null,
    ].filter(Boolean).join(" ");

    return `[${level}] ${method.padEnd(6)} ${path} ${status} ${duration}${suffix ? ` ${suffix}` : ""}`;
  }

  const details = meta && Object.keys(meta).length > 0 ? ` ${formatMeta(meta)}` : "";
  return `[${level}] ${event}${details}`;
}

function formatMeta(meta: LogMeta): string {
  return Object.entries(meta)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return safeJson(value);
}

function formatIp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.startsWith("::ffff:") ? value.slice("::ffff:".length) : value;
}

function formatUserAgent(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  const chrome = value.match(/(?:Chrome|CriOS)\/([\d.]+)/);
  const firefox = value.match(/Firefox\/([\d.]+)/);
  const safari = !chrome ? value.match(/Version\/([\d.]+).*Safari\//) : null;
  const edge = value.match(/Edg\/([\d.]+)/);
  const browser = edge
    ? `Edge ${majorVersion(edge[1])}`
    : chrome
      ? `Chrome ${majorVersion(chrome[1])}`
      : firefox
        ? `Firefox ${majorVersion(firefox[1])}`
        : safari
          ? `Safari ${majorVersion(safari[1])}`
          : "browser";

  const platform = value.includes("Windows") ? "Windows"
    : value.includes("Mac OS X") ? "macOS"
      : value.includes("Android") ? "Android"
        : value.includes("iPhone") || value.includes("iPad") ? "iOS"
          : value.includes("Linux") ? "Linux"
            : null;

  return platform ? `${browser} ${platform}` : browser;
}

function majorVersion(version: string): string {
  return version.split(".")[0] ?? version;
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
    if (status < 400) return; // only log client/server errors — success responses are routine noise
    const level: LogLevel = status >= 500 ? "error" : "warn";
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
