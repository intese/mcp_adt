// MCP-specific types for tool definitions and responses

import { z } from "zod";

export interface ToolServices {
  objectService: import("../services/ObjectService.js").ObjectService;
  activationService: import("../services/ActivationService.js").ActivationService;
  syntaxService: import("../services/SyntaxService.js").SyntaxService;
  transportService: import("../services/TransportService.js").TransportService;
  packageService: import("../services/PackageService.js").PackageService;
  searchService: import("../services/SearchService.js").SearchService;
  atcService: import("../services/ATCService.js").ATCService;
  unitTestService: import("../services/UnitTestService.js").UnitTestService;
  lockService: import("../services/LockService.js").LockService;
  cdsService: import("../services/CDSService.js").CDSService;
  transformationService: import("../services/TransformationService.js").TransformationService;
  dependencyService: import("../services/DependencyService.js").DependencyService;
  tableService: import("../services/TableService.js").TableService;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export type McpContent = McpTextContent;

export interface McpSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface McpErrorResponse {
  success: false;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
}

export type McpResponse<T = unknown> = McpSuccessResponse<T> | McpErrorResponse;

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  handler: (args: z.infer<TSchema>, services: ToolServices) => Promise<McpToolResult>;
}

export interface AnyToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, services: ToolServices) => Promise<McpToolResult>;
}

// Standard Zod schemas reused across tools
export const AdtUriSchema = z
  .string()
  .min(1)
  .regex(/^\/sap\/bc\/adt\//, "Must be a valid ADT URI starting with /sap/bc/adt/");

export const SapObjectNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9_/\\$]+$/i, "Must be a valid SAP object name");

export const TransportNumberSchema = z
  .string()
  .regex(/^[A-Z0-9]{10}$/, "Transport number must be exactly 10 alphanumeric characters")
  .optional();

export const PackageNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^\$?[A-Z0-9_]+$/i, "Must be a valid SAP package name");
