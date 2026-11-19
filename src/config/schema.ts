import { z } from "zod";

export const ConfigSchema = z.object({
  sapTransport: z.enum(["http", "rfc"]).default("http"),
  sapUrl: z
    .string()
    .url("SAP_URL must be a valid URL")
    .transform((u) => u.replace(/\/$/, ""))
    .optional(),
  rfcAshost: z.string().optional(),
  rfcSysnr: z.string().optional(),
  rfcGwhost: z.string().optional(),
  rfcGwserv: z.string().optional(),
  jcoJar: z.string().optional(),
  jcoNativeDir: z.string().optional(),
  rfcBridgeClassDir: z.string().optional(),
  javaBin: z.string().default("java"),
  sapClient: z
    .string()
    .regex(/^\d{3}$/, "SAP_CLIENT must be a 3-digit client number"),
  sapUser: z.string().min(1, "SAP_USER is required"),
  sapPassword: z.string().min(1, "SAP_PASSWORD is required"),
  sapLanguage: z.string().length(2).default("EN"),
  tlsVerify: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  caBundle: z.string().optional(),
  logLevel: z
    .enum(["error", "warn", "info", "debug", "silly"])
    .default("info"),
  logFile: z.string().optional(),
  requestTimeout: z
    .string()
    .default("60000")
    .transform((v) => parseInt(v, 10)),
  connectTimeout: z
    .string()
    .default("10000")
    .transform((v) => parseInt(v, 10)),
  maxRetries: z
    .string()
    .default("3")
    .transform((v) => parseInt(v, 10)),
  retryDelay: z
    .string()
    .default("1000")
    .transform((v) => parseInt(v, 10)),
  sessionKeepaliveInterval: z
    .string()
    .default("120000")
    .transform((v) => parseInt(v, 10)),
  metadataCacheTtl: z
    .string()
    .default("300000")
    .transform((v) => parseInt(v, 10)),
}).superRefine((c, ctx) => {
  const need = (key: string, ok: unknown, msg: string): void => {
    if (!ok) ctx.addIssue({ code: "custom", path: [key], message: msg });
  };
  if (c.sapTransport === "http") {
    need("sapUrl", c.sapUrl, "SAP_URL is required when SAP_TRANSPORT=http");
  } else {
    need("rfcAshost", c.rfcAshost, "SAP_RFC_ASHOST is required when SAP_TRANSPORT=rfc");
    need("rfcSysnr", c.rfcSysnr, "SAP_RFC_SYSNR is required when SAP_TRANSPORT=rfc");
    need("jcoJar", c.jcoJar, "SAP_JCO_JAR is required when SAP_TRANSPORT=rfc");
    need("jcoNativeDir", c.jcoNativeDir, "SAP_JCO_NATIVE_DIR is required when SAP_TRANSPORT=rfc");
  }
});

export type AppConfig = z.infer<typeof ConfigSchema>;
