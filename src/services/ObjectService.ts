import type { AdtHttpClient } from "../adt/client.js";
import type {
  AdtObjectMetadata,
  AdtObjectSource,
  CreateClassOptions,
  CreateInterfaceOptions,
  CreateReportOptions,
  CreateFunctionGroupOptions,
  CreateFunctionModuleOptions,
  CreateCdsViewOptions,
  CreateObjectOptions,
  AdtNodeStructure,
  AdtNode,
  AdtObjectReference,
} from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import {
  classUri,
  interfaceUri,
  reportUri,
  functionGroupUri,
  functionModuleUri,
  cdsViewUri,
  behaviorDefinitionUri,
  packageUri,
  sourceUri,
  classSourceUri,
  withCorrNr,
  validateAdtUri,
} from "../utils/uri.js";
import type { LockService } from "./LockService.js";

export class ObjectService {
  constructor(
    private readonly client: AdtHttpClient,
    private readonly lockService: LockService,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getObjectMetadata(objectUri: string): Promise<AdtObjectMetadata> {
    validateAdtUri(objectUri);
    logger.debug("Getting object metadata", { uri: objectUri });

    // SAP's content negotiation for this resource rejects every vnd.sap.* type
    // (including the documented application/vnd.sap.adt.core.objectstructure+xml)
    // with 406 "Zulässige Inhaltstypen:" (empty list) — verified live for both
    // CLAS and INTF; only a wildcard Accept is actually accepted.
    const xml = await this.client.get<string>(objectUri, {
      headers: { Accept: "*/*" },
    });

    return this.parseObjectMetadata(xml, objectUri);
  }

  async getObjectSource(objectUri: string, include = "main"): Promise<AdtObjectSource> {
    validateAdtUri(objectUri);
    const uri = objectUri.includes("/oo/classes/")
      ? classSourceUri(objectUri, include)
      : sourceUri(objectUri, include);
    logger.debug("Getting object source", { uri, include });

    const source = await this.client.get<string>(uri, {
      headers: { Accept: "text/plain" },
    });

    return { uri: objectUri, source };
  }

  async getClassSource(
    name: string,
  ): Promise<{
    main: string;
    definitions: string;
    implementations: string;
    macros: string;
    test: string;
  }> {
    const uri = classUri(name);
    const includes = ["main", "definitions", "implementations", "macros", "test"] as const;

    const results = await Promise.all(
      includes.map((inc) =>
        this.getObjectSource(uri, inc).then((r) => r.source).catch(() => ""),
      ),
    );

    return {
      main: results[0] ?? "",
      definitions: results[1] ?? "",
      implementations: results[2] ?? "",
      macros: results[3] ?? "",
      test: results[4] ?? "",
    };
  }

  async setObjectSource(
    objectUri: string,
    source: string,
    lockHandle: string,
    transportNumber?: string,
    include = "main",
  ): Promise<void> {
    validateAdtUri(objectUri);
    // For ABAP programs, source writes go to the include URI, not the program URI
    const writeUri = objectUri.includes("/programs/programs/")
      ? objectUri.replace("/programs/programs/", "/programs/includes/")
      : objectUri;

    const baseUri = writeUri.includes("/oo/classes/")
      ? classSourceUri(writeUri, include)
      : sourceUri(writeUri, include);
    let uri = `${baseUri}?lockHandle=${encodeURIComponent(lockHandle)}`;
    if (transportNumber) uri = `${uri}&corrNr=${encodeURIComponent(transportNumber)}`;

    logger.debug("Setting object source", { uri: objectUri, include });

    await this.client.put<string>(uri, source, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  async getNodeStructure(
    packageNameOrUri: string,
    objectName?: string,
    objectType?: string,
  ): Promise<AdtNodeStructure> {
    const body = this.buildNodeStructureRequest(packageNameOrUri, objectName, objectType);
    const xml = await this.client.post<string>(
      "/sap/bc/adt/repository/nodestructure",
      body,
      {
        headers: {
          "Content-Type": "application/xml",
          Accept: "application/vnd.sap.adt.repository.nodestructure+xml",
        },
      },
    );
    return this.parseNodeStructure(xml);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createClass(options: CreateClassOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/oo/classes?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildClassXml(options);
    await this.client.post<string>(uri, body, {
      headers: {
        "Content-Type": "application/vnd.sap.adt.classes+xml",
        Accept: "application/vnd.sap.adt.classes+xml",
      },
    });
    const resultUri = classUri(options.name);
    logger.info("Class created", { name: options.name, uri: resultUri });

    if (options.generateTestClass) {
      const lock = await this.lockService.acquireLock(resultUri);
      try {
        await this.createTestClassInclude(options.name, lock.lockHandle, options.transportNumber);
        logger.info("Test class include created", { name: options.name });
      } finally {
        await this.lockService.releaseLock(resultUri, lock.lockHandle);
      }
    }

    return { uri: resultUri, name: options.name, type: "CLAS/OC" };
  }

  // SAP only auto-creates CCDEF/CCIMP for a new class; the CCAU test-class
  // include must be requested explicitly via a follow-up create request
  // against the class's /includes collection (verified against the
  // open-source abap-adt-api client's createTestInclude implementation —
  // pending live confirmation against our own SAP system).
  private async createTestClassInclude(
    name: string,
    lockHandle: string,
    transportNumber?: string,
  ): Promise<void> {
    const uri = withCorrNr(
      `${classUri(name)}/includes?lockHandle=${encodeURIComponent(lockHandle)}`,
      transportNumber,
    );
    const body = `<?xml version="1.0" encoding="UTF-8"?><class:abapClassInclude xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="dummy" class:includeType="testclasses"/>`;
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/*" },
    });
  }

  async createInterface(options: CreateInterfaceOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/oo/interfaces?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildInterfaceXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.interfaces+xml" },
    });
    const resultUri = interfaceUri(options.name);
    logger.info("Interface created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "INTF/OI" };
  }

  async createReport(options: CreateReportOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/programs/programs?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildReportXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.programs.programs+xml" },
    });
    const resultUri = reportUri(options.name);
    logger.info("Report created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "PROG/P" };
  }

  async createFunctionGroup(options: CreateFunctionGroupOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/functions/groups?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildFunctionGroupXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.functions.groups+xml" },
    });
    const resultUri = functionGroupUri(options.name);
    logger.info("Function group created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "FUGR/F" };
  }

  async createFunctionModule(options: CreateFunctionModuleOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/functions/groups/${encodeURIComponent(options.groupName.toUpperCase())}/fmodules`,
      options.transportNumber,
    );
    const body = this.buildFunctionModuleXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.functions.fmodules+xml" },
    });
    const resultUri = functionModuleUri(options.groupName, options.name);
    logger.info("Function module created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "FUGR/FF" };
  }

  async createCdsView(options: CreateCdsViewOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/ddic/ddl/sources?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildCdsViewXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/*" },
    });
    const resultUri = cdsViewUri(options.name);
    logger.info("CDS view created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "DDLS/DF" };
  }

  async createObject(
    objectType: string,
    options: CreateObjectOptions,
  ): Promise<AdtObjectReference> {
    switch (objectType) {
      case "CLAS/OC":
        return this.createClass(options);
      case "INTF/OI":
        return this.createInterface(options);
      case "PROG/P":
        return this.createReport(options);
      case "FUGR/F":
        return this.createFunctionGroup(options);
      case "DDLS/DF":
        return this.createCdsView(options);
      case "BDEF/BDO":
        return this.createBehaviorDefinition(options);
      default:
        throw new Error(`Unsupported object type for generic creation: ${objectType}`);
    }
  }

  // Endpoint/namespace unverified against a real system - sourced from
  // marcellourbani/vscode_abap_remote_fs (BdefCreator.ts), which registers
  // BDEF/BDO with abap-adt-api's generic object creator (blue:blueSource,
  // same schema used there for TABL/DT and TABL/DS).
  async createBehaviorDefinition(options: CreateObjectOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/bo/behaviordefinitions?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildBehaviorDefinitionXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/*" },
    });
    const resultUri = behaviorDefinitionUri(options.name);
    logger.info("Behavior definition created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "BDEF/BDO" };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteObject(
    objectUri: string,
    lockHandle: string,
    transportNumber?: string,
  ): Promise<void> {
    validateAdtUri(objectUri);
    let uri = `${objectUri}?lockHandle=${encodeURIComponent(lockHandle)}`;
    if (transportNumber) uri = `${uri}&corrNr=${encodeURIComponent(transportNumber)}`;

    logger.warn("Deleting object", { uri: objectUri });
    await this.client.delete<string>(uri);
    logger.info("Object deleted", { uri: objectUri });
  }

  // ─── XML Builders ─────────────────────────────────────────────────────────

  private buildClassXml(options: CreateClassOptions): string {
    const name = options.name.toUpperCase();
    const responsible = (options.responsible ?? this.client.getUsername()).toUpperCase();
    const lang = options.language ?? this.client.getLanguage();
    const pkg = options.packageName.toUpperCase();
    const isFinal = options.isFinal ? "true" : "false";
    const isAbstract = options.isAbstract ? "true" : "false";
    const visibility = options.visibility ?? "public";
    const instantiation = options.instantiation ?? "public";
    const superClass = options.superClass ? `class:superClass="${options.superClass}"` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass
  xmlns:class="http://www.sap.com/adt/oo/classes"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}"
  adtcore:responsible="${responsible}"
  class:final="${isFinal}"
  class:abstract="${isAbstract}"
  class:visibility="${visibility}"
  class:instantiation="${instantiation}"
  ${superClass}>
  <adtcore:packageRef adtcore:name="${pkg}"/>
</class:abapClass>`;
  }

  private buildInterfaceXml(options: CreateInterfaceOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? this.client.getLanguage();

    return `<?xml version="1.0" encoding="UTF-8"?>
<intf:abapInterface
  xmlns:intf="http://www.sap.com/adt/oo/interfaces"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</intf:abapInterface>`;
  }

  private buildReportXml(options: CreateReportOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? this.client.getLanguage();
    const type = options.programType ?? "1";

    return `<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram
  xmlns:program="http://www.sap.com/adt/programs/programs"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}"
  program:programType="${type}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</program:abapProgram>`;
  }

  private buildFunctionGroupXml(options: CreateFunctionGroupOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? this.client.getLanguage();

    return `<?xml version="1.0" encoding="UTF-8"?>
<group:abapFunctionGroup
  xmlns:group="http://www.sap.com/adt/functions/groups"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</group:abapFunctionGroup>`;
  }

  private buildFunctionModuleXml(options: CreateFunctionModuleOptions): string {
    const name = options.name.toUpperCase();

    return `<?xml version="1.0" encoding="UTF-8"?>
<fmodule:abapFunctionModule
  xmlns:fmodule="http://www.sap.com/adt/functions/fmodules"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:name="${name}">
</fmodule:abapFunctionModule>`;
  }

  private buildCdsViewXml(options: CreateCdsViewOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? this.client.getLanguage();

    // ddl:ddlSource has no category attribute (unlike the legacy
    // dataDefinition:abapDataDefinition schema) - entity vs. view vs. abstract
    // entity is determined by the DDL syntax written via adt_write_object, not
    // by object-creation metadata.
    return `<?xml version="1.0" encoding="UTF-8"?>
<ddl:ddlSource
  xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:masterLanguage="${lang}"
  adtcore:name="${name}"
  adtcore:type="DDLS/DF">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</ddl:ddlSource>`;
  }

  private buildBehaviorDefinitionXml(options: CreateObjectOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? this.client.getLanguage();

    return `<?xml version="1.0" encoding="UTF-8"?>
<blue:blueSource
  xmlns:blue="http://www.sap.com/wbobj/blue"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:masterLanguage="${lang}"
  adtcore:name="${name}"
  adtcore:type="BDEF/BDO">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</blue:blueSource>`;
  }

  private buildNodeStructureRequest(
    packageOrUri: string,
    objectName?: string,
    objectType?: string,
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<nodecriteria:nodeCriteria
  xmlns:nodecriteria="http://www.sap.com/adt/repository/nodepath">
  <nodecriteria:packageName>${this.escapeXml(packageOrUri)}</nodecriteria:packageName>
  ${objectName ? `<nodecriteria:objectName>${this.escapeXml(objectName)}</nodecriteria:objectName>` : ""}
  ${objectType ? `<nodecriteria:objectType>${this.escapeXml(objectType)}</nodecriteria:objectType>` : ""}
</nodecriteria:nodeCriteria>`;
  }

  // ─── Response Parsers ─────────────────────────────────────────────────────

  private parseObjectMetadata(xml: string, fallbackUri: string): AdtObjectMetadata {
    const parsed = parseXml(xml);
    const root = this.findObjectRoot(parsed);

    if (!root) {
      return {
        name: "",
        type: "",
        uri: fallbackUri,
        description: "",
        language: "",
        responsible: "",
        packageName: "",
      };
    }

    return {
      name: attr(root, "adtcore:name") || attr(root, "name"),
      type: attr(root, "adtcore:type") || attr(root, "type"),
      uri: attr(root, "adtcore:uri") || fallbackUri,
      sourceUri: attr(root, "adtcore:sourceUri"),
      description: attr(root, "adtcore:description") || attr(root, "description"),
      language: attr(root, "adtcore:language") || attr(root, "language"),
      responsible: attr(root, "adtcore:responsible") || "",
      packageName: this.extractPackageName(root),
      lockedBy: attr(root, "adtcore:lockedBy") || undefined,
      version: attr(root, "adtcore:version") || undefined,
    };
  }

  private findObjectRoot(parsed: Record<string, unknown>): Record<string, unknown> | null {
    const keys = Object.keys(parsed).filter((k) => !k.startsWith("?"));
    if (keys.length === 0) return null;
    const root = parsed[keys[0] ?? ""];
    return root && typeof root === "object" ? (root as Record<string, unknown>) : null;
  }

  private extractPackageName(root: Record<string, unknown>): string {
    const pkgRef = root["adtcore:packageRef"] as Record<string, unknown> | undefined;
    if (pkgRef) return attr(pkgRef, "adtcore:name");
    return "";
  }

  private parseNodeStructure(xml: string): AdtNodeStructure {
    const parsed = parseXml(xml);
    const nodesData = getNestedValue(parsed, [
      "nameditem:nodeStructure",
      "nameditem:nodes",
      "nameditem:node",
    ]) as unknown;

    const nodes: AdtNode[] = ensureArray(nodesData).map((n) => ({
      uri: attr(n, "adtcore:uri"),
      name: attr(n, "adtcore:name"),
      techName: attr(n, "adtcore:techName"),
      type: attr(n, "adtcore:type"),
      description: attr(n, "adtcore:description"),
      expandable: attr(n, "nameditem:expandable") === "true",
      categoryTag: attr(n, "nameditem:category"),
    }));

    return { nodes, objectTypes: [], categories: [] };
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
