import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object"),
});

export const getLockOwnerTool: ToolDefinition<typeof schema> = {
  name: "adt_get_lock_owner",
  description:
    "Check if a SAP ABAP object is locked and by whom. " +
    "Returns lock status and the username holding the lock (if any).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const lockInfo = await services.lockService.getLockInfo(args.objectUri);
      return successResult(lockInfo);
    } catch (err) {
      return errorResult(err, "adt_get_lock_owner");
    }
  },
};
