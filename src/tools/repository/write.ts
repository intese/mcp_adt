import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema, TransportNumberSchema } from "../../types/index.js";
import { readSourceFile } from "../../utils/sourceFile.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to modify"),
  source: z
    .string()
    .min(1)
    .optional()
    .describe("New ABAP source code (inline). Provide exactly one of source or sourceFilePath."),
  sourceFilePath: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute path of a local file whose content is uploaded as source. " +
        "Preferred for large sources (avoids passing the content as tool argument). " +
        "Provide exactly one of source or sourceFilePath.",
    ),
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
    "Pass the source inline (source) or, for large sources, as an absolute local file path (sourceFilePath). " +
    "For transportable objects, provide the transport number. " +
    "After writing, run adt_syntax_check and then adt_activate_object.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      if ((args.source === undefined) === (args.sourceFilePath === undefined)) {
        throw new Error("Provide exactly one of 'source' or 'sourceFilePath'.");
      }
      const source = args.sourceFilePath
        ? await readSourceFile(args.sourceFilePath)
        : (args.source as string);
      await services.objectService.setObjectSource(
        args.objectUri,
        source,
        args.lockHandle,
        args.transportNumber,
        args.include,
      );
      return successResult({
        written: true,
        uri: args.objectUri,
        include: args.include,
        bytes: Buffer.byteLength(source, "utf-8"),
        hint: "Run adt_syntax_check and adt_activate_object to complete the change.",
      });
    } catch (err) {
      return errorResult(err, "adt_write_object");
    }
  },
};
