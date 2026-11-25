/**
 * Line protocol for generic function-module calls through the RFC bridge
 * (bridge/AdtRfcBridge.java, method "RFC_CALL"). Values are base64 so tabs and
 * newlines in data cannot break the framing.
 *
 * Request body (one record per line, tab-separated):
 *   P  NAME  b64          scalar import parameter
 *   A  TABLE              append an empty row to a table parameter
 *   F  TABLE FIELD b64    set a field on the last appended row of TABLE
 *   O  TABLE              table to return after the call
 *   (O also accepts structures: one row; and scalars: one row with field VALUE)
 * Response body:
 *   R  TABLE (FIELD b64)* one result row
 * A raised ABAP exception is answered as:
 *   id  ABAP  b64(key)  b64(message text)  b64(message class)  b64(number)  b64(variable)*
 */

import { AdtBaseError, AdtNetworkError } from "./errors.js";
export interface RfcCallRequest {
  /** Function module name, e.g. RFC_READ_TABLE */
  name: string;
  params?: Record<string, string>;
  tables?: Record<string, Record<string, string>[]>;
  outTables?: string[];
  timeout?: number;
}

export interface RfcCallResult {
  tables: Record<string, Record<string, string>[]>;
}

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string): string => Buffer.from(s, "base64").toString("utf8");

export function encodeRfcCall(
  req: Pick<RfcCallRequest, "params" | "tables" | "outTables">,
): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(req.params ?? {})) lines.push(`P\t${k}\t${b64(v)}`);
  for (const [table, rows] of Object.entries(req.tables ?? {})) {
    for (const row of rows) {
      lines.push(`A\t${table}`);
      for (const [f, v] of Object.entries(row)) lines.push(`F\t${table}\t${f}\t${b64(v)}`);
    }
  }
  for (const t of req.outTables ?? []) lines.push(`O\t${t}`);
  return lines.join("\n");
}

/** Maps a failed bridge response line (status ERR or ABAP) to an error. */
export function parseBridgeError(fields: string[]): AdtBaseError {
  if (fields[1] === "ABAP") {
    const exception = unb64(fields[2] ?? "");
    const sapMessage = unb64(fields[3] ?? "");
    const messageClass = unb64(fields[4] ?? "");
    const messageId = messageClass ? `${messageClass} ${unb64(fields[5] ?? "")}` : "";
    const messageParameters = fields.slice(6).map(unb64).filter((p) => p !== "");
    return new AdtBaseError(
      "ADT_ABAP_EXCEPTION",
      `ABAP exception ${exception}${sapMessage ? `: ${sapMessage}` : ""}` +
        (messageId ? ` (message ${messageId})` : ""),
      { exception, sapMessage, ...(messageId ? { messageId, messageParameters } : {}) },
    );
  }
  return new AdtNetworkError(`RFC call failed: ${unb64(fields[2] ?? "")}`);
}

export function decodeRfcResult(text: string): RfcCallResult {
  const tables: Record<string, Record<string, string>[]> = {};
  for (const line of text.split("\n")) {
    if (!line) continue;
    const p = line.split("\t");
    if (p[0] !== "R" || !p[1]) continue;
    const row: Record<string, string> = {};
    for (let i = 2; i + 1 < p.length; i += 2) row[p[i]!] = unb64(p[i + 1]!);
    (tables[p[1]] ??= []).push(row);
  }
  return { tables };
}
