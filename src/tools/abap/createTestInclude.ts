import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  className: z.string().min(1).max(30).describe("Name of the existing global class (will be uppercased)"),
  transportNumber: TransportNumberSchema.optional().describe(
    "Transport request number (omit for local objects such as $TMP)",
  ),
});

export const createTestIncludeTool: ToolDefinition<typeof schema> = {
  name: "adt_create_test_include",
  description:
    "Create the local test class include (CCAU) of an EXISTING global class. " +
    "Locks the class, creates the include and unlocks it. " +
    "Call this before adt_write_object with include='test' — writing to a class without " +
    "a test include fails with 'keine inaktive Fassung' / ADT_NOT_FOUND. " +
    "For new classes, adt_create_class with generateTestClass=true does this in one step.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.addTestClassInclude(
        args.className.toUpperCase(),
        args.transportNumber,
      );
      return successResult({
        ...ref,
        hint: "Write the test code via adt_write_object with include='test', then activate the class.",
      });
    } catch (err) {
      return errorResult(err, "adt_create_test_include");
    }
  },
};
