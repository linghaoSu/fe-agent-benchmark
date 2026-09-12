import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

// Static server for the production build in dist/ (rsbuild output); unknown paths fall back to
// index.html so vue-router history routes such as /apis/create resolve.
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://app").pathname);
  let file = normalize(join("dist", pathname));
  if (!file.startsWith("dist") || !existsSync(file) || statSync(file).isDirectory()) file = join("dist", "index.html");
  if (!existsSync(file)) { response.statusCode = 404; response.end(); return; }
  response.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(response);
}).listen(Number(process.env.PORT || 5173), "0.0.0.0");
