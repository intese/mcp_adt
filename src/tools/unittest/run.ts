import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the class or program containing unit tests"),
  objectName: z.string().min(1).describe("Object name"),
  harmless: z.boolean().default(true).describe("Include harmless risk level tests"),
  dangerous: z.boolean().default(true).describe("Include dangerous risk level tests"),
  critical: z.boolean().default(true).describe("Include critical risk level tests"),
  short: z.boolean().default(true).describe("Include short duration tests"),
  medium: z.boolean().default(true).describe("Include medium duration tests"),
  long: z.boolean().default(false).describe("Include long duration tests"),
});

export const runUnitTestsTool: ToolDefinition<typeof schema> = {
  name: "adt_run_unit_tests",
  description:
    "Execute ABAP Unit Tests for a SAP object. " +
    "Returns test results with status (passed/failed), " +
    "per-method results, and assertion failure details.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.unitTestService.runTests({
        objectUri: args.objectUri,
        objectName: args.objectName,
        riskLevels: {
          harmless: args.harmless,
          dangerous: args.dangerous,
          critical: args.critical,
        },
        durations: {
          short: args.short,
          medium: args.medium,
          long: args.long,
        },
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_run_unit_tests");
    }
  },
};
