import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Class name (will be uppercased, e.g. ZCL_MY_CLASS)"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
  superClass: z.string().optional().describe("Superclass name (for inheritance)"),
  isFinal: z.boolean().default(false),
  isAbstract: z.boolean().default(false),
  visibility: z.enum(["public", "private", "protected"]).default("public"),
  instantiation: z.enum(["public", "protected", "private"]).default("public"),
  generateTestClass: z.boolean().default(false).describe("Also generate a local test class include"),
});

export const createClassTool: ToolDefinition<typeof schema> = {
  name: "adt_create_class",
  description:
    "Create a new SAP ABAP class (CLAS/OC). " +
    "After creation, use adt_write_object to set the implementation source.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createClass({
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
        superClass: args.superClass,
        isFinal: args.isFinal,
        isAbstract: args.isAbstract,
        visibility: args.visibility,
        instantiation: args.instantiation,
      });

      const result: Record<string, unknown> = { ...ref };
      if (args.generateTestClass) {
        result["hint"] =
          "Test class: write to the 'test' include via adt_write_object with include='test'";
      }

      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_create_class");
    }
  },
};
