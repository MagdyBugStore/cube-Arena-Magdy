import http from "http";
import fs from "fs";
import path from "path";
import { safeResolveUnder, sendJson, serveFile } from "./utils.js";

function createDepsHandler({ nodeModulesDir, mimeTypes, allowedPrefixes }) {
  const allowed = Array.isArray(allowedPrefixes) ? allowedPrefixes : [];
  return function serveDeps(req, res) {
    if (!req.url) return sendJson(res, 400, { error: "Bad Request" });
    const resolved = safeResolveUnder(nodeModulesDir, req.url.replace(/^\/_deps\//, ""));
    if (!resolved) return sendJson(res, 400, { error: "Invalid path" });

    const rel = path.relative(nodeModulesDir, resolved).replaceAll("\\", "/");
    const isAllowed = allowed.some((prefix) => rel.startsWith(prefix));
    if (!isAllowed) return sendJson(res, 403, { error: "Forbidden" });

    return serveFile(res, resolved, mimeTypes);
  };
}

function createStaticHandler({ publicDir, mimeTypes }) {
  return function serveStatic(req, res) {
    if (!req.url) return sendJson(res, 400, { error: "Bad Request" });
    const resolved = safeResolveUnder(publicDir, req.url === "/" ? "/index.html" : req.url);
    if (!resolved) return sendJson(res, 400, { error: "Invalid path" });

    fs.stat(resolved, (statErr, stat) => {
      if (statErr) return sendJson(res, 404, { error: "Not Found" });
      if (stat.isDirectory()) {
        const indexFile = path.join(resolved, "index.html");
        return fs.readFile(indexFile, (readErr, data) => {
          if (readErr) return sendJson(res, 404, { error: "Not Found" });
          res.writeHead(200, { "Content-Type": mimeTypes.get(".html") });
          res.end(data);
        });
      }
      return serveFile(res, resolved, mimeTypes);
    });
  };
}

export function createHttpServer({ publicDir, nodeModulesDir, mimeTypes, allowedDepsPrefixes }) {
  const serveDeps = createDepsHandler({
    nodeModulesDir,
    mimeTypes,
    allowedPrefixes: allowedDepsPrefixes,
  });
  const serveStatic = createStaticHandler({ publicDir, mimeTypes });

  return http.createServer((req, res) => {
    if (!req.method || req.method === "GET" || req.method === "HEAD") {
      if (req.url?.startsWith("/_deps/")) return serveDeps(req, res);
      return serveStatic(req, res);
    }
    return sendJson(res, 405, { error: "Method Not Allowed" });
  });
}

