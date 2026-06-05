import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to check"),
  version: z
    .enum(["active", "inactive"])
    .default("inactive")
    .describe("Which version to check: inactive (current edits) or active (last activated)"),
});

export const syntaxCheckTool: ToolDefinition<typeof schema> = {
  name: "adt_syntax_check",
  description:
    "Run ABAP syntax check on an existing repository object. " +
    "Returns findings with line/column positions and severity (E=Error, W=Warning, I=Info). " +
    "Run this before activating changes.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.syntaxService.checkObject(args.objectUri, args.version);
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_syntax_check");
    }
  },
};
