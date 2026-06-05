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
  packageUri,
  sourceUri,
  withCorrNr,
  validateAdtUri,
} from "../utils/uri.js";

export class ObjectService {
  constructor(private readonly client: AdtHttpClient) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getObjectMetadata(objectUri: string): Promise<AdtObjectMetadata> {
    validateAdtUri(objectUri);
    logger.debug("Getting object metadata", { uri: objectUri });

    const xml = await this.client.get<string>(objectUri, {
      headers: { Accept: "application/vnd.sap.adt.core.objectstructure+xml" },
    });

    return this.parseObjectMetadata(xml, objectUri);
  }

  async getObjectSource(objectUri: string, include = "main"): Promise<AdtObjectSource> {
    validateAdtUri(objectUri);
    const uri = sourceUri(objectUri, include);
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
    let uri = `${sourceUri(objectUri, include)}?lockHandle=${encodeURIComponent(lockHandle)}`;
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
      `/sap/bc/adt/classes?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildClassXml(options);
    const location = await this.client.post<string>(uri, body, {
      headers: {
        "Content-Type": "application/vnd.sap.adt.classes+xml",
        Accept: "application/vnd.sap.adt.classes+xml",
      },
    });
    const resultUri = classUri(options.name);
    logger.info("Class created", { name: options.name, uri: resultUri });
    return { uri: resultUri, name: options.name, type: "CLAS/OC" };
  }

  async createInterface(options: CreateInterfaceOptions): Promise<AdtObjectReference> {
    const uri = withCorrNr(
      `/sap/bc/adt/interfaces?packageName=${encodeURIComponent(options.packageName)}`,
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
      `/sap/bc/adt/services/datas?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildCdsViewXml(options);
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.services.datas+xml" },
    });
    const resultUri = cdsViewUri(options.name);
    logger.info("CDS view created", { name: options.name });
    return { uri: resultUri, name: options.name, type: "DDLS/DF" };
  }

  async createObject(
    objectType: string,
    options: CreateObjectOptions,
  ): Promise<AdtObjectReference> {
    const body = this.buildGenericObjectXml(objectType, options);
    const endpoint = this.getCreationEndpoint(objectType, options);
    await this.client.post<string>(endpoint, body, {
      headers: { "Content-Type": `application/vnd.sap.adt.${objectType.toLowerCase()}+xml` },
    });
    const name = options.name.toUpperCase();
    return { uri: `${endpoint}/${name}`, name, type: objectType };
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
    const responsible = (options.responsible ?? "").toUpperCase();
    const lang = options.language ?? "EN";
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
    const lang = options.language ?? "EN";

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
    const lang = options.language ?? "EN";
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
    const lang = options.language ?? "EN";

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
    const lang = options.language ?? "EN";
    const category = options.category ?? "VIEW";

    return `<?xml version="1.0" encoding="UTF-8"?>
<dataDefinition:abapDataDefinition
  xmlns:dataDefinition="http://www.sap.com/adt/services/datas"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}"
  dataDefinition:category="${category}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</dataDefinition:abapDataDefinition>`;
  }

  private buildGenericObjectXml(objectType: string, options: CreateObjectOptions): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? "EN";

    return `<?xml version="1.0" encoding="UTF-8"?>
<obj:object
  xmlns:obj="http://www.sap.com/adt/object"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}"
  adtcore:type="${objectType}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</obj:object>`;
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

  private getCreationEndpoint(objectType: string, options: CreateObjectOptions): string {
    const pkg = encodeURIComponent(options.packageName);
    const corrNr = options.transportNumber ? `&corrNr=${options.transportNumber}` : "";
    return `/sap/bc/adt/repository/objects?objectType=${objectType}&packageName=${pkg}${corrNr}`;
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
