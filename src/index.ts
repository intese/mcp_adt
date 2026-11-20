#!/usr/bin/env node
import "./loadEnv.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config/index.js";
import { AdtHttpClient } from "./adt/client.js";
import { ObjectService } from "./services/ObjectService.js";
import { ActivationService } from "./services/ActivationService.js";
import { SyntaxService } from "./services/SyntaxService.js";
import { TransportService } from "./services/TransportService.js";
import { PackageService } from "./services/PackageService.js";
import { SearchService } from "./services/SearchService.js";
import { ATCService } from "./services/ATCService.js";
import { UnitTestService } from "./services/UnitTestService.js";
import { LockService } from "./services/LockService.js";
import { CDSService } from "./services/CDSService.js";
import { TransformationService } from "./services/TransformationService.js";
import { DependencyService } from "./services/DependencyService.js";
import { TableService } from "./services/TableService.js";
import { RfcTableService } from "./services/RfcTableService.js";
import { ALL_TOOLS, TOOL_MAP } from "./tools/registry.js";
import { errorResult } from "./tools/helpers.js";
import { logger } from "./utils/logger.js";
import type { ToolServices } from "./types/index.js";
import { z } from "zod";
import fs from "fs";
import { checkJvmMatchesNativeLib } from "./adt/rfcPreflight.js";
import path from "path";
import { fileURLToPath } from "url";
import { RfcBridgeTransport } from "./adt/rfcTransport.js";

