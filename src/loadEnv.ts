import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// The server is registered globally (user scope) and gets launched from
// arbitrary workspaces, so .env must resolve relative to this file's
// installation directory — not the caller's process.cwd().
const __dirname = path.dirname(fileURLToPath(import.meta.url));
//
// Exception: if the launching project already selects SAP_TRANSPORT=rfc, the
// installation .env is NOT loaded. Otherwise missing variables (SAP_URL,
// SAP_USER, SAP_PASSWORD, ...) would silently be filled from another system's
// settings and the server could connect to the wrong system.
if (process.env["SAP_TRANSPORT"] !== "rfc") {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
}
