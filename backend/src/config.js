import path from "path";
import { fileURLToPath } from "url";

function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return defaultValue;
}

function envNumber(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

const PUBLIC_DIR = path.resolve(BACKEND_DIR, "game");
const NODE_MODULES_DIR = path.resolve(BACKEND_DIR, "node_modules");

const NET_LOG_ENABLED = envBool("NET_LOG", false);
const NET_LOG_IMPORTANT_ENABLED = envBool("NET_LOG_IMPORTANT", false);
const NET_LOG_SNAPSHOT_ENABLED = NET_LOG_ENABLED && envBool("NET_LOG_SNAPSHOT", true);
const NET_LOG_INTERVAL_MS = Math.max(1000, envNumber("NET_LOG_INTERVAL_MS", 5000));
const NET_ROOMS_CASE_ENABLED = envBool("NET_ROOMS_CASE", false);
const NET_ROOMS_CASE_INTERVAL_MS = Math.max(1000, envNumber("NET_ROOMS_CASE_INTERVAL_MS", 3000));

export const config = {
  host: HOST,
  port: PORT,
  paths: {
    publicDir: PUBLIC_DIR,
    nodeModulesDir: NODE_MODULES_DIR,
  },
  deps: {
    allowedPrefixes: ["@geckos.io/", "@yandeu/", "protobufjs/", "@protobufjs/"],
  },
  net: {
    logEnabled: NET_LOG_ENABLED,
    logImportantEnabled: NET_LOG_IMPORTANT_ENABLED,
    logSnapshotEnabled: NET_LOG_SNAPSHOT_ENABLED,
    logIntervalMs: NET_LOG_INTERVAL_MS,
    roomsCaseEnabled: NET_ROOMS_CASE_ENABLED,
    roomsCaseIntervalMs: NET_ROOMS_CASE_INTERVAL_MS,
  },
};
