import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the locked object"),
  lockHandle: z.string().min(1).describe("Lock handle from adt_lock_object"),
});

export const unlockObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_unlock_object",
  description:
    "Release an edit lock on a SAP ABAP object. " +
    "Always call this after finishing write operations, even if they failed.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.lockService.releaseLock(args.objectUri, args.lockHandle);
      return successResult({ unlocked: true, objectUri: args.objectUri });
    } catch (err) {
      return errorResult(err, "adt_unlock_object");
    }
  },
};
