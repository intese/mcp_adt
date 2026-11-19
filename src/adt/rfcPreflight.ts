import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

type Arch = "arm64" | "x86_64";

function normalize(a: string): Arch | undefined {
  const s = a.toLowerCase();
  if (s.includes("aarch64") || s.includes("arm64")) return "arm64";
  if (s.includes("x86_64") || s.includes("amd64") || s.includes("x86-64")) return "x86_64";
  return undefined;
}

/** os.arch of the JVM as reported by `java -XshowSettings:properties -version` (local, no network). */
export function detectJvmArch(javaBin: string): Arch | undefined {
  const r = spawnSync(javaBin, ["-XshowSettings:properties", "-version"], {
    encoding: "utf8",
    timeout: 15000,
  });
  const m = /os\.arch\s*=\s*(\S+)/.exec(`${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  return m ? normalize(m[1]!) : undefined;
}

/** Architecture of the JCo native library, via `file` (macOS/Linux). */
export function detectNativeLibArch(nativeDir: string): Arch | undefined {
  for (const n of ["libsapjco3.dylib", "libsapjco3.so"]) {
    const f = path.join(nativeDir, n);
    if (!fs.existsSync(f)) continue;
    try {
      return normalize(execFileSync("file", ["-b", f], { encoding: "utf8" }));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Returns an error message if the JVM and JCo native library architectures differ, else undefined. */
export function checkJvmMatchesNativeLib(javaBin: string, nativeDir: string): string | undefined {
  const lib = detectNativeLibArch(nativeDir);
  if (!lib) return undefined;
  const jvm = detectJvmArch(javaBin);
  if (!jvm || jvm === lib) return undefined;
  return `SAP_JAVA_BIN (${javaBin}) is a JVM for ${jvm}, but the JCo native library in SAP_JCO_NATIVE_DIR is for ${lib}; SAP_JAVA_BIN must be a ${lib} JVM`;
}
