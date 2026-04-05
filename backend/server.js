import geckos from "@geckos.io/server";
import os from "os";
import { config } from "./src/config.js";
import { mimeTypes } from "./src/http/mimeTypes.js";
import { createHttpServer } from "./src/http/createHttpServer.js";
import { attachRooms } from "./src/rooms/attachRooms.js";

const httpServer = createHttpServer({
  publicDir: config.paths.publicDir,
  nodeModulesDir: config.paths.nodeModulesDir,
  mimeTypes,
  allowedDepsPrefixes: config.deps.allowedPrefixes,
  basePath: config.paths.basePath,
});

const io = geckos();
io.addServer(httpServer);
attachRooms(io, config.net);


function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (!net) continue;
      if (net.family !== "IPv4") continue;
      if (net.internal) continue;
      if (!net.address) continue;
      ips.push(net.address);
    }
  }
  return Array.from(new Set(ips));
}

function getListenUrls(host, port) {
  const normalizedHost = String(host || "").trim();
  const isAny =
    normalizedHost === "0.0.0.0" || normalizedHost === "::" || normalizedHost === "::0" || normalizedHost === "[::]";
  if (isAny) {
    const lanIps = getLanIpv4Addresses();
    return [`http://localhost:${port}`, ...lanIps.map((ip) => `http://${ip}:${port}`)];
  }
  if (normalizedHost === "127.0.0.1") return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  return [`http://${normalizedHost}:${port}`];
}

httpServer.listen(config.port, config.host, () => {
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  const urls = getListenUrls(config.host, port);
  if (urls.length === 1) process.stdout.write(`Server listening on ${urls[0]}\n`);
  else process.stdout.write(`Server listening on:\n${urls.map((u) => `- ${u}`).join("\n")}\n`);
});
