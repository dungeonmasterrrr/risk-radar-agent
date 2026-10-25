import { Miniflare } from 'miniflare';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
const names=readdirSync('dist/server',{recursive:true}).filter(n=>n.endsWith('.js')||n.endsWith('.mjs'));
const modules=['index.js',...names.filter(n=>n!=='index.js')].map(n=>({type:'ESModule',path:`dist/server/${n.replaceAll('\\','/')}`}));
const mf=new Miniflare({modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'scheduled-test'},cf:false,cachePersist:false});
try{
  const db=await mf.getD1Database('DB');
  const sql=await readFile('drizzle/0000_worried_turbo.sql','utf8');
  for(const stmt of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(stmt).run();
  const worker=await mf.getWorker();const outcome=await worker.scheduled({cron:'* * * * *'});
  const row=await db.prepare("SELECT value FROM system WHERE key='scheduler'").first();
  const report={at:new Date().toISOString(),outcome,heartbeat:row?JSON.parse(row.value):null};
  await mkdir('docs/validation',{recursive:true});await writeFile('docs/validation/worker-scheduled.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(outcome.outcome!=='ok'||report.heartbeat?.source!=='cloudflare-cron')process.exitCode=1;
}finally{await mf.dispose();}
