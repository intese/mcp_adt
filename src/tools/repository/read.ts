import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe(
    "ADT URI of the object, e.g. /sap/bc/adt/classes/classes/ZMY_CLASS",
  ),
  include: z
    .enum(["main", "definitions", "implementations", "macros", "test"])
    .default("main")
    .describe("Source include to read (relevant for classes)"),
  readMetadata: z
    .boolean()
    .default(false)
    .describe("Also return object metadata (description, package, etc.)"),
});

export const readObjectTool: ToolDefinition<typeof schema> = {
  name: "adt_read_object",
  description:
    "Read the source code of a SAP ABAP object. " +
    "For classes, specify the include (main/definitions/implementations/macros/test). " +
    "Returns the ABAP source code as plain text.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const sourceResult = await services.objectService.getObjectSource(
        args.objectUri,
        args.include,
      );

      const result: Record<string, unknown> = { source: sourceResult.source };

      if (args.readMetadata) {
        result["metadata"] = await services.objectService.getObjectMetadata(args.objectUri);
      }

      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_read_object");
    }
  },
};
