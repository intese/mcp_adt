import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectType: z
    .enum(["CLAS/OC", "INTF/OI", "PROG/P", "FUGR/F", "DDLS/DF", "BDEF/BDO"])
    .describe("SAP object type"),
  name: z
    .string()
    .min(1)
    .max(40)
    .describe("Object name (will be uppercased)"),
  description: z.string().min(1).max(80).describe("Short description"),
  packageName: PackageNameSchema.describe("Package to assign the object to"),
  transportNumber: TransportNumberSchema.describe("Transport request number"),
});

export const createObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_create_object",
  description:
    "Create a new SAP ABAP repository object (generic). " +
    "For type-specific creation with more options, use adt_create_class, " +
    "adt_create_report, adt_create_interface, etc.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createObject(args.objectType, {
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
      });
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_object");
    }
  },
};
