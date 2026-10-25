import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let count=0;
for(const root of ['core','scripts','tests'])for(const name of readdirSync(root,{recursive:true}).filter(n=>n.endsWith('.mjs'))){const path=`${root}/${name}`;const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exitCode=1;}count++;}
console.log(`Syntax checked ${count} JavaScript modules.`);
