import { parseXml, attr, extractText, getNestedValue, ensureArray } from "../utils/xml.js";

export type AdtErrorCode =
  | "ADT_AUTH_FAILED"
  | "ADT_CSRF_INVALID"
  | "ADT_NOT_FOUND"
  | "ADT_LOCK_CONFLICT"
  | "ADT_TRANSPORT_ERROR"
  | "ADT_ACTIVATION_FAILED"
  | "ADT_SYNTAX_ERROR"
  | "ADT_TIMEOUT"
  | "ADT_NETWORK_ERROR"
  | "ADT_UNKNOWN_ERROR"
  | "ADT_OBJECT_EXISTS"
  | "ADT_PERMISSION_DENIED"
  | "ADT_SERVER_ERROR"
  | "ADT_NOT_ACCEPTABLE";

export class AdtBaseError extends Error {
  readonly errorCode: AdtErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    errorCode: AdtErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.details = details;
  }

  toMcpError(): { success: false; errorCode: string; message: string; details: Record<string, unknown> } {
    return {
      success: false,
      errorCode: this.errorCode,
      message: this.message,
      details: this.details,
    };
  }
}

export class AdtAuthenticationError extends AdtBaseError {
  constructor(message = "Authentication failed") {
    super("ADT_AUTH_FAILED", message);
  }
}

export class AdtCsrfError extends AdtBaseError {
  constructor(message = "CSRF token invalid or expired") {
    super("ADT_CSRF_INVALID", message);
  }
}

export class AdtNotFoundError extends AdtBaseError {
  constructor(uri: string) {
    super("ADT_NOT_FOUND", `Object not found: ${uri}`, { uri });
  }
}

export class AdtLockError extends AdtBaseError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("ADT_LOCK_CONFLICT", message, details);
  }
}

export class AdtTransportError extends AdtBaseError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("ADT_TRANSPORT_ERROR", message, details);
  }
}

export class AdtActivationError extends AdtBaseError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("ADT_ACTIVATION_FAILED", message, details);
  }
}

export class AdtSyntaxError extends AdtBaseError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("ADT_SYNTAX_ERROR", message, details);
  }
}

export class AdtTimeoutError extends AdtBaseError {
  constructor(url: string) {
    super("ADT_TIMEOUT", `Request timed out: ${url}`, { url });
  }
}

export class AdtNetworkError extends AdtBaseError {
  constructor(message: string, originalError?: unknown) {
    super("ADT_NETWORK_ERROR", message, {
      cause: originalError instanceof Error ? originalError.message : String(originalError),
    });
  }
}

export class AdtObjectExistsError extends AdtBaseError {
  constructor(name: string) {
    super("ADT_OBJECT_EXISTS", `Object already exists: ${name}`, { name });
  }
}

export class AdtPermissionError extends AdtBaseError {
  constructor(message: string) {
    super("ADT_PERMISSION_DENIED", message);
  }
}

export class AdtServerError extends AdtBaseError {
  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super("ADT_SERVER_ERROR", message, { httpStatus: status, ...details });
  }
}

export class AdtNotAcceptableError extends AdtBaseError {
  constructor(message: string, acceptedTypes?: string) {
    super("ADT_NOT_ACCEPTABLE", message, { acceptedTypes: acceptedTypes ?? null });
  }
}

export function parseSap406AcceptedTypes(body: string): string | null {
  try {
    const match = body.match(/Accepted content types?:\s*([^\s<"]+)/i);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  return null;
}

export function parseSapErrorBody(body: string): { message: string; details: Record<string, unknown> } {
  try {
    const parsed = parseXml(body);
    // SAP error XML format: <exc:exception><exc:message>...</exc:message></exc:exception>
    const exception = getNestedValue(parsed, ["exc:exception"]) as Record<string, unknown> | undefined;
    if (exception) {
      const message = extractText(exception["exc:message"] ?? exception["message"]);
      const localizedMessage = extractText(
        exception["exc:localizedMessage"] ?? exception["localizedMessage"],
      );
      return {
        message: localizedMessage || message || "SAP returned an error",
        details: {
          type: attr(exception, "exc:type"),
          text: message,
        },
      };
    }

    // Try atom/feed error format
    const error = getNestedValue(parsed, ["error"]) as Record<string, unknown> | undefined;
    if (error) {
      return {
        message: extractText(error["message"]) || "SAP returned an error",
        details: { code: extractText(error["code"]) },
      };
    }

    // Try messages format
    const messages = ensureArray(
      getNestedValue(parsed, ["chkl:messages", "msg"]) as unknown,
    );
    if (messages.length > 0) {
      const errors = messages.filter(
        (m) => attr(m, "type") === "E" || attr(m, "type") === "A",
      );
      if (errors.length > 0) {
        return {
          message: errors.map((m) => extractText(m)).join("; "),
          details: {},
        };
      }
    }
  } catch {
    // XML parsing failed, use raw body
  }
  return { message: body.slice(0, 500) || "SAP returned an error", details: {} };
}

export function mapHttpError(
  status: number,
  url: string,
  body: string,
  headers: Record<string, string>,
): AdtBaseError {
  if (status === 401) return new AdtAuthenticationError();

  if (status === 403) {
    const csrfHeader = headers["x-csrf-token"];
    if (csrfHeader === "Required" || csrfHeader === "required") {
      return new AdtCsrfError();
    }
    const { message, details } = parseSapErrorBody(body);
    return new AdtPermissionError(message || `Access denied to ${url}`);
  }

  if (status === 404) return new AdtNotFoundError(url);

  if (status === 406) {
    const acceptedTypes = parseSap406AcceptedTypes(body);
    const { message } = parseSapErrorBody(body);
    return new AdtNotAcceptableError(
      message || `Not acceptable for ${url}${acceptedTypes ? ` — accepted: ${acceptedTypes}` : ""}`,
      acceptedTypes ?? undefined,
    );
  }

  if (status === 409 || status === 423) {
    const { message, details } = parseSapErrorBody(body);
    return new AdtLockError(message || `Object is locked`, details);
  }

  if (status >= 500) {
    const { message, details } = parseSapErrorBody(body);
    return new AdtServerError(status, message, details);
  }

  const { message, details } = parseSapErrorBody(body);
  return new AdtBaseError("ADT_UNKNOWN_ERROR", message || `HTTP ${status} from ${url}`, details);
}
