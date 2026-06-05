import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("CDS view/entity name"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
  category: z
    .enum(["VIEW", "ENTITY", "TYPE"])
    .default("VIEW")
    .describe("CDS artifact category"),
});

export const createCdsViewTool: ToolDefinition<typeof schema> = {
  name: "adt_create_cds_view",
  description:
    "Create a new SAP CDS view/entity/type (DDLS). " +
    "After creation, write the CDS source with adt_write_object.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createCdsView(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_cds_view");
    }
  },
};
