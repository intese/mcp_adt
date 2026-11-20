import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import https from "https";
import fs from "fs";
import type { AdtClientConfig } from "../types/index.js";
import type { RfcCallRequest, RfcCallResult } from "./rfcCodec.js";
import { AdtNetworkError, AdtTimeoutError } from "./errors.js";
import { logger } from "../utils/logger.js";

/**
 * Wire-level request. Everything above this layer (CSRF, retries, error
 * mapping, session handling) is transport-agnostic.
 */
export interface TransportRequest {
  method: string;
  /** Path relative to the system root, e.g. /sap/bc/adt/discovery */
  url: string;
  headers: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  responseType: "text" | "json" | "arraybuffer";
  timeout: number;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface AdtTransport {
  request(req: TransportRequest): Promise<TransportResponse>;
  /** Generic RFC function-module call; only implemented by the RFC bridge transport. */
  callFunction?(req: RfcCallRequest): Promise<RfcCallResult>;
  /** Independent transport with the same credentials but no shared session state. */
  clone(): AdtTransport;
  close?(): Promise<void>;
}

/** Default transport: HTTP(S) via axios. */
export class HttpTransport implements AdtTransport {
  private readonly axios: AxiosInstance;

  constructor(private readonly config: AdtClientConfig) {
    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.requestTimeout,
      httpsAgent: buildHttpsAgent(config),
      maxRedirects: 5,
      validateStatus: () => true, // status handling happens in AdtHttpClient
    });
    this.installInterceptors();
  }

  async request(req: TransportRequest): Promise<TransportResponse> {
    const response = await this.axios.request({
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      data: req.data,
      responseType: req.responseType,
      timeout: req.timeout,
    });
    return {
      status: response.status,
      headers: response.headers as Record<string, string>,
      data: response.data,
    };
  }

  clone(): AdtTransport {
    return new HttpTransport(this.config);
  }

  private installInterceptors(): void {
    this.axios.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
      (cfg as InternalAxiosRequestConfig & { metadata?: { start: number } }).metadata = {
        start: Date.now(),
      };
      return cfg;
    });

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
}

function buildHttpsAgent(config: AdtClientConfig): https.Agent | undefined {
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
