import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object"),
});

export const getObjectMetadataTool: ToolDefinition<typeof schema> = {
  name: "adt_get_object_metadata",
  description:
    "Get metadata of a SAP ABAP object: name, type, description, package, " +
    "responsible user, created/changed dates, lock status, and version.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const metadata = await services.objectService.getObjectMetadata(args.objectUri);
      return successResult(metadata);
    } catch (err) {
      return errorResult(err, "adt_get_object_metadata");
    }
  },
};
