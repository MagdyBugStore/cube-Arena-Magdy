import http from "http";
import fs from "fs";
import path from "path";
import { safeResolveUnder, sendJson, serveFile } from "./utils.js";

function normalizeBasePath(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

function splitUrl(rawUrl) {
  const url = String(rawUrl ?? "");
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return { path: url, suffix: "" };
  return { path: url.slice(0, qIndex), suffix: url.slice(qIndex) };
}

function stripBaseFromUrl(rawUrl, basePath) {
  const base = normalizeBasePath(basePath);
  if (!base) return String(rawUrl ?? "");
  const { path: urlPath, suffix } = splitUrl(rawUrl);
  if (urlPath === base) return `/${suffix}`;
  if (urlPath.startsWith(`${base}/`)) return `${urlPath.slice(base.length)}${suffix}`;
  return `${urlPath}${suffix}`;
}

function isHtmlNavigation(req) {
  const accept = req?.headers?.accept;
  if (typeof accept !== "string") return false;
  return accept.includes("text/html");
}

function createDepsHandler({ nodeModulesDir, mimeTypes, allowedPrefixes }) {
  const allowed = Array.isArray(allowedPrefixes) ? allowedPrefixes : [];
  return function serveDeps(req, res, url) {
    const effectiveUrl = String(url ?? req?.url ?? "");
    if (!effectiveUrl) return sendJson(res, 400, { error: "Bad Request" });
    const resolved = safeResolveUnder(nodeModulesDir, effectiveUrl.replace(/^\/_deps\//, ""));
    if (!resolved) return sendJson(res, 400, { error: "Invalid path" });

    const rel = path.relative(nodeModulesDir, resolved).replaceAll("\\", "/");
    const isAllowed = allowed.some((prefix) => rel.startsWith(prefix));
    if (!isAllowed) return sendJson(res, 403, { error: "Forbidden" });

    return serveFile(res, resolved, mimeTypes);
  };
}

function createStaticHandler({ publicDir, mimeTypes }) {
  return function serveStatic(req, res, url) {
    const effectiveUrl = String(url ?? req?.url ?? "");
    if (!effectiveUrl) return sendJson(res, 400, { error: "Bad Request" });
    const { path: urlPath } = splitUrl(effectiveUrl);
    const resolved = safeResolveUnder(publicDir, urlPath === "/" ? "/index.html" : effectiveUrl);
    if (!resolved) return sendJson(res, 400, { error: "Invalid path" });

    fs.stat(resolved, (statErr, stat) => {
      if (statErr) {
        const ext = path.posix.extname(urlPath);
        if (ext === "" && isHtmlNavigation(req)) {
          const indexResolved = safeResolveUnder(publicDir, "/index.html");
          if (!indexResolved) return sendJson(res, 404, { error: "Not Found" });
          return serveFile(res, indexResolved, mimeTypes);
        }
        return sendJson(res, 404, { error: "Not Found" });
      }
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

export function createHttpServer({ publicDir, nodeModulesDir, mimeTypes, allowedDepsPrefixes, basePath }) {
  const serveDeps = createDepsHandler({
    nodeModulesDir,
    mimeTypes,
    allowedPrefixes: allowedDepsPrefixes,
  });
  const serveStatic = createStaticHandler({ publicDir, mimeTypes });
  const base = normalizeBasePath(basePath);

  return http.createServer((req, res) => {
    if (!req.method || req.method === "GET" || req.method === "HEAD") {
      const rawUrl = String(req.url ?? "");
      if (!rawUrl) return sendJson(res, 400, { error: "Bad Request" });

      const { path: rawPath, suffix } = splitUrl(rawUrl);
      if (base && rawPath === base && (req.method === "GET" || req.method === "HEAD")) {
        res.writeHead(308, { Location: `${base}/${suffix}` });
        res.end();
        return;
      }

      const routedUrl = stripBaseFromUrl(rawUrl, base);
      const { path: routedPath } = splitUrl(routedUrl);
      if (routedPath.startsWith("/_deps/")) return serveDeps(req, res, routedUrl);
      return serveStatic(req, res, routedUrl);
    }
    return sendJson(res, 405, { error: "Method Not Allowed" });
  });
}
