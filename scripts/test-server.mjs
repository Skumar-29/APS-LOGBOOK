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
const server = http.createServer(async (req, res) => {
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
  });
server.listen(4173, "127.0.0.1", () => console.log("Test server ready"));
// Loopback-only test control. WebKit offline emulation blocks service workers
// before they can answer (Playwright #42775). Prove real cache fallback by
// stopping the origin, with an independent port to restore it in finally.
http.createServer(async (req,res)=>{
  if(req.method!=="POST" || !["/offline","/online"].includes(req.url)) {res.writeHead(404);res.end();return;}
  try {
    if(req.url==="/offline" && server.listening) {
      const closed=new Promise(resolve=>server.close(resolve));
      server.closeAllConnections();await closed;
    } else if(req.url==="/online" && !server.listening) {
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(4173,"127.0.0.1",()=>{server.removeListener("error",reject);resolve();});
      });
    }
    res.writeHead(200);res.end(req.url.slice(1));
  } catch {res.writeHead(500);res.end("Test network control failed");}
}).listen(4174,"127.0.0.1");
