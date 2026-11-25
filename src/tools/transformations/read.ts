import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Name of the Simple Transformation or XSLT program"),
});

export const readTransformationTool: ToolDefinition<typeof schema> = {
  name: "adt_read_transformation",
  description:
    "Read the source and attributes of a Simple Transformation or XSLT program via XSLT_MAINTENANCE_RFC. " +
    "Returns the inactive version if there is one (see state). Requires SAP_TRANSPORT=rfc; " +
    "meant for systems without an ADT endpoint for transformations.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      return successResult(await services.rfcTransformationService.read(args.name));
    } catch (err) {
      return errorResult(err, "adt_read_transformation");
    }
  },
};
