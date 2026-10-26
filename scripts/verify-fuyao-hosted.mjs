import {mkdir,writeFile} from 'node:fs/promises';
import {defaultRule} from '../core/rules.mjs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for hosted verification JSON on stdin (input is hidden).');
const input=await new Promise((resolve,reject)=>{let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;if(/[\r\n]/.test(buffer)){process.stdin.pause();try{resolve(JSON.parse(buffer.trim()));}catch{reject(new Error('Invalid verification input'));}}});});
let cookie='';
async function api(path,body){
  const r=await fetch(new URL(`/api/radar/${path}`,input.origin),{method:body?'POST':'GET',redirect:'manual',headers:{'OAI-Sites-Authorization':`Bearer ${input.serviceToken}`,...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(40000)});
  const set=r.headers.getSetCookie().find(c=>c.startsWith('radar_session='));if(set)cookie=set.split(';')[0];
  if(!r.ok)throw new Error(`Hosted ${path} HTTP ${r.status}`);return r.json();
}
const report={testedAt:new Date().toISOString(),origin:input.origin,checks:[]};let task;
try{
  const config=await api('config');if(!config.fuyaoConfigured)throw new Error('Fuyao runtime secret is not configured');
  report.checks.push({name:'线上扶摇配置',passed:true,modelConfigured:config.modelConfigured});
  const connection=await api('fuyao-check',{});if(!connection.connected)throw new Error('Fuyao price or calendar connection failed');
  report.checks.push({name:'线上真实行情及日历接口',passed:true,...connection});
  if(input.verifyCompile){
    const draft=await api('compile',{input:'使用扶摇监控贵州茅台，价格低于1400元时提醒，每5分钟检查，冷却30分钟。'});
    report.checks.push({name:'自然语言选择扶摇',passed:draft.rule?.provider==='fuyao',mode:draft.mode,model:draft.model||null,trace:draft.trace});
  }
  const rule=defaultRule();rule.provider='fuyao';
  task=(await api('tasks',{title:'线上验收 · 扶摇价格',rule,confirmed:true})).task;
  const execution=await api(`tasks/${task.id}/run`,{});
  const price=execution.run.evidence.snapshot.price;
  if(!price?.requestId||price.simulated!==false)throw new Error('Missing real source evidence');
  report.checks.push({name:'线上任务执行及持久化证据',passed:true,taskId:task.id,runId:execution.run.id,result:execution.run.result,explanation:execution.run.explanation,price});
  report.success=report.checks.every(c=>c.passed);
}catch(e){report.success=false;report.error=e.message;}
finally{if(task){try{await api(`tasks/${task.id}/action`,{action:'pause'});report.testTaskPaused=true;}catch{report.testTaskPaused=false;}}}
await mkdir('outputs',{recursive:true});await writeFile('outputs/fuyao-online-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!report.success)process.exitCode=1;
