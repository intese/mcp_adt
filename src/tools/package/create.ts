import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Package name (will be uppercased)"),
  description: z.string().min(1).max(80).describe("Package description"),
  superPackage: z.string().optional().describe("Parent package name"),
  transportNumber: TransportNumberSchema,
  applicationComponent: z.string().optional().describe("Application component (e.g. 'MM')"),
  transportLayer: z.string().optional().describe("Transport layer (e.g. 'Z')"),
});

export const createPackageTool: ToolDefinition<typeof schema> = {
  name: "adt_create_package",
  description: "Create a new SAP development package.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.packageService.createPackage(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_package");
    }
  },
};
