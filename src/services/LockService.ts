import type { AdtHttpClient } from "../adt/client.js";
import type { AdtLockResult, AdtLockInfo } from "../types/index.js";
import { parseXml, attr, extractText, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { lockUri, unlockUri, validateAdtUri } from "../utils/uri.js";
import { AdtLockError } from "../adt/errors.js";

export class LockService {
  constructor(private readonly client: AdtHttpClient) {}

  async acquireLock(objectUri: string): Promise<AdtLockResult> {
    validateAdtUri(objectUri);
    logger.debug("Acquiring lock", { uri: objectUri });

    const uri = `${lockUri(objectUri)}?_action=LOCK&accessMode=MODIFY`;
    const xml = await this.client.post<string>(uri, "", {
      headers: {
        Accept: "application/vnd.sap.adt.lock+xml",
        "Content-Length": "0",
      },
    });

    const result = this.parseLockResponse(xml, objectUri);
    logger.info("Lock acquired", { uri: objectUri, handle: result.lockHandle.slice(0, 8) + "..." });
    return result;
  }

  async releaseLock(objectUri: string, lockHandle: string): Promise<void> {
    validateAdtUri(objectUri);
    logger.debug("Releasing lock", { uri: objectUri });

    const uri = unlockUri(objectUri, lockHandle);
    await this.client.delete<string>(uri);
    logger.info("Lock released", { uri: objectUri });
  }

  async getLockInfo(objectUri: string): Promise<AdtLockInfo> {
    validateAdtUri(objectUri);

    const xml = await this.client.get<string>(objectUri, {
      headers: { Accept: "application/vnd.sap.adt.core.objectstructure+xml" },
    });

    return this.parseLockInfo(xml);
  }

  private parseLockResponse(xml: string, objectUri: string): AdtLockResult {
    try {
      const parsed = parseXml(xml);
      const lock =
        (getNestedValue(parsed, ["adtlock:lock"]) as Record<string, unknown>) ??
        (getNestedValue(parsed, ["lock"]) as Record<string, unknown>);

      if (!lock) throw new AdtLockError("Invalid lock response from SAP", { xml: xml.slice(0, 200) });

      const handleNode =
        lock["adtlock:lockHandle"] ?? lock["lockHandle"] ?? lock["LOCK_HANDLE"];
      const handle = extractText(handleNode) || attr(lock, "adtlock:lockHandle");

      if (!handle) {
        throw new AdtLockError("No lock handle in SAP response", { xml: xml.slice(0, 200) });
      }

      return {
        lockHandle: handle,
        lockTime: extractText(lock["adtlock:lockTime"] ?? lock["lockTime"]),
        lockedBy: extractText(lock["adtlock:lockedBy"] ?? lock["lockedBy"]),
        objectUri,
      };
    } catch (err) {
      if (err instanceof AdtLockError) throw err;
      throw new AdtLockError("Failed to parse lock response", { error: String(err) });
    }
  }

  private parseLockInfo(xml: string): AdtLockInfo {
    try {
      const parsed = parseXml(xml);
      const keys = Object.keys(parsed).filter((k) => !k.startsWith("?"));
      const root = (keys[0] ? parsed[keys[0]] : null) as Record<string, unknown> | null;
      if (!root) return { isLocked: false };

      const lockedBy = attr(root, "adtcore:lockedBy");
      return {
        isLocked: !!lockedBy,
        lockedBy: lockedBy || undefined,
      };
    } catch {
      return { isLocked: false };
    }
  }
}
