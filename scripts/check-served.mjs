import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base=process.argv[2]||'http://127.0.0.1:4173';
const root=new URL('../dist/',import.meta.url);
const paths=['index.html','models/manifest.json','models/hand_landmarker.task',...(await readdir(new URL('wasm/',root))).map(p=>`wasm/${p}`),...(await readdir(new URL('assets/',root))).map(p=>`assets/${p}`)];
for(const path of paths){
  const response=await fetch(`${base}/${path}`);
  if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
  const served=Buffer.from(await response.arrayBuffer()),disk=await readFile(new URL(path,root));
  if(createHash('sha256').update(served).digest('hex')!==createHash('sha256').update(disk).digest('hex'))throw new Error(`${path}: served content differs from build`);
}
console.log(`Verified HTTP 200 and exact build bytes for ${paths.length} production files, including worker, model, and every WASM loader/binary.`);
