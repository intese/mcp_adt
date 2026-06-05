import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  viewUri: AdtUriSchema.describe("ADT URI of the CDS view"),
});

export const analyzeCdsTool: ToolDefinition<typeof schema> = {
  name: "adt_analyze_cds",
  description:
    "Analyze a SAP CDS view/entity: metadata, annotations, elements, and bound services.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const [metadata, source] = await Promise.all([
        services.cdsService.analyzeCdsView(args.viewUri),
        services.objectService.getObjectSource(args.viewUri).then((r) => r.source).catch(() => ""),
      ]);
      return successResult({ metadata, source });
    } catch (err) {
      return errorResult(err, "adt_analyze_cds");
    }
  },
};