async function main(): Promise<void> {
  logger.info("Starting SAP ADT MCP Server", {
    version: "1.0.0",
    transport: config.sapTransport,
    sapUrl: config.sapTransport === "rfc" ? undefined : config.sapUrl,
    sapClient: config.sapClient,
    sapUser: config.sapUser,
    logLevel: config.logLevel,
  });

  // Initialize ADT HTTP client
  const clientConfig = {
    baseUrl: config.sapTransport === "rfc" ? `rfc://${config.rfcAshost}` : config.sapUrl!,
    client: config.sapClient,
    user: config.sapUser,
    password: config.sapPassword,
    language: config.sapLanguage,
    tlsVerify: config.tlsVerify,
    caBundle: config.caBundle,
    requestTimeout: config.requestTimeout,
    connectTimeout: config.connectTimeout,
    maxRetries: config.maxRetries,
    retryDelay: config.retryDelay,
    sessionKeepaliveInterval: config.sessionKeepaliveInterval,
  };
  if (config.sapTransport === "rfc") {
    const bridgeDir =
      config.rfcBridgeClassDir ?? fileURLToPath(new URL("../dist/bridge", import.meta.url));
    const nativeOk = ["libsapjco3.dylib", "libsapjco3.so", "sapjco3.dll"].some((n) =>
      fs.existsSync(path.join(config.jcoNativeDir!, n)),
    );
    const missing: Array<[string, string]> = [];
    if (!fs.existsSync(path.join(bridgeDir, "AdtRfcBridge.class")))
      missing.push([bridgeDir, "RFC bridge not built (run: SAP_JCO_JAR=<jar> npm run build:bridge)"]);
    if (!fs.existsSync(config.jcoJar!)) missing.push([config.jcoJar!, "SAP_JCO_JAR not found"]);
    if (!nativeOk) missing.push([config.jcoNativeDir!, "JCo native library not found in SAP_JCO_NATIVE_DIR"]);
    const archError = checkJvmMatchesNativeLib(config.javaBin, config.jcoNativeDir!);
    if (archError) missing.push([config.javaBin, archError]);
    if (missing.length > 0) {
      throw new Error(`SAP_TRANSPORT=rfc but: ${missing.map(([f, m]) => `${m} (${f})`).join("; ")}. No fallback to HTTP.`);
    }
  }
  const adtClient =
    config.sapTransport === "rfc"
      ? new AdtHttpClient(
          clientConfig,
          new RfcBridgeTransport(clientConfig, {
            ashost: config.rfcAshost!,
            sysnr: config.rfcSysnr!,
            gwhost: config.rfcGwhost,
            gwserv: config.rfcGwserv,
            jcoJar: config.jcoJar!,
            jcoNativeDir: config.jcoNativeDir!,
            bridgeClassDir:
              config.rfcBridgeClassDir ??
              fileURLToPath(new URL("../dist/bridge", import.meta.url)),
            javaBin: config.javaBin,
          }),
        )
      : new AdtHttpClient(clientConfig);

  // Initialize services
  const lockService = new LockService(adtClient);
  const services: ToolServices = {
    objectService: new ObjectService(adtClient, lockService),
    activationService: new ActivationService(adtClient),
    syntaxService: new SyntaxService(adtClient),
    transportService: new TransportService(adtClient),
    packageService: new PackageService(adtClient),
    searchService: new SearchService(adtClient),
    atcService: new ATCService(adtClient),
    unitTestService: new UnitTestService(adtClient),
    lockService,
    cdsService: new CDSService(adtClient),
    transformationService: new TransformationService(adtClient),
    dependencyService: new DependencyService(adtClient),
    tableService: new TableService(adtClient),
    rfcTableService: new RfcTableService(adtClient),
  };

  // Build MCP tool descriptors from our typed definitions
  const mcpToolDescriptors: Tool[] = ALL_TOOLS.map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: {
      type: "object" as const,
      ...zodToJsonSchema(toolDef.inputSchema),
    },
  }));

  // Create MCP server
  const server = new Server(
    { name: "sap-adt-mcp-server", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: mcpToolDescriptors };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    const toolDef = TOOL_MAP.get(name);
    if (!toolDef) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              errorCode: "TOOL_NOT_FOUND",
              message: `Unknown tool: ${name}`,
            }),
          },
        ],
        isError: true,
      };
    }

    // Validate and parse input with Zod
    const parseResult = toolDef.inputSchema.safeParse(args);
    if (!parseResult.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              errorCode: "INVALID_INPUT",
              message: "Invalid tool arguments",
              details: parseResult.error.flatten(),
            }),
          },
        ],
        isError: true,
      };
    }

    // Ensure we're authenticated before the first real tool call
    try {
      if (!adtClient.getSessionInfo().isAuthenticated) {
        await adtClient.login();
      }
    } catch (loginErr) {
      return errorResult(loginErr, name) as CallToolResult;
    }

    logger.info("Executing tool", { tool: name });
    return toolDef.handler(parseResult.data, services) as Promise<CallToolResult>;
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP Server connected via stdio");

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down MCP server...");
    try {
      await adtClient.logout();
    } catch {
      // Ignore logout errors on shutdown
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/**
 * Minimal Zod-to-JSON-Schema conversion for MCP tool registration.
 * Supports object schemas with string, number, boolean, enum, array fields.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      properties[key] = zodFieldToJsonSchema(fieldSchema);
      if (!(fieldSchema instanceof z.ZodOptional) && !(fieldSchema instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return { properties, required: required.length > 0 ? required : undefined };
  }
  return {};
}

function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  const description = field.description;

  if (field instanceof z.ZodString) {
    return { type: "string", description };
  }
  if (field instanceof z.ZodNumber) {
    return { type: "number", description };
  }
  if (field instanceof z.ZodBoolean) {
    return { type: "boolean", description };
  }
  if (field instanceof z.ZodEnum) {
    return { type: "string", enum: field.options as string[], description };
  }
  if (field instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodFieldToJsonSchema(field.element),
      description,
    };
  }
  if (field instanceof z.ZodOptional) {
    return zodFieldToJsonSchema(field.unwrap());
  }
  if (field instanceof z.ZodDefault) {
    const inner = zodFieldToJsonSchema(field.removeDefault());
    return { ...inner, default: field._def.defaultValue() as unknown };
  }
  if (field instanceof z.ZodObject) {
    return { type: "object", ...zodToJsonSchema(field), description };
  }
  return { type: "string", description };
}

main().catch((err: unknown) => {
  logger.error("Fatal error starting MCP server", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
