import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Transformation name"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
});

export const createStTool: ToolDefinition<typeof schema> = {
  name: "adt_create_st",
  description:
    "Create a new SAP Simple Transformation (XSLT/VT). " +
    "Simple Transformations convert between ABAP data and XML. " +
    "Write the ST source with adt_write_object after creation.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.transformationService.createSimpleTransformation({
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
        transformationType: "ST",
      });
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_st");
    }
  },
};
