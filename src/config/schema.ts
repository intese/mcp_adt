import { z } from "zod";

export const ConfigSchema = z.object({
  sapUrl: z
    .string()
    .url("SAP_URL must be a valid URL")
    .transform((u) => u.replace(/\/$/, "")),
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
});

export type AppConfig = z.infer<typeof ConfigSchema>;
