import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  query: z.string().min(1).describe("Search query. Use * as wildcard, e.g. 'ZMY_CL*'"),
  objectType: z
    .string()
    .optional()
    .describe("Filter by object type, e.g. 'CLAS/OC', 'PROG/P', 'INTF/OI', 'DDLS/DF'"),
  packageName: z
    .string()
    .optional()
    .describe("Filter by package name"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe("Maximum number of results to return"),
});

export const searchObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_search_object",
  description:
    "Search for SAP ABAP objects by name pattern. Supports wildcards (*). " +
    "Returns object URI, name, type, description, and package.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const results = await services.searchService.searchObjects({
        query: args.query,
        objectType: args.objectType,
        packageName: args.packageName,
        maxResults: args.maxResults,
      });
      return successResult({ results, count: results.length });
    } catch (err) {
      return errorResult(err, "adt_search_object");
    }
  },
};
