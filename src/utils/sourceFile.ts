import { promises as fs } from "node:fs";
import path from "node:path";

/** Upper bound for a source file read from disk (ADT handles several MB, this is a sanity limit). */
export const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Reads ABAP source from a local file so large sources need not be passed
 * inline as a tool argument. Validates path, file type and size.
 */
export async function readSourceFile(filePath: string): Promise<string> {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`sourceFilePath must be an absolute path: ${filePath}`);
  }
  if (path.basename(filePath).toLowerCase().startsWith(".env")) {
    throw new Error("sourceFilePath must not point to an .env file");
  }

  const real = await fs.realpath(filePath).catch(() => {
    throw new Error(`sourceFilePath does not exist or is not readable: ${filePath}`);
  });
  const stat = await fs.stat(real);
  if (!stat.isFile()) {
    throw new Error(`sourceFilePath is not a regular file: ${filePath}`);
  }
  if (stat.size === 0) {
    throw new Error(`sourceFilePath is empty: ${filePath}`);
  }
  if (stat.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(
      `sourceFilePath is too large (${stat.size} bytes, max ${MAX_SOURCE_FILE_BYTES}): ${filePath}`,
    );
  }
  return fs.readFile(real, "utf-8");
}
