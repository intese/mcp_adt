import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  description: z.string().min(1).max(60).describe("Transport description"),
  packageName: PackageNameSchema.describe(
    "Development package the transport belongs to (SAP requires this — rejects the request with 'Geben Sie ein Paket an' otherwise)",
  ),
  type: z
    .enum(["Workbench", "Customizing"])
    .default("Workbench")
    .describe("Transport type"),
  targetSystem: z.string().optional().describe("Target system ID (e.g. 'QAS')"),
});

export const createTransportTool: ToolDefinition<typeof schema> = {
  name: "adt_create_transport_request",
  description:
    "Create a new SAP transport request. " +
    "Returns the transport number (10-character ID like DEVK900123).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const number = await services.transportService.createTransport({
        description: args.description,
        packageName: args.packageName,
        type: args.type,
        targetSystem: args.targetSystem,
      });
      return successResult({ transportNumber: number });
    } catch (err) {
      return errorResult(err, "adt_create_transport_request");
    }
  },
};
