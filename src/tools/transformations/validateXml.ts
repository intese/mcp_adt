import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  xmlContent: z.string().min(1).describe("XML document to validate"),
  xsdContent: z.string().min(1).describe("XSD schema to validate against"),
});

export const validateXmlTool: ToolDefinition<typeof schema> = {
  name: "adt_validate_xml_against_xsd",
  description:
    "Validate an XML document against an XSD schema. " +
    "Useful for validating UBL, ZUGFeRD, or XRechnung documents before processing. " +
    "Note: Current implementation is a stub — full validation coming in next release.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = services.transformationService.validateXmlAgainstXsd(
        args.xmlContent,
        args.xsdContent,
      );
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_validate_xml_against_xsd");
    }
  },
};
