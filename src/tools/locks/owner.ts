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
    "Returns lock status and the username holding the lock (if any); this includes locks held by your own user. " +
    "ADT offers no lock query, so an unlocked object is briefly locked and released again in a separate session. " +
    "Errors that are not a lock conflict (e.g. missing authorization) are returned as errors.",
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
