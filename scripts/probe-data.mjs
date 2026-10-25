import { mkdir,writeFile } from 'node:fs/promises';
import { getSnapshot } from '../core/providers.mjs';
import { defaultRule,evaluate } from '../core/rules.mjs';
const now=Date.now(),rule=defaultRule();rule.provider='tencent';
const report={checkedAt:new Date(now).toISOString(),timezone:'Asia/Shanghai',provider:'tencent',symbol:rule.symbol,modelLiveCallVerified:false,authorizedRelayVerified:false};
try{report.snapshot=await getSnapshot(rule,'normal',now);report.evaluation=evaluate(rule,report.snapshot,now);report.success=true;}catch(e){report.success=false;report.error=e.message;}
const out=new URL('../docs/validation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('data-probe.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({success:report.success,result:report.evaluation?.truth??null,observedAt:report.snapshot?.price?.observedAt,error:report.error}));
