import type { AdtHttpClient } from "../adt/client.js";
import { AdtBaseError } from "../adt/errors.js";
import type { CreateTransformationOptions, AdtObjectReference } from "../types/index.js";
import { parseXml } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { transformationUri, sourceUri, withCorrNr } from "../utils/uri.js";
import { RfcTransformationService } from "./RfcTransformationService.js";

/** Minimal valid sources: XSLT_MAINTENANCE_RFC cannot create an empty object. */
const SKELETONS = {
  ST: `<?sap.transform simple?>
<tt:transform xmlns:tt="http://www.sap.com/transformation-templates">
  <tt:root name="ROOT"/>
  <tt:template>
    <root>
      <tt:value ref="ROOT"/>
    </root>
  </tt:template>
</tt:transform>`,
  XSLT: `<?xml version="1.0" encoding="utf-8"?>
<xsl:transform version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <xsl:copy-of select="."/>
  </xsl:template>
</xsl:transform>`,
};

export interface CreatedTransformation extends AdtObjectReference {
  /** Set when the object was created through RFC instead of ADT. */
  via?: "rfc";
  hint?: string;
}

export class TransformationService {
  constructor(private readonly client: AdtHttpClient) {}

  /**
   * ST/XSLT creation via ADT is unverified against any backend (see docs/adt-endpoints.md).
   * A 404 on the collection means the endpoint is not served at all; observed on SAP_BASIS
   * 740 SP04, whose ADT discovery has no transformation collection. With RFC the object is
   * then created through XSLT_MAINTENANCE_RFC; otherwise explain instead of a bare
   * "Object not found" that reads like a missing package or object.
   */
  private async create(
    options: CreateTransformationOptions,
    type: "ST" | "XSLT",
  ): Promise<CreatedTransformation> {
    const label = type === "ST" ? "Simple Transformation" : "XSLT program";
    logger.debug(`Creating ${label}`, { name: options.name });

    const uri = withCorrNr(
      `/sap/bc/adt/programs/transforms?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const result: CreatedTransformation = {
      uri: transformationUri(options.name),
      name: options.name.toUpperCase(),
      type: type === "ST" ? "XSLT/VT" : "XSLT/XT",
    };

    try {
      await this.client.post<string>(uri, this.buildTransformationXml(options, type), {
        headers: { "Content-Type": "application/vnd.sap.adt.programs.transforms+xml" },
      });
    } catch (err) {
      if (!(err instanceof AdtBaseError) || err.errorCode !== "ADT_NOT_FOUND") throw err;
      if (!this.client.supportsRfc()) {
        const path = uri.split("?")[0] ?? uri;
        throw new AdtBaseError(
          "ADT_NOT_FOUND",
          `Creating a ${label} via ADT is not available on this backend: ${path} is not served ` +
            `(older systems such as SAP_BASIS 740 have no ADT endpoint for transformations). ` +
            `Use SAP_TRANSPORT=rfc, or create it in SE80/STRANS in the SAP GUI (or import it via abapGit).`,
          { ...err.details, endpoint: path, hint: "use-rfc-or-gui" },
        );
      }
      await new RfcTransformationService(this.client).create({
        name: options.name,
        description: options.description,
        packageName: options.packageName,
        transportNumber: options.transportNumber,
        source: options.source ?? SKELETONS[type],
      });
      result.via = "rfc";
      result.hint =
        "Created via RFC as inactive version. Use adt_write_transformation to set the source and activate " +
        "(adt_write_object and the ADT URI do not work for transformations on this backend).";
    }

    logger.info(`${label} created`, { name: options.name });
    return result;
  }

  async createSimpleTransformation(options: CreateTransformationOptions): Promise<CreatedTransformation> {
    return this.create(options, "ST");
  }

  async createXslt(options: CreateTransformationOptions): Promise<CreatedTransformation> {
    return this.create(options, "XSLT");
  }

  async getTransformationSource(name: string): Promise<string> {
    const uri = transformationUri(name);
    return this.client.get<string>(sourceUri(uri), {
      headers: { Accept: "text/plain" },
    });
  }

  async setTransformationSource(
    name: string,
    source: string,
    lockHandle: string,
    transportNumber?: string,
  ): Promise<void> {
    const uri = transformationUri(name);
    let targetUri = `${sourceUri(uri)}?lockHandle=${encodeURIComponent(lockHandle)}`;
    if (transportNumber) targetUri += `&corrNr=${encodeURIComponent(transportNumber)}`;

    await this.client.put<string>(targetUri, source, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // ─── XML Stubs (to be implemented based on XML schema analysis) ───────────

  /**
   * Generates a Simple Transformation skeleton from an XML sample.
   * Stub: returns template structure, full implementation requires XSD analysis.
   */
  generateStFromXml(xmlSample: string, targetAbapType: string): string {
    logger.debug("Generating ST skeleton from XML sample");
    // Stub: parse XML structure and generate ST template
    const parsed = parseXml(xmlSample);
    const rootKey = Object.keys(parsed).find((k) => !k.startsWith("?")) ?? "root";
    return this.buildStTemplate(rootKey, targetAbapType);
  }

  /**
   * Analyzes XML schema structure. Stub implementation.
   */
  analyzeXmlSchema(xsdContent: string): Record<string, unknown> {
    logger.debug("Analyzing XML schema (stub)");
    const parsed = parseXml(xsdContent);
    return parsed;
  }

  /**
   * Validates XML against XSD. Stub — full implementation requires xml-validator.
   */
  validateXmlAgainstXsd(_xmlContent: string, _xsdContent: string): {
    valid: boolean;
    errors: string[];
  } {
    logger.debug("XML XSD validation (stub)");
    return { valid: true, errors: [] };
  }

  /**
   * Compares two XML structures. Stub implementation.
   */
  compareXmlStructures(xml1: string, xml2: string): {
    identical: boolean;
    differences: string[];
  } {
    const p1 = parseXml(xml1);
    const p2 = parseXml(xml2);
    const identical = JSON.stringify(p1) === JSON.stringify(p2);
    return { identical, differences: identical ? [] : ["Structures differ"] };
  }

  private buildTransformationXml(
    options: CreateTransformationOptions,
    type: "ST" | "XSLT",
  ): string {
    const name = options.name.toUpperCase();
    const pkg = options.packageName.toUpperCase();
    const lang = options.language ?? "EN";

    return `<?xml version="1.0" encoding="UTF-8"?>
<xslt:abapTransformation
  xmlns:xslt="http://www.sap.com/adt/programs/transforms"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${this.escapeXml(options.description)}"
  adtcore:language="${lang}"
  adtcore:name="${name}"
  xslt:transformationType="${type}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</xslt:abapTransformation>`;
  }

  private buildStTemplate(rootElementName: string, targetType: string): string {
    return `<?sap.transform simple?>
<transform>
  <tt:transform xmlns:tt="http://www.sap.com/transformation-templates">
    <tt:root name="DATA" type="${targetType}"/>
    <tt:template>
      <${rootElementName}>
        <tt:apply-templates ref="DATA"/>
      </${rootElementName}>
    </tt:template>
  </tt:transform>
</transform>`;
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
