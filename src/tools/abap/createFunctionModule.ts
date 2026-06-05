import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  groupName: z.string().min(1).max(26).describe("Function group name"),
  name: z.string().min(1).max(30).describe("Function module name"),
  description: z.string().min(1).max(80),
  transportNumber: TransportNumberSchema,
});

export const createFunctionModuleTool: ToolDefinition<typeof schema> = {
  name: "adt_create_function_module",
  description:
    "Create a new SAP ABAP function module (FUGR/FF) within a function group. " +
    "The function group must exist. Use adt_create_function_group first if needed.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createFunctionModule(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_function_module");
    }
  },
};
