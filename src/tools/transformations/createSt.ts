import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Transformation name"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
  source: z
    .string()
    .min(1)
    .optional()
    .describe("Initial source, used only when created via RFC (otherwise a skeleton is used)"),
});

export const createStTool: ToolDefinition<typeof schema> = {
  name: "adt_create_st",
  description:
    "Create a new SAP Simple Transformation (XSLT/VT). " +
    "Simple Transformations convert between ABAP data and XML. " +
    "Without an ADT endpoint (e.g. SAP_BASIS 740) it is created via RFC (SAP_TRANSPORT=rfc) as inactive " +
    "version; then use adt_write_transformation.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.transformationService.createSimpleTransformation({
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
        source: args.source,
        transformationType: "ST",
      });
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_st");
    }
  },
};
