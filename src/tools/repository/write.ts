import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema, TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to modify"),
  source: z.string().min(1).describe("New ABAP source code"),
  lockHandle: z.string().min(1).describe("Lock handle obtained from adt_lock_object"),
  transportNumber: TransportNumberSchema.describe(
    "Transport request number (required for objects in transportable packages)",
  ),
  include: z
    .enum(["main", "definitions", "implementations", "macros", "test"])
    .default("main")
    .describe("Source include to write (relevant for classes)"),
});

export const writeObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_write_object",
  description:
    "Write/update the source code of a SAP ABAP object. " +
    "IMPORTANT: You must acquire a lock first with adt_lock_object. " +
    "For transportable objects, provide the transport number. " +
    "After writing, run adt_syntax_check and then adt_activate_object.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.objectService.setObjectSource(
        args.objectUri,
        args.source,
        args.lockHandle,
        args.transportNumber,
        args.include,
      );
      return successResult({
        written: true,
        uri: args.objectUri,
        include: args.include,
        hint: "Run adt_syntax_check and adt_activate_object to complete the change.",
      });
    } catch (err) {
      return errorResult(err, "adt_write_object");
    }
  },
};
