import { readdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
await rename("dist/app-source.html", "dist/index.html");
const {version}=JSON.parse(await readFile("package.json","utf8"));
await writeFile("dist/release.json",JSON.stringify({version,commit:process.env.GITHUB_SHA||null})+"\n");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(dir + "/" + e.name) : [dir + "/" + e.name],
      ),
    )
  ).flat();
}
const assets = (await files("dist")).filter(
  (f) =>
    !f.endsWith(".map") &&
    !f.endsWith("service-worker.js") &&
    !f.endsWith("/CNAME"),
);
const hash = createHash("sha256")
  .update(
    (await Promise.all(assets.map((f) => readFile(f))))
      .map((x) => x.toString("base64"))
      .join(""),
  )
  .digest("hex")
  .slice(0, 12);
const code = `const PREFIX='truck-workspace-'+btoa(self.registration.scope)+'-';const VERSION=PREFIX+'${hash}';const ASSETS=${JSON.stringify(assets.map((f) => "./" + f.slice(5)))};
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('message',e=>{if(['ACTIVATE','SKIP_WAITING'].includes(e.data?.type))self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==VERSION).slice(0,-1).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){const url=new URL('./index.html',self.location).href;e.respondWith(fetch(new Request(url,{cache:'no-store'})).then(r=>{if(!r.ok||r.redirected)throw Error('Shell unavailable');return r;}).catch(()=>caches.open(VERSION).then(c=>c.match(url))).then(hit=>hit||Promise.reject(Error('Offline shell missing'))).catch(()=>new Response('Offline copy is not ready. Open the app online first.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));return;}e.respondWith(caches.open(VERSION).then(c=>c.match(e.request)).then(hit=>hit||caches.match(e.request)).then(hit=>hit||fetch(e.request)));});`;

await writeFile("dist/service-worker.js", code);
console.log("Offline shell:", assets.length, "files;", hash);
