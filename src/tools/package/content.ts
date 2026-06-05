import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  packageName: z.string().min(1).describe("Package name"),
});

export const getPackageContentTool: ToolDefinition<typeof schema> = {
  name: "adt_get_package_content",
  description:
    "Get all objects and sub-packages in a SAP package. " +
    "Returns a hierarchical list of objects with their URIs and types.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const content = await services.packageService.getPackageContent(args.packageName);
      return successResult(content);
    } catch (err) {
      return errorResult(err, "adt_get_package_content");
    }
  },
};
