import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to find usages for"),
});

export const whereUsedTool: ToolDefinition<typeof schema> = {
  name: "adt_where_used",
  description:
    "Find all SAP objects that use/reference the specified object. " +
    "Returns list of using objects with URI, name, type, and package.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const results = await services.dependencyService.getWhereUsed(args.objectUri);
      return successResult({ usages: results, count: results.length });
    } catch (err) {
      return errorResult(err, "adt_where_used");
    }
  },
};
