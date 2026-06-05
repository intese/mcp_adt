import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to activate"),
  objectName: z.string().min(1).describe("Object name (used in activation request)"),
  preaudit: z
    .boolean()
    .default(true)
    .describe("Run pre-activation audit checks"),
});

export const activateObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_activate_object",
  description:
    "Activate a single SAP ABAP object. " +
    "Returns activation messages and whether the object was successfully activated. " +
    "Always run adt_syntax_check before activation.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.activationService.activateObject(
        args.objectUri,
        args.objectName,
        args.preaudit,
      );
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_activate_object");
    }
  },
};
