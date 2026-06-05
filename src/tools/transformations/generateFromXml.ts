import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  xmlSample: z.string().min(1).describe("Sample XML document to generate ST from"),
  targetAbapType: z
    .string()
    .min(1)
    .describe("Target ABAP data type the ST should map to (e.g. 'ZTY_MY_STRUCT')"),
  direction: z
    .enum(["xml_to_abap", "abap_to_xml", "both"])
    .default("both")
    .describe("Transformation direction"),
});

export const generateStFromXmlTool: ToolDefinition<typeof schema> = {
  name: "adt_generate_st_from_xml",
  description:
    "Generate a Simple Transformation (ST) skeleton from an XML sample document. " +
    "Analyzes the XML structure and creates an ST template for the given ABAP type. " +
    "Particularly useful for UBL, ZUGFeRD, XRechnung documents.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const stSource = services.transformationService.generateStFromXml(
        args.xmlSample,
        args.targetAbapType,
      );
      return successResult({
        stSource,
        note: "This is a generated skeleton. Review and adjust the ST source before use.",
        hint: "Use adt_create_st to create the ST object, then adt_write_object to save this source.",
      });
    } catch (err) {
      return errorResult(err, "adt_generate_st_from_xml");
    }
  },
};
