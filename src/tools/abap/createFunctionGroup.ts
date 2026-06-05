import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(26).describe("Function group name (e.g. ZMY_FGROUP)"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
});

export const createFunctionGroupTool: ToolDefinition<typeof schema> = {
  name: "adt_create_function_group",
  description: "Create a new SAP ABAP function group (FUGR/F).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createFunctionGroup(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_function_group");
    }
  },
};
