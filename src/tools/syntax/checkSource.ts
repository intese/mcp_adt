import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  source: z.string().min(1).describe("ABAP source code to check"),
  contextUri: AdtUriSchema.describe(
    "ADT URI of the object this source belongs to (provides program type context)",
  ),
  version: z
    .enum(["active", "inactive"])
    .default("inactive")
    .describe("Version of the context object the check refers to (try 'active' for standard objects)"),
  includeRaw: z
    .boolean()
    .default(false)
    .describe("Also return SAP's raw response XML (diagnosis: e.g. when an obviously broken source reports no findings)"),
});

export const syntaxCheckSourceTool: ToolDefinition<typeof schema> = {
  name: "adt_syntax_check_source",
  description:
    "Run ABAP syntax check on a source code string (not yet saved to the system). " +
    "Useful for validating code before writing it.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.syntaxService.checkSource(args.source, args.contextUri, {
        version: args.version,
        includeRaw: args.includeRaw,
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_syntax_check_source");
    }
  },
};
