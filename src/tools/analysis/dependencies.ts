import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objectUri: AdtUriSchema.describe("ADT URI of the object to analyze"),
});

export const dependencyGraphTool: ToolDefinition<typeof schema> = {
  name: "adt_dependency_graph",
  description:
    "Get the dependency graph of a SAP ABAP object — all objects it depends on. " +
    "Returns a tree structure of direct and transitive dependencies.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const graph = await services.dependencyService.getDependencyGraph(args.objectUri);
      return successResult(graph);
    } catch (err) {
      return errorResult(err, "adt_dependency_graph");
    }
  },
};
