import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("XSLT program name"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
  source: z
    .string()
    .min(1)
    .optional()
    .describe("Initial source, used only when created via RFC (otherwise a skeleton is used)"),
});

export const createXsltTool: ToolDefinition<typeof schema> = {
  name: "adt_create_xslt",
  description:
    "Create a new SAP XSLT program (XSLT/XT). " +
    "XSLT programs transform XML documents. " +
    "Without an ADT endpoint (e.g. SAP_BASIS 740) it is created via RFC (SAP_TRANSPORT=rfc) as inactive " +
    "version; then use adt_write_transformation.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.transformationService.createXslt({
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
        source: args.source,
        transformationType: "XSLT",
      });
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_xslt");
    }
  },
};
