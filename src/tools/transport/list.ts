import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  user: z.string().optional().describe("Filter by owner username (default: current user)"),
});

export const listTransportsTool: ToolDefinition<typeof schema> = {
  name: "adt_list_transport_requests",
  description:
    "List open (unreleased) SAP transport requests. " +
    "Returns transport number, description, type, status, and owner.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const transports = await services.transportService.listTransports(args.user);
      return successResult({ transports, count: transports.length });
    } catch (err) {
      return errorResult(err, "adt_list_transport_requests");
    }
  },
};
