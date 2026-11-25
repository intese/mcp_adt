import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { readSourceFile } from "../../utils/sourceFile.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Name of an existing Simple Transformation or XSLT program"),
  source: z
    .string()
    .min(1)
    .optional()
    .describe("Complete new source (inline). Provide exactly one of source or sourceFilePath."),
  sourceFilePath: z
    .string()
    .min(1)
    .optional()
    .describe("Absolute path of a local file with the complete new source."),
  activate: z.boolean().default(true).describe("Activate after saving"),
  description: z.string().min(1).max(60).optional().describe("New short description; omit to keep it"),
  transportNumber: TransportNumberSchema.describe("Required for objects in transportable packages"),
});

export const writeTransformationTool: ToolDefinition<typeof schema> = {
  name: "adt_write_transformation",
  description:
    "Replace the source of a Simple Transformation or XSLT program and activate it, via XSLT_MAINTENANCE_RFC. " +
    "No lock handle needed. Source lines are limited to 255 characters. On syntax errors the new source stays " +
    "inactive and the active version is unchanged. Requires SAP_TRANSPORT=rfc.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      if ((args.source === undefined) === (args.sourceFilePath === undefined)) {
        throw new Error("Provide exactly one of 'source' or 'sourceFilePath'.");
      }
      const source = args.sourceFilePath
        ? await readSourceFile(args.sourceFilePath)
        : (args.source as string);
      return successResult(
        await services.rfcTransformationService.write({
          name: args.name,
          source,
          activate: args.activate,
          description: args.description,
          transportNumber: args.transportNumber,
        }),
      );
    } catch (err) {
      return errorResult(err, "adt_write_transformation");
    }
  },
};
