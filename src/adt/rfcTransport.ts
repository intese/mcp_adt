import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import type { AdtClientConfig } from "../types/index.js";
import type { AdtTransport, TransportRequest, TransportResponse } from "./transport.js";
import { encodeRfcCall, decodeRfcResult, type RfcCallRequest, type RfcCallResult } from "./rfcCodec.js";
import { AdtNetworkError, AdtTimeoutError } from "./errors.js";
import { logger } from "../utils/logger.js";

export interface RfcTransportConfig {
  ashost: string;
  sysnr: string;
  gwhost?: string;
  gwserv?: string;
  /** Path to com.sap.conn.jco_*.jar */
  jcoJar: string;
  /** Directory containing libsapjco3.dylib / .so */
  jcoNativeDir: string;
  /** Directory with the compiled AdtRfcBridge.class */
  bridgeClassDir: string;
  javaBin: string;
}

interface Pending {
  resolve: (r: TransportResponse) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  url: string;
}

const b64 = (s: string | Buffer): string => Buffer.from(s).toString("base64");
const unb64 = (s: string): Buffer => Buffer.from(s, "base64");

/**
 * Transport that tunnels ADT REST requests through the RFC function
 * SADT_REST_RFC_ENDPOINT via a small Java/JCo subprocess (bridge/AdtRfcBridge.java).
 * Credentials are handed over via the child's environment only; never logged.
 */
export class RfcBridgeTransport implements AdtTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private stderrTail: string[] = [];
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly adt: AdtClientConfig,
    private readonly rfc: RfcTransportConfig,
  ) {}

  async request(req: TransportRequest): Promise<TransportResponse> {
    const child = this.ensureChild();
    const id = String(this.nextId++);

    let uri = req.url;
    if (req.params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(req.params)) {
        if (v !== undefined) qs.append(k, String(v));
      }
      const s = qs.toString();
      if (s) uri += (uri.includes("?") ? "&" : "?") + s;
    }

    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const body =
      req.data === undefined || req.data === null
        ? Buffer.alloc(0)
        : Buffer.isBuffer(req.data)
          ? req.data
          : Buffer.from(typeof req.data === "string" ? req.data : JSON.stringify(req.data));

    return new Promise<TransportResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AdtTimeoutError(req.url));
      }, req.timeout);
      this.pending.set(id, { resolve, reject, timer, url: req.url });
      child.stdin.write(
        [id, b64(req.method), b64(uri), b64(headers), b64(body)].join("\t") + "\n",
      );
    });
  }

  async callFunction(req: RfcCallRequest): Promise<RfcCallResult> {
    const res = await this.request({
      method: "RFC_CALL",
      url: req.name,
      headers: {},
      data: encodeRfcCall(req),
      responseType: "text",
      timeout: req.timeout ?? this.adt.requestTimeout,
    });
    if (res.status !== 200) throw new AdtNetworkError(`RFC call ${req.name} returned ${res.status}`);
    return decodeRfcResult(String(res.data));
  }

  clone(): AdtTransport {
    return new RfcBridgeTransport(this.adt, this.rfc);
  }

  async close(): Promise<void> {
    this.child?.stdin.end();
    this.child = null;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const sep = process.platform === "win32" ? ";" : ":";
    const child = spawn(
      this.rfc.javaBin,
      [
        "--enable-native-access=ALL-UNNAMED",
        `-Djava.library.path=${this.rfc.jcoNativeDir}`,
        "-cp",
        [this.rfc.bridgeClassDir, this.rfc.jcoJar].join(sep),
        "AdtRfcBridge",
      ],
      {
        env: {
          ...process.env,
          JCO_ASHOST: this.rfc.ashost,
          JCO_SYSNR: this.rfc.sysnr,
          JCO_CLIENT: this.adt.client,
          JCO_USER: this.adt.user,
          JCO_PASSWD: this.adt.password,
          JCO_LANG: this.adt.language,
          ...(this.rfc.gwhost ? { JCO_GWHOST: this.rfc.gwhost } : {}),
          ...(this.rfc.gwserv ? { JCO_GWSERV: this.rfc.gwserv } : {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    readline.createInterface({ input: child.stdout }).on("line", (l) => this.onLine(l));
    // JCo stderr output may contain connection details; log at debug only
    child.stderr.on("data", (d: Buffer) => {
      const text = this.redact(d.toString());
      logger.debug("rfc-bridge stderr", { text });
      this.stderrTail.push(...text.split("\n").filter((l) => l.trim() !== ""));
      if (this.stderrTail.length > 20) this.stderrTail = this.stderrTail.slice(-20);
    });
    child.on("error", (e) => this.failAll(new AdtNetworkError(`Cannot start RFC bridge: ${e.message}`, e)));
    child.on("exit", (code) => {
      this.child = null;
      const tail = this.stderrTail.slice(-8).join(" | ");
      this.failAll(
        new AdtNetworkError(
          `RFC bridge exited (code ${code})${code !== 0 && tail ? `: ${tail}` : ""}`,
        ),
      );
    });

    this.child = child;
    return child;
  }

  private onLine(line: string): void {
    const f = line.split("\t");
    const p = this.pending.get(f[0] ?? "");
    if (!p) return;
    this.pending.delete(f[0]!);
    clearTimeout(p.timer);

    if (f[1] === "ERR") {
      p.reject(new AdtNetworkError(`RFC call failed: ${unb64(f[2] ?? "").toString("utf8")}`));
      return;
    }

    const headers: Record<string, string> = {};
    for (const h of unb64(f[3] ?? "").toString("utf8").split("\n")) {
      const i = h.indexOf(":");
      if (i > 0) headers[h.slice(0, i).trim().toLowerCase()] = h.slice(i + 1).trim();
    }
    p.resolve({
      status: parseInt(f[1] ?? "0", 10),
      headers,
      data: unb64(f[4] ?? "").toString("utf8"),
    });
  }

  private redact(text: string): string {
    const pw = this.adt.password;
    return pw ? text.split(pw).join("***") : text;
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }
}
