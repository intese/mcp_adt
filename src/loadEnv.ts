import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// The server is registered globally (user scope) and gets launched from
// arbitrary workspaces, so .env must resolve relative to this file's
// installation directory — not the caller's process.cwd().
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
