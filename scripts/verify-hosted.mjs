import { mkdir,writeFile } from 'node:fs/promises';
import { defaultRule,validateRule } from '../core/rules.mjs';
// Runtime access credential arrives once through hidden stdin, never argv or files.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for hosted verification JSON on stdin (input is hidden).');
let buffer='';
const input=await new Promise((resolve,reject)=>{
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{
    buffer+=chunk;
    if(/[\r\n]/.test(buffer)){
      process.stdin.pause();
      try{resolve(JSON.parse(buffer.trim()));}catch{reject(new Error('Invalid verification input'));}
    }
  });
});
const {origin,serviceToken}=input;
let cookie='';const checks=[];
async function api(path,body){
  const r=await fetch(new URL(`/api/radar/${path}`,origin),{method:body?'POST':'GET',redirect:'manual',headers:{'OAI-Sites-Authorization':`Bearer ${serviceToken}`,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const set=r.headers.getSetCookie().find(value=>value.startsWith('radar_session='));
  if(set)cookie=set.split(';')[0];
  if(!r.ok)throw new Error(`Hosted API ${path} returned HTTP ${r.status}`);
  return r.json();
}
const report={at:new Date().toISOString(),origin,checks};
try{
  const c=await api('config');checks.push({name:'线上 API 与数据库可访问',passed:true,modelConfigured:c.modelConfigured,relayConfigured:c.relayConfigured});
  const r=defaultRule();r.schedule.intervalSeconds=30;
  const t=(await api('tasks',{title:'线上验收 · 演示价格',rule:r,confirmed:true})).task;
  const first=await api(`tasks/${t.id}/run`,{});if(first.run.decision!=='notified')throw new Error('Expected first notification');
  const second=await api(`tasks/${t.id}/run`,{});if(second.run.decision!=='deduplicated')throw new Error('Expected deduplication');
  checks.push({name:'线上创建、提醒与去重',passed:true,taskId:t.id,runId:first.run.id});
  await api(`tasks/${t.id}/action`,{action:'scenario',value:'stale'});
  const stale=await api(`tasks/${t.id}/run`,{});if(stale.run.result!=='unknown')throw new Error('Expected unknown for stale data');
  checks.push({name:'线上过期降级',passed:true,runId:stale.run.id});
  await api(`tasks/${t.id}/action`,{action:'scenario',value:'normal'});
  // Keep due to observe whether deployed native cron actually fires.
  report.observedTaskId=t.id;
  const live=defaultRule();live.provider='tencent';
  const real=(await api('tasks',{title:'线上验收 · 真实行情',rule:live,confirmed:true})).task;
  const checked=await api(`tasks/${real.id}/run`,{});
  const price=checked.run.evidence.snapshot.price;
  checks.push({name:'线上真实行情适配',passed:typeof price?.value==='number',result:checked.run.result,sourceTime:price?.observedAt||null,error:price?.error||null});
  await api(`tasks/${real.id}/action`,{action:'pause'});
  if(input.verifyServiceUpdates){
    const updated=await api('service-tick',{});
    const after=await api(`tasks/${t.id}`);
    if(!after.runs[0].evidence.scheduled)throw new Error('Expected unattended writer record');
    checks.push({name:'私有云端写入入口与持久化回读',passed:true,checked:updated.checked,runId:after.runs[0].id});
  }
  const final=await api('config');report.heartbeat=final.heartbeat;
  report.success=checks.every(c=>c.passed);
}catch(e){report.success=false;report.error=e.message;}
await mkdir('docs/validation',{recursive:true});await writeFile('docs/validation/hosted-results.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!report.success)process.exitCode=1;
