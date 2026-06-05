import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import https from "https";
import fs from "fs";
import type { AdtClientConfig, SessionInfo } from "../types/index.js";
import { SessionManager } from "./session.js";
import {
  AdtAuthenticationError,
  AdtCsrfError,
  AdtNetworkError,
  AdtTimeoutError,
  mapHttpError,
} from "./errors.js";
import { logger, logHttpRequest, logHttpResponse } from "../utils/logger.js";

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: "text" | "json" | "arraybuffer";
  timeout?: number;
  /** Skip automatic CSRF token injection for GET requests that need it */
  withCsrf?: boolean;
}

type AxiosHeaders = Record<string, string>;

export class AdtHttpClient {
  private readonly axios: AxiosInstance;
  private readonly session: SessionManager;
  private readonly config: AdtClientConfig;
  private loginPromise: Promise<void> | null = null;

  constructor(config: AdtClientConfig) {
    this.config = config;
    this.session = new SessionManager("stateful");

    const httpsAgent = this.buildHttpsAgent(config);

    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.requestTimeout,
      httpsAgent,
      maxRedirects: 5,
      validateStatus: () => true, // We handle errors manually
    });

    this.installInterceptors();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async login(): Promise<void> {
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = (async () => {
      logger.info("Logging in to SAP ADT", { url: this.config.baseUrl });
      // Discovery endpoint triggers authentication and returns CSRF token
      const response = await this.rawGet("/sap/bc/adt/discovery", {
        headers: { "x-csrf-token": "fetch" },
      });

      if (response.status === 401) {
        throw new AdtAuthenticationError(
          "Login failed: invalid credentials or user locked (HTTP 401)",
        );
      }
      if (response.status === 403) {
        throw new AdtAuthenticationError(
          "Login failed: access denied (HTTP 403)",
        );
      }
      if (response.status >= 400) {
        throw new AdtAuthenticationError(
          `Login failed: unexpected HTTP ${response.status}`,
        );
      }

      this.session.updateFromResponseHeaders(response.headers as Record<string, string>);
      this.session.markAuthenticated();

      if (this.config.sessionKeepaliveInterval > 0) {
        this.session.startKeepalive(this.config.sessionKeepaliveInterval, () =>
          this.ping(),
        );
      }
      logger.info("Login successful");
    })().finally(() => {
      this.loginPromise = null;
    });

    return this.loginPromise;
  }

  async logout(): Promise<void> {
    try {
      await this.rawDelete("/sap/bc/adt/login");
    } catch {
      // Ignore logout errors
    } finally {
      this.session.clearSession();
      logger.info("Logged out from SAP ADT");
    }
  }

  async get<T = string>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.executeWithRetry<T>("GET", path, undefined, options);
  }

  async post<T = string>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.executeWithRetry<T>("POST", path, body, {
      ...options,
      withCsrf: true,
    });
  }

  async put<T = string>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.executeWithRetry<T>("PUT", path, body, {
      ...options,
      withCsrf: true,
    });
  }

  async delete<T = string>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.executeWithRetry<T>("DELETE", path, undefined, {
      ...options,
      withCsrf: true,
    });
  }

  getSessionInfo(): SessionInfo {
    return this.session.getInfo();
  }

  /** Create independent clone sharing credentials but not session state */
  createStatelessClone(): AdtHttpClient {
    const cloneConfig: AdtClientConfig = { ...this.config };
    return new AdtHttpClient(cloneConfig);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async executeWithRetry<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
    attempt = 0,
  ): Promise<T> {
    try {
      const response = await this.rawRequest<T>(method, path, body, options);
      return response;
    } catch (err) {
      if (err instanceof AdtCsrfError && attempt === 0) {
        logger.debug("CSRF error, refetching token and retrying");
        this.session.invalidateCsrfToken();
        await this.login();
        return this.executeWithRetry<T>(method, path, body, options, 1);
      }

      if (err instanceof AdtAuthenticationError && attempt === 0) {
        logger.debug("Auth error, re-logging in");
        this.session.clearSession();
        await this.login();
        return this.executeWithRetry<T>(method, path, body, options, 1);
      }

      if (
        err instanceof AdtNetworkError &&
        attempt < this.config.maxRetries
      ) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        logger.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1})`);
        await sleep(delay);
        return this.executeWithRetry<T>(method, path, body, options, attempt + 1);
      }

      throw err;
    }
  }

  private async rawRequest<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const headers = this.buildHeaders(options);

    const axiosConfig: AxiosRequestConfig = {
      method,
      url: path,
      headers,
      params: options.params,
      data: body,
      responseType: options.responseType ?? "text",
      timeout: options.timeout ?? this.config.requestTimeout,
    };

    const start = Date.now();
    logHttpRequest(method, path, headers);

    const response: AxiosResponse = await this.axios.request(axiosConfig);
    const duration = Date.now() - start;

    logHttpResponse(method, path, response.status, duration);
    this.session.updateFromResponseHeaders(
      response.headers as Record<string, string>,
    );

    if (this.session.isCsrfError(response.status, response.headers as Record<string, string>)) {
      throw new AdtCsrfError();
    }

    if (response.status === 401) throw new AdtAuthenticationError();

    if (response.status >= 400) {
      throw mapHttpError(
        response.status,
        path,
        typeof response.data === "string" ? response.data : JSON.stringify(response.data),
        response.headers as Record<string, string>,
      );
    }

    return response.data as T;
  }

  private async rawGet(path: string, options: RequestOptions = {}): Promise<AxiosResponse> {
    const headers = this.buildHeaders(options);
    return this.axios.request({
      method: "GET",
      url: path,
      headers,
      responseType: "text",
    });
  }

  private async rawDelete(path: string): Promise<void> {
    await this.axios.request({
      method: "DELETE",
      url: path,
      headers: this.buildHeaders({ withCsrf: true }),
      responseType: "text",
    });
  }

  private buildHeaders(options: RequestOptions): AxiosHeaders {
    const headers: AxiosHeaders = {
      "sap-client": this.config.client,
      "Accept-Language": this.config.language,
      "User-Agent": "ABAP Development Tools",
    };

    if (options.withCsrf) {
      headers["x-csrf-token"] = this.session.csrfToken;
    }

    const cookie = this.session.cookieHeader;
    if (cookie) headers["Cookie"] = cookie;

    const auth = Buffer.from(
      `${this.config.user}:${this.config.password}`,
    ).toString("base64");
    headers["Authorization"] = `Basic ${auth}`;

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    return headers;
  }

  private buildHttpsAgent(config: AdtClientConfig): https.Agent | undefined {
    if (!config.baseUrl.startsWith("https")) return undefined;

    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: config.tlsVerify,
      keepAlive: true,
      maxSockets: 10,
    };

    if (config.caBundle && config.tlsVerify) {
      try {
        agentOptions.ca = fs.readFileSync(config.caBundle);
      } catch (err) {
        logger.error("Failed to read CA bundle", { path: config.caBundle, error: err });
      }
    }

    return new https.Agent(agentOptions);
  }

  private installInterceptors(): void {
    this.axios.interceptors.request.use(
      (cfg: InternalAxiosRequestConfig) => {
        // Timeout code injection for observability
        (cfg as InternalAxiosRequestConfig & { metadata?: { start: number } }).metadata = {
          start: Date.now(),
        };
        return cfg;
      },
    );

    this.axios.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
            throw new AdtTimeoutError(error.config?.url ?? "unknown");
          }
          if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
            throw new AdtNetworkError(`Cannot connect to SAP: ${error.message}`, error);
          }
          throw new AdtNetworkError(error.message, error);
        }
        throw error;
      },
    );
  }

  private async ping(): Promise<void> {
    await this.rawGet("/sap/bc/adt/discovery");
    logger.debug("Session keepalive ping sent");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
