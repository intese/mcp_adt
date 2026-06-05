import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  parentPackage: z
    .string()
    .optional()
    .describe("Parent package name to list sub-packages (omit to list top-level)"),
});

export const listPackagesTool: ToolDefinition<typeof schema> = {
  name: "adt_list_packages",
  description: "List SAP packages. Optionally filter by parent package.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const packages = await services.packageService.listPackages(args.parentPackage);
      return successResult({ packages, count: packages.length });
    } catch (err) {
      return errorResult(err, "adt_list_packages");
    }
  },
};
