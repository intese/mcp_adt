import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("XSLT program name"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
});

export const createXsltTool: ToolDefinition<typeof schema> = {
  name: "adt_create_xslt",
  description:
    "Create a new SAP XSLT program (XSLT/XT). " +
    "XSLT programs transform XML documents. " +
    "Write the XSLT source with adt_write_object after creation.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.transformationService.createXslt({
        name: args.name,
        description: args.description,
        packageName: args.packageName,
        transportNumber: args.transportNumber,
        transformationType: "XSLT",
      });
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_xslt");
    }
  },
};
