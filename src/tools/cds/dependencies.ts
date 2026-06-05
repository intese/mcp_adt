import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  viewUri: AdtUriSchema.describe("ADT URI of the CDS view"),
});

export const getCdsDependenciesTool: ToolDefinition<typeof schema> = {
  name: "adt_get_cds_dependencies",
  description:
    "Get all dependencies of a SAP CDS view: base views, associations, " +
    "and referenced DDIC objects.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const deps = await services.cdsService.getCdsDependencies(args.viewUri);
      return successResult({ dependencies: deps, count: deps.length });
    } catch (err) {
      return errorResult(err, "adt_get_cds_dependencies");
    }
  },
};
