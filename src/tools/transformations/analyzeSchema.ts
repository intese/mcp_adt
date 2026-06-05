import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  xsdContent: z.string().min(1).describe("XSD schema content to analyze"),
});

export const analyzeXmlSchemaTool: ToolDefinition<typeof schema> = {
  name: "adt_analyze_xml_schema",
  description:
    "Analyze an XSD schema to understand its structure. " +
    "Returns parsed schema elements, types, and attributes. " +
    "Useful for understanding document formats like UBL 2.1, ZUGFeRD, or XRechnung.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const analysis = services.transformationService.analyzeXmlSchema(args.xsdContent);
      return successResult(analysis);
    } catch (err) {
      return errorResult(err, "adt_analyze_xml_schema");
    }
  },
};
