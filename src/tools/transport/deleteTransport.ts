import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  transportNumber: TransportNumberSchema.unwrap().describe(
    "10-character transport number to delete",
  ),
});

export const deleteTransportTool: ToolDefinition<typeof schema> = {
  name: "adt_delete_transport_request",
  description:
    "Delete an unreleased SAP transport request. " +
    "WARNING: This is irreversible. Only possible for own, unreleased transports.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.transportService.deleteTransport(args.transportNumber);
      return successResult({ deleted: true, transportNumber: args.transportNumber });
    } catch (err) {
      return errorResult(err, "adt_delete_transport_request");
    }
  },
};
