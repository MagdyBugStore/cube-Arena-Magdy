import fs from "fs";
import path from "path";

export function sendJson(res, statusCode, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
  });
  res.end(data);
}

export function safeResolveUnder(baseDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const normalized = path.posix.normalize(decoded);
  const safePosix = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  const absolute = path.resolve(baseDir, safePosix);
  if (!absolute.startsWith(baseDir)) return null;
  return absolute;
}

export function serveFile(res, absolutePath, mimeTypes) {
  fs.stat(absolutePath, (statErr, stat) => {
    if (statErr) return sendJson(res, 404, { error: "Not Found" });
    if (stat.isDirectory()) return sendJson(res, 404, { error: "Not Found" });

    const ext = path.extname(absolutePath).toLowerCase();
    const mime = mimeTypes.get(ext) || "application/octet-stream";
    fs.readFile(absolutePath, (readErr, data) => {
      if (readErr) return sendJson(res, 500, { error: "Read error" });
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
    });
  });
}

