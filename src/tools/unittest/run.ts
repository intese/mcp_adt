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
  long: z.boolean().default(true).describe("Include long duration tests"),
  uriStrategy: z
    .enum(["oo-class", "vit-class", "vit-package"])
    .optional()
    .describe(
      "URI strategy for the object reference. " +
      "'oo-class' uses /sap/bc/adt/oo/classes/..., " +
      "'vit-class' uses the VIT Workbench URI for classes, " +
      "'vit-package' uses the VIT Workbench URI for the package (requires packageName). " +
      "All strategies are tried in order if the first returns an empty result.",
    ),
  packageName: z
    .string()
    .optional()
    .describe("Package name — required when uriStrategy is 'vit-package', optional otherwise"),
});

export const runUnitTestsTool: ToolDefinition<typeof schema> = {
  name: "adt_run_unit_tests",
  description:
    "Execute ABAP Unit Tests for a SAP object. " +
    "Returns test results with status (passed/failed/no_tests_selected), " +
    "per-method results, and assertion failure details. " +
    "Automatically retries with alternative URI strategies if the first attempt returns an empty result.",
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
        uriStrategy: args.uriStrategy,
        packageName: args.packageName,
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_run_unit_tests");
    }
  },
};
