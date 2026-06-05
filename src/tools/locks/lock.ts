import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to lock"),
});

export const lockObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_lock_object",
  description:
    "Acquire an edit lock on a SAP ABAP object. " +
    "REQUIRED before any write operation (adt_write_object, adt_delete_object). " +
    "Returns a lockHandle that must be passed to the write/delete operation. " +
    "Always release the lock with adt_unlock_object after you are done.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const lockResult = await services.lockService.acquireLock(args.objectUri);
      return successResult({
        lockHandle: lockResult.lockHandle,
        lockedBy: lockResult.lockedBy,
        lockTime: lockResult.lockTime,
        objectUri: lockResult.objectUri,
        reminder: "Call adt_unlock_object when done to release the lock.",
      });
    } catch (err) {
      return errorResult(err, "adt_lock_object");
    }
  },
};
