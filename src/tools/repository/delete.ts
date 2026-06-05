import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema, TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to delete"),
  lockHandle: z.string().min(1).describe("Lock handle obtained from adt_lock_object"),
  transportNumber: TransportNumberSchema.describe("Transport request number"),
});

export const deleteObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_delete_object",
  description:
    "Delete a SAP ABAP repository object. " +
    "IMPORTANT: This operation is irreversible. Acquire a lock first with adt_lock_object. " +
    "Confirm with the user before executing.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.objectService.deleteObject(
        args.objectUri,
        args.lockHandle,
        args.transportNumber,
      );
      return successResult({ deleted: true, uri: args.objectUri });
    } catch (err) {
      return errorResult(err, "adt_delete_object");
    }
  },
};
