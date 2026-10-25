import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const port=process.env.PORT||'5173';
const origin=`http://127.0.0.1:${port}`;
let vars=existsSync('.dev.vars')?readFileSync('.dev.vars','utf8'):'';
let secret=vars.match(/^SCHEDULER_SECRET=["']?([^\r\n"']+)/m)?.[1];
if(!secret){secret=randomBytes(32).toString('hex');vars+=`\nSCHEDULER_SECRET=${secret}\n`;writeFileSync('.dev.vars',vars);}
if(secret.length<32)throw new Error('SCHEDULER_SECRET must contain at least 32 characters.');
const children=[];
function child(args,env=process.env){const c=spawn(process.execPath,args,{stdio:'inherit',env});children.push(c);return c;}
function complete(c){return new Promise((resolve,reject)=>{c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(new Error(`Child process exited with code ${code}`)));});}
const stop=()=>{for(const c of children)if(c.exitCode===null)c.kill();};
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('exit',stop);
try{
  await complete(child(['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state']));
  const web=child(['scripts/run-framework.mjs','dev','--port',port]);
  let ready=false;
  for(let i=0;i<90;i++){if(web.exitCode!==null)throw new Error('Web server failed to start');try{const r=await fetch(`${origin}/api/radar/config`,{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  if(!ready)throw new Error('Web server did not become ready');
  console.log(`Risk Radar ready: ${origin}. Independent scheduler starts now.`);
  const scheduler=child(['scripts/scheduler.mjs'],{...process.env,RADAR_ORIGIN:origin,SCHEDULER_SECRET:secret});
  await Promise.race([complete(web),complete(scheduler)]);
}finally{stop();}
