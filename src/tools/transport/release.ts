import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  transportNumber: TransportNumberSchema.unwrap().describe(
    "10-character transport number to release",
  ),
  ignoreLocal: z
    .boolean()
    .default(false)
    .describe("Ignore locally locked objects during release"),
  skipAtc: z.boolean().default(false).describe("Skip ATC checks during release"),
});

export const releaseTransportTool: ToolDefinition<typeof schema> = {
  name: "adt_release_transport_request",
  description:
    "Release a SAP transport request. " +
    "WARNING: This locks the transport for further changes. Confirm before executing.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.transportService.releaseTransport(
        args.transportNumber,
        args.ignoreLocal,
        args.skipAtc,
      );
      return successResult({ released: true, transportNumber: args.transportNumber });
    } catch (err) {
      return errorResult(err, "adt_release_transport_request");
    }
  },
};
