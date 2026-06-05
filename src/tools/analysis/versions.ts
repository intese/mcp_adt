import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object"),
});

export const compareVersionsTool: ToolDefinition<typeof schema> = {
  name: "adt_compare_versions",
  description:
    "Get the version history of a SAP ABAP object. " +
    "Returns list of versions with author and date.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const versions = await services.dependencyService.getVersionHistory(args.objectUri);
      return successResult({ versions, count: versions.length });
    } catch (err) {
      return errorResult(err, "adt_compare_versions");
    }
  },
};
