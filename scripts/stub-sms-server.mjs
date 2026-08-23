/**
 * Local stub "SMS provider" API used ONLY to E2E-test the Generic HTTP
 * provider inside the sandbox. It records the last request it received
 * and answers like a typical SMS API.
 */
import http from "node:http";

let lastRequest = null;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__last") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(lastRequest));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    lastRequest = {
      method: req.method,
      url: req.url,
      headers: {
        authorization: req.headers["authorization"] ?? null,
        "x-api-key": req.headers["x-api-key"] ?? null,
        "content-type": req.headers["content-type"] ?? null,
        "x-client": req.headers["x-client"] ?? null,
      },
      body,
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { id: "stub-msg-001", state: "queued" } }));
  });
});

server.listen(4545, "127.0.0.1", () => console.log("[stub-sms] listening on 127.0.0.1:4545"));
