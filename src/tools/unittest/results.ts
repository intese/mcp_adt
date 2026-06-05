import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object that was tested"),
  objectName: z.string().min(1),
});

export const getUnitTestResultTool: ToolDefinition<typeof schema> = {
  name: "adt_get_unit_test_result",
  description:
    "Re-run unit tests and get results. " +
    "Use adt_run_unit_tests for the initial run.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.unitTestService.runTests({
        objectUri: args.objectUri,
        objectName: args.objectName,
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_get_unit_test_result");
    }
  },
};
