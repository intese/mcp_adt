import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objects: z
    .array(
      z.object({
        uri: AdtUriSchema,
        name: z.string().min(1),
      }),
    )
    .min(1)
    .max(50)
    .describe("List of objects to activate"),
  preaudit: z.boolean().default(true),
});

export const activateMassTool: ToolDefinition<typeof schema> = {
  name: "adt_activate_mass",
  description:
    "Activate multiple SAP ABAP objects in a single request. " +
    "More efficient than calling adt_activate_object repeatedly. " +
    "Returns per-object activation results.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.activationService.activateObjects(args.objects, args.preaudit);
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_activate_mass");
    }
  },
};
