import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to check"),
  version: z
    .enum(["active", "inactive"])
    .default("inactive")
    .describe(
      "Which version to check: 'inactive' checks the current unsaved/unactivated edit " +
        "buffer (use this after adt_write_object, before activating). 'active' checks the " +
        "LAST ACTIVATED source, not your latest edits — if you just wrote new code and pass " +
        "'active', errors in the new code will NOT be found (false negative: a clean result " +
        "only means the old, already-active version is clean).",
    ),
});

export const syntaxCheckTool: ToolDefinition<typeof schema> = {
  name: "adt_syntax_check",
  description:
    "Run ABAP syntax check on an existing repository object. " +
    "Returns findings with line/column positions and severity (E=Error, W=Warning, I=Info). " +
    "Run this with version='inactive' (the default) after writing changes and before " +
    "activating — passing version='active' checks the OLD, already-active source instead " +
    "of your new edits and can miss real errors. A clean syntax-check result does not by " +
    "itself guarantee the object will activate cleanly; always activate afterward and treat " +
    "the activation result as ground truth.",
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
