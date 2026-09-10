import { createServer } from "node:http";
export const value = 1;
const server = createServer((request, response) => {
  if (request.url === "/api/health") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ok: true })); return; }
  response.setHeader("content-type", "text/html"); response.end('<h1 data-testid="title">node-min</h1>');
});
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) server.listen(process.env.PORT || 3000);
