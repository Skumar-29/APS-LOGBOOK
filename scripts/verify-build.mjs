import {readFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
const manifestPath=html.match(/<link rel="manifest" href="([^"]+)"/)?.[1];
assert.equal(manifestPath,'./manifest.webmanifest');
const manifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
assert.equal(manifest.name,'APS Logbook');
for(const root of ['https://example.test/','https://example.test/APS-LOGBOOK/']){
 const base=new URL(manifestPath,root);
 for(const field of ['start_url','scope','id'])assert.equal(new URL(manifest[field],base).href,root,field+' must resolve to app root');
 for(const icon of manifest.icons){
  const target=new URL(icon.src,base);
  assert.ok(target.href.startsWith(root));
  await access('dist/'+target.href.slice(root.length));
 }
}
assert.ok(html.includes('apple-mobile-web-app-title" content="APS Logbook"'));
const release=JSON.parse(await readFile('dist/release.json','utf8'));
assert.equal(release.version,JSON.parse(await readFile('package.json','utf8')).version);
console.log('Build integrity: manifest scope, start URL, icons and release identity passed at / and /APS-LOGBOOK/.');
