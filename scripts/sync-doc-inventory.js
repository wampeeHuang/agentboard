'use strict';
// Preserve the hand-written architecture explanation; derive its file inventory from disk.
const fs=require('fs');
const path=require('path');
const {treeSources}=require('../lib/tree-drift');
const root=path.resolve(__dirname,'..');
const start='[generated-inventory:start]';
const end='[generated-inventory:end]';
const check=process.argv.includes('--check');
let stale=0;
for(const source of treeSources()) {
  const files=[];
  function walk(dir) {
    for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(['node_modules','.git','_runtime','coverage'].includes(entry.name))continue;
      const rel=dir+'/'+entry.name;
      if(entry.isDirectory())walk(rel);
      else if(/\.(js|mjs|css|html|md|json|jsonl|svg|ico|txt|otf|ttf)$/.test(entry.name))files.push(rel);
    }
  }
  source.scope.forEach(walk);
  const block=start+'\n磁盘文件清单（运行 node scripts/sync-doc-inventory.js 更新）\n'+files.map(f=>'  '+f).join('\n')+'\n'+end;
  const old=fs.readFileSync(source.path,'utf8');
  let base=old;
  if(base.includes(start)) {
    const a=base.indexOf(start),b=base.indexOf(end,a);
    if(b<0)throw Error('Unclosed inventory marker: '+source.name);
    base=base.slice(0,a)+base.slice(b+end.length);
  }
  function insert(body,close) {
    body=body.replace(/\s+$/,'');
    const note=body.indexOf('（省略');
    if(note>=0)return body.slice(0,note).trimEnd()+'\n\n'+block+'\n\n'+body.slice(note).trim()+'\n'+close;
    return body+'\n\n'+block+'\n'+close;
  }
  const next=source.path.endsWith('.html')
    ? base.replace(/(<pre[^>]*>[\s\S]*?)(<\/pre>)/i,(_,body,close)=>insert(body,close))
    : base.replace(/\x60\x60\x60[^\n]*\n[\s\S]*?\x60\x60\x60/g,b=>b.includes('├──')?insert(b.slice(0,-3),'\x60\x60\x60'):b);
  if(next===old)continue;
  stale++;
  if(!check)fs.writeFileSync(source.path,next);
  console.log((check?'STALE ':'UPDATED ')+source.name);
}
if(check&&stale)process.exitCode=1;
else console.log('OK inventories match disk');
