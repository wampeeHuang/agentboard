// 原型 → 真实页 机械回灌器
// 读 web/_proto/dashboard-leftnav.html 里 <!--#SYNC:name#-->…<!--#/SYNC#--> 标记区，
// 用同名标记区覆盖 web/index.html 的同一区域。机器抄，不手抄。
// 用法: node lib/sync-proto.mjs [name...]   （不传 = 同步所有标记区）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROTO = path.join(root, 'web', '_proto', 'dashboard-leftnav.html');
const REAL = path.join(root, 'web', 'index.html');

const only = process.argv.slice(2);
const proto = fs.readFileSync(PROTO, 'utf8');
let out = fs.readFileSync(REAL, 'utf8');

const blocks = [...proto.matchAll(/<!--#SYNC:([\w-]+)#-->([\s\S]*?)<!--#\/SYNC#-->/g)];
let changed = 0, skipped = 0;

for (const m of blocks) {
  const name = m[1];
  const full = m[0]; // 含两端标记
  if (only.length && !only.includes(name)) { skipped++; continue; }
  const re = new RegExp('<!--#SYNC:' + name + '#-->[\\s\\S]*?<!--#/SYNC#-->');
  if (re.test(out)) {
    out = out.replace(re, full);
    changed++;
    console.log('[sync] ' + name + ' → 已回灌');
  } else {
    console.error('[sync] ✗ 真实页缺区域: ' + name);
  }
}

fs.writeFileSync(REAL, out);
console.log('[sync] 完成：回灌 ' + changed + ' 区' + (skipped ? '，跳过 ' + skipped + ' 区' : ''));
