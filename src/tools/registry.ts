import type { AnyToolDefinition, ToolDefinition } from "../types/index.js";

// Repository
import { searchObjectTool } from "./repository/search.js";
import { readObjectTool } from "./repository/read.js";
import { writeObjectTool } from "./repository/write.js";
import { createObjectTool } from "./repository/create.js";
import { deleteObjectTool } from "./repository/delete.js";

// Activation
import { activateObjectTool } from "./activation/activate.js";
import { activateMassTool } from "./activation/activateMass.js";

// Syntax
import { syntaxCheckTool } from "./syntax/check.js";
import { syntaxCheckSourceTool } from "./syntax/checkSource.js";

// Transport
import { listTransportsTool } from "./transport/list.js";
import { createTransportTool } from "./transport/create.js";
import { releaseTransportTool } from "./transport/release.js";
import { deleteTransportTool } from "./transport/deleteTransport.js";

// Package
import { listPackagesTool } from "./package/list.js";
import { createPackageTool } from "./package/create.js";
import { getPackageContentTool } from "./package/content.js";

// Analysis
import { whereUsedTool } from "./analysis/whereUsed.js";
import { dependencyGraphTool } from "./analysis/dependencies.js";
import { getObjectMetadataTool } from "./analysis/metadata.js";
import { compareVersionsTool } from "./analysis/versions.js";

// ATC
import { runAtcTool } from "./atc/run.js";
import { getAtcResultTool } from "./atc/results.js";

// Unit Tests
import { runUnitTestsTool } from "./unittest/run.js";
import { getUnitTestResultTool } from "./unittest/results.js";

// Locks
import { lockObjectTool } from "./locks/lock.js";
import { unlockObjectTool } from "./locks/unlock.js";
import { getLockOwnerTool } from "./locks/owner.js";

// ABAP-specific
import { createClassTool } from "./abap/createClass.js";
import { createInterfaceTool } from "./abap/createInterface.js";
import { createReportTool } from "./abap/createReport.js";
import { createFunctionGroupTool } from "./abap/createFunctionGroup.js";
import { createFunctionModuleTool } from "./abap/createFunctionModule.js";

// CDS
import { createCdsViewTool } from "./cds/create.js";
import { analyzeCdsTool } from "./cds/analyze.js";
import { getCdsDependenciesTool } from "./cds/dependencies.js";

// OData
import { publishServiceBindingTool } from "./odata/publishBinding.js";
import { unpublishServiceBindingTool } from "./odata/unpublishBinding.js";

// Transformations
import { createStTool } from "./transformations/createSt.js";
import { createXsltTool } from "./transformations/createXslt.js";
import { generateStFromXmlTool } from "./transformations/generateFromXml.js";
import { validateXmlTool } from "./transformations/validateXml.js";
import { analyzeXmlSchemaTool } from "./transformations/analyzeSchema.js";
import { compareXmlStructuresTool } from "./transformations/compareXml.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asTool(t: ToolDefinition<any>): AnyToolDefinition {
  return t as AnyToolDefinition;
}

export const ALL_TOOLS: AnyToolDefinition[] = [
  // Repository
  asTool(searchObjectTool),
  asTool(readObjectTool),
  asTool(writeObjectTool),
  asTool(createObjectTool),
  asTool(deleteObjectTool),

  // Activation
  asTool(activateObjectTool),
  asTool(activateMassTool),

  // Syntax
  asTool(syntaxCheckTool),
  asTool(syntaxCheckSourceTool),

  // Transport
  asTool(listTransportsTool),
  asTool(createTransportTool),
  asTool(releaseTransportTool),
  asTool(deleteTransportTool),

  // Package
  asTool(listPackagesTool),
  asTool(createPackageTool),
  asTool(getPackageContentTool),

  // Analysis
  asTool(whereUsedTool),
  asTool(dependencyGraphTool),
  asTool(getObjectMetadataTool),
  asTool(compareVersionsTool),

  // ATC
  asTool(runAtcTool),
  asTool(getAtcResultTool),

  // Unit Tests
  asTool(runUnitTestsTool),
  asTool(getUnitTestResultTool),

  // Locks
  asTool(lockObjectTool),
  asTool(unlockObjectTool),
  asTool(getLockOwnerTool),

  // ABAP
  asTool(createClassTool),
  asTool(createInterfaceTool),
  asTool(createReportTool),
  asTool(createFunctionGroupTool),
  asTool(createFunctionModuleTool),

  // CDS
  asTool(createCdsViewTool),
  asTool(analyzeCdsTool),
  asTool(getCdsDependenciesTool),

  // OData
  asTool(publishServiceBindingTool),
  asTool(unpublishServiceBindingTool),

  // Transformations
  asTool(createStTool),
  asTool(createXsltTool),
  asTool(generateStFromXmlTool),
  asTool(validateXmlTool),
  asTool(analyzeXmlSchemaTool),
  asTool(compareXmlStructuresTool),
];

export const TOOL_MAP = new Map<string, AnyToolDefinition>(
  ALL_TOOLS.map((t) => [t.name, t]),
);
