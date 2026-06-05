import type { McpToolResult, McpResponse } from "../types/index.js";
import type { AdtBaseError } from "../adt/errors.js";
import { logger } from "../utils/logger.js";

export function successResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, data }, null, 2),
      },
    ],
  };
}

export function errorResult(err: unknown, toolName: string): McpToolResult {
  logger.error(`Tool ${toolName} failed`, { error: err });

  let response: McpResponse;

  if (err && typeof err === "object" && "errorCode" in err) {
    const adtErr = err as AdtBaseError;
    response = adtErr.toMcpError();
  } else if (err instanceof Error) {
    response = {
      success: false,
      errorCode: "TOOL_ERROR",
      message: err.message,
      details: {},
    };
  } else {
    response = {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: String(err),
      details: {},
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    isError: true,
  };
}
