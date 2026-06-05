import winston from "winston";
import { config } from "../config/index.js";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-csrf-token",
  "cookie",
  "set-cookie",
  "sap-usercontext",
]);

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return sanitized;
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const transports: winston.transport[] = [
  new winston.transports.Stream({
    stream: process.stderr,
    format: logFormat,
  }),
];

if (config.logFile) {
  transports.push(
    new winston.transports.File({
      filename: config.logFile,
      format: logFormat,
    }),
  );
}

export const logger = winston.createLogger({
  level: config.logLevel,
  transports,
  exitOnError: false,
});

export function logHttpRequest(
  method: string,
  url: string,
  headers: Record<string, unknown>,
): void {
  logger.debug("HTTP request", {
    method,
    url,
    headers: sanitizeHeaders(headers),
  });
}

export function logHttpResponse(
  method: string,
  url: string,
  status: number,
  durationMs: number,
): void {
  logger.debug("HTTP response", { method, url, status, durationMs });
}
