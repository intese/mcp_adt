import "dotenv/config";
import { ConfigSchema, type AppConfig } from "./schema.js";

function loadConfig(): AppConfig {
  const result = ConfigSchema.safeParse({
    sapUrl: process.env["SAP_URL"],
    sapClient: process.env["SAP_CLIENT"],
    sapUser: process.env["SAP_USER"],
    sapPassword: process.env["SAP_PASSWORD"],
    sapLanguage: process.env["SAP_LANGUAGE"] ?? "EN",
    tlsVerify: process.env["SAP_TLS_VERIFY"] ?? "true",
    caBundle: process.env["SAP_CA_BUNDLE"],
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    logFile: process.env["LOG_FILE"],
    requestTimeout: process.env["REQUEST_TIMEOUT"] ?? "60000",
    connectTimeout: process.env["CONNECT_TIMEOUT"] ?? "10000",
    maxRetries: process.env["MAX_RETRIES"] ?? "3",
    retryDelay: process.env["RETRY_DELAY"] ?? "1000",
    sessionKeepaliveInterval: process.env["SESSION_KEEPALIVE_INTERVAL"] ?? "120000",
    metadataCacheTtl: process.env["METADATA_CACHE_TTL"] ?? "300000",
  });

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

export const config = loadConfig();
