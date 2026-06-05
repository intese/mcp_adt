import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  xml1: z.string().min(1).describe("First XML document"),
  xml2: z.string().min(1).describe("Second XML document"),
});

export const compareXmlStructuresTool: ToolDefinition<typeof schema> = {
  name: "adt_compare_xml_structures",
  description:
    "Compare two XML documents or structures. " +
    "Reports structural differences. Useful for comparing document versions.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = services.transformationService.compareXmlStructures(args.xml1, args.xml2);
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_compare_xml_structures");
    }
  },
};
