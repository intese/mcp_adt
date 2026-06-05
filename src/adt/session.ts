import type { SessionInfo, SessionType } from "../types/index.js";
import { logger } from "../utils/logger.js";

const FETCH_TOKEN = "fetch";

export class SessionManager {
  private _type: SessionType;
  private _csrfToken: string | null = null;
  private _cookies: Map<string, string> = new Map();
  private _loginTime: Date | null = null;
  private _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(type: SessionType = "stateful") {
    this._type = type;
  }

  get type(): SessionType {
    return this._type;
  }

  setType(type: SessionType): void {
    this._type = type;
  }

  get csrfToken(): string {
    return this._csrfToken ?? FETCH_TOKEN;
  }

  get isAuthenticated(): boolean {
    return this._loginTime !== null;
  }

  get cookieHeader(): string {
    if (this._cookies.size === 0) return "";
    return Array.from(this._cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  updateFromResponseHeaders(headers: Record<string, string | string[] | undefined>): void {
    // Update CSRF token
    const newToken = headers["x-csrf-token"];
    if (typeof newToken === "string" && newToken !== FETCH_TOKEN) {
      logger.debug("CSRF token updated");
      this._csrfToken = newToken;
    }

    // Update cookies
    const setCookie = headers["set-cookie"];
    if (setCookie) {
      const cookieList = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const cookieStr of cookieList) {
        this.parseCookie(cookieStr);
      }
    }
  }

  isCsrfError(status: number, headers: Record<string, string | string[] | undefined>): boolean {
    if (status !== 403) return false;
    const csrfHeader = headers["x-csrf-token"];
    return csrfHeader === "Required" || csrfHeader === "required";
  }

  invalidateCsrfToken(): void {
    logger.debug("CSRF token invalidated, will refetch");
    this._csrfToken = null;
  }

  markAuthenticated(): void {
    this._loginTime = new Date();
  }

  clearSession(): void {
    this._csrfToken = null;
    this._cookies.clear();
    this._loginTime = null;
    this.stopKeepalive();
  }

  startKeepalive(intervalMs: number, pingFn: () => Promise<void>): void {
    if (intervalMs <= 0) return;
    this.stopKeepalive();
    this._keepAliveTimer = setInterval(() => {
      pingFn().catch((err: unknown) => {
        logger.warn("Session keepalive failed", { error: err });
      });
    }, intervalMs);
  }

  stopKeepalive(): void {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  getInfo(): SessionInfo {
    return {
      type: this._type,
      isAuthenticated: this.isAuthenticated,
      csrfToken: this._csrfToken,
      cookies: Object.fromEntries(this._cookies),
      loginTime: this._loginTime,
    };
  }

  private parseCookie(cookieStr: string): void {
    const parts = cookieStr.split(";");
    const first = parts[0]?.trim();
    if (!first) return;
    const eqIdx = first.indexOf("=");
    if (eqIdx === -1) return;
    const name = first.slice(0, eqIdx).trim();
    const value = first.slice(eqIdx + 1).trim();
    if (name) this._cookies.set(name, value);
  }
}
