import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Interface name (e.g. ZIF_MY_INTERFACE)"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
});

export const createInterfaceTool: ToolDefinition<typeof schema> = {
  name: "adt_create_interface",
  description: "Create a new SAP ABAP interface (INTF/OI).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createInterface(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_interface");
    }
  },
};
