import type { AdtHttpClient } from "../adt/client.js";
import type { CreateTransformationOptions, AdtObjectReference } from "../types/index.js";
import { parseXml } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { transformationUri, sourceUri, withCorrNr } from "../utils/uri.js";

export class TransformationService {
  constructor(private readonly client: AdtHttpClient) {}

  async createSimpleTransformation(options: CreateTransformationOptions): Promise<AdtObjectReference> {
    logger.debug("Creating Simple Transformation", { name: options.name });

    const uri = withCorrNr(
      `/sap/bc/adt/programs/transforms?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildTransformationXml(options, "ST");
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.programs.transforms+xml" },
    });

    const resultUri = transformationUri(options.name);
    logger.info("Simple Transformation created", { name: options.name });
    return { uri: resultUri, name: options.name.toUpperCase(), type: "XSLT/VT" };
  }

  async createXslt(options: CreateTransformationOptions): Promise<AdtObjectReference> {
    logger.debug("Creating XSLT", { name: options.name });

    const uri = withCorrNr(
      `/sap/bc/adt/programs/transforms?packageName=${encodeURIComponent(options.packageName)}`,
      options.transportNumber,
    );
    const body = this.buildTransformationXml(options, "XSLT");
    await this.client.post<string>(uri, body, {
      headers: { "Content-Type": "application/vnd.sap.adt.programs.transforms+xml" },
    });

    const resultUri = transformationUri(options.name);
    logger.info("XSLT created", { name: options.name });
    return { uri: resultUri, name: options.name.toUpperCase(), type: "XSLT/XT" };
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
