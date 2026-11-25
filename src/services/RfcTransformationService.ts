import type { AdtHttpClient } from "../adt/client.js";
import {
  AdtBaseError,
  AdtLockError,
  AdtNotFoundError,
  AdtObjectExistsError,
  AdtPermissionError,
  AdtSyntaxError,
  AdtTransportError,
} from "../adt/errors.js";
import type { RfcCallResult } from "../adt/rfcCodec.js";
import { transformationUri } from "../utils/uri.js";

/** Line type O2PAGELINE of the source table is CHAR255; SAP would silently truncate. */
const MAX_LINE = 255;
const MAX_DESCRIPTION = 60;
const OLD_BRIDGE_RE = /E_XSLT_ATTRIBUTES|AbapException:/;
const REBUILD_HINT =
  "The RFC bridge class is outdated: run `npm run build:bridge` and restart the MCP client session.";

export interface TransformationSource {
  name: string;
  packageName: string;
  description: string;
  language: string;
  author: string;
  /** State of the returned version; SAP returns the inactive one if there is one. */
  state: "active" | "inactive";
  source: string;
}

export interface RfcCreateOptions {
  name: string;
  description: string;
  packageName: string;
  source: string;
  transportNumber?: string;
}

export interface RfcWriteOptions {
  name: string;
  source: string;
  /** Activate after saving (default true). */
  activate?: boolean;
  description?: string;
  transportNumber?: string;
}

function toLines(source: string): Record<string, string>[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\s+$/, "").split(/\r?\n/);
  const tooLong = lines.findIndex((l) => l.length > MAX_LINE);
  if (tooLong >= 0) {
    throw new Error(
      `Source line ${tooLong + 1} is longer than ${MAX_LINE} characters; wrap it (SAP would truncate it).`,
    );
  }
  return lines.map((LINE) => ({ LINE }));
}

function checkDescription(description: string): void {
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`Description is longer than ${MAX_DESCRIPTION} characters.`);
  }
}

/** Without a request SAP asks for one in a popup, which an RFC call cannot answer. */
function requireTransport(packageName: string, transportNumber?: string): void {
  if (!packageName.startsWith("$") && !transportNumber) {
    throw new AdtTransportError(
      `Package ${packageName} is transportable: pass transportNumber.`,
      { packageName },
    );
  }
}

/**
 * Simple Transformations and XSLT programs through the remote-enabled function module
 * XSLT_MAINTENANCE_RFC, for backends without an ADT endpoint for transformations.
 */
export class RfcTransformationService {
  constructor(private readonly client: AdtHttpClient) {}

  async read(name: string): Promise<TransformationSource> {
    const objectName = name.toUpperCase();
    let res: RfcCallResult;
    try {
      res = await this.maintain("SHOW", objectName, {}, ["E_XSLT_ATTRIBUTES", "E_XSLT_SOURCE", "E_STATE"]);
    } catch (err) {
      // The old class cannot return structures and reports ABAP exceptions as plain bridge errors.
      if (err instanceof AdtBaseError && OLD_BRIDGE_RE.test(err.message)) {
        throw new AdtBaseError("ADT_NETWORK_ERROR", `${REBUILD_HINT} (${err.message})`, err.details);
      }
      throw err;
    }
    const attributes = res.tables["E_XSLT_ATTRIBUTES"]?.[0];
    if (!attributes) throw new AdtBaseError("ADT_NETWORK_ERROR", REBUILD_HINT);
    return {
      name: objectName,
      packageName: attributes["DEVCLASS"] ?? "",
      description: attributes["DESCRIPT"] ?? "",
      language: attributes["LANGU"] ?? "",
      author: attributes["AUTHOR"] ?? "",
      state: res.tables["E_STATE"]?.[0]?.["VALUE"] === "I" ? "inactive" : "active",
      source: (res.tables["E_XSLT_SOURCE"] ?? []).map((r) => r["LINE"] ?? "").join("\n"),
    };
  }

  /** Creates the transformation as an inactive version. Never overwrites an existing one. */
  async create(options: RfcCreateOptions): Promise<void> {
    const name = options.name.toUpperCase();
    const packageName = options.packageName.toUpperCase();
    const lines = toLines(options.source);
    checkDescription(options.description);
    requireTransport(packageName, options.transportNumber);

    try {
      await this.read(name);
      throw new AdtObjectExistsError(name);
    } catch (err) {
      if (!(err instanceof AdtNotFoundError)) throw err;
    }

    await this.maintain(
      "CREATE",
      name,
      {
        I_PACKAGE: packageName,
        I_DESCRIPT: options.description,
        ...(options.transportNumber ? { I_TRANSPORT_REQUEST: options.transportNumber } : {}),
      },
      [],
      lines,
    );
  }

  async write(options: RfcWriteOptions): Promise<{ name: string; activated: boolean }> {
    const lines = toLines(options.source);
    if (options.description !== undefined) checkDescription(options.description);

    // The function module rewrites all attributes, so unchanged ones have to be sent back.
    const current = await this.read(options.name);
    requireTransport(current.packageName, options.transportNumber);
    const activate = options.activate ?? true;

    await this.maintain(
      activate ? "MODI_ACT" : "MODIFY",
      current.name,
      {
        I_PACKAGE: current.packageName,
        I_DESCRIPT: options.description ?? current.description,
        I_AUTHOR: current.author,
        I_LANGUAGE: current.language,
        ...(options.transportNumber ? { I_TRANSPORT_REQUEST: options.transportNumber } : {}),
      },
      [],
      lines,
    );
    return { name: current.name, activated: activate };
  }

  private async maintain(
    operation: string,
    name: string,
    params: Record<string, string>,
    outTables: string[] = [],
    lines?: Record<string, string>[],
  ): Promise<RfcCallResult> {
    try {
      return await this.client.callFunction({
        name: "XSLT_MAINTENANCE_RFC",
        params: { I_OPERATION: operation, I_XSLT_NAME: name, ...params },
        ...(lines ? { tables: { I_XSLT_SOURCE: lines } } : {}),
        outTables,
      });
    } catch (err) {
      throw this.mapError(err, operation, name);
    }
  }

  private mapError(err: unknown, operation: string, name: string): unknown {
    if (!(err instanceof AdtBaseError) || err.errorCode !== "ADT_ABAP_EXCEPTION") return err;
    const key = String(err.details["exception"] ?? "");
    const text = String(err.details["sapMessage"] ?? "");
    const messageId = String(err.details["messageId"] ?? "");
    const message =
      `${operation} of transformation ${name} failed: ${key}${text ? ` - ${text}` : ""}` +
      (messageId ? ` (message ${messageId})` : "");
    const details = { ...err.details, name, operation };

    switch (key) {
      case "NOT_EXISTING":
        return new AdtNotFoundError(transformationUri(name));
      case "LOCK_FAILURE":
        return new AdtLockError(message, details);
      case "PERMISSION_FAILURE":
        return new AdtPermissionError(message);
      case "SYNTAX_ERRORS":
        return new AdtSyntaxError(
          `${message}. The new source is saved as inactive version; the active version is unchanged.`,
          details,
        );
      case "CANCELLED":
        return new AdtTransportError(`${message} (usually a missing or unsuitable transport request)`, details);
      default:
        return new AdtBaseError("ADT_ABAP_EXCEPTION", message, details);
    }
  }
}
