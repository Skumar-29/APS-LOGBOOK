import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const path = resolve(
        root,
        "." +
          new URL(req.url, "http://localhost").pathname.replace(
            /^\/Work-Diary(?=\/)/,
            "",
          ),
      );
      if (!path.startsWith(root + "/") && path !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      const file =
        path === root || path.endsWith("/") ? path + "/index.html" : path;
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () => console.log("Test server ready"));
