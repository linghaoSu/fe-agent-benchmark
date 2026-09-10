import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
createServer((request, response) => {
  const pathname = new URL(request.url, "http://app").pathname;
  const file = normalize(join("dist", pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith("dist") || !existsSync(file)) { response.statusCode = 404; response.end(); return; }
  response.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(response);
}).listen(Number(process.env.PORT || 5173), "0.0.0.0");
