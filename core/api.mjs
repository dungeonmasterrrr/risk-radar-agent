import { AppError, defaultRule, SYMBOLS } from './rules.mjs';
import { compile } from './agent.mjs';
import { Store } from './store.mjs';
import { runTask, runDue } from './engine.mjs';
const json = (value, status = 200, headers = {}) => Response.json(value, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function safeEqual(a,b) {
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
export async function handleApi(request,db,env={}) {
  let cookie;
  try {
    const url=new URL(request.url);
    const path=url.pathname.replace(/^\/api\/radar\/?/,'').split('/').filter(Boolean);
    if(request.method!=='GET') {
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin)throw new AppError('拒绝跨来源写入',403);
      if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('拒绝跨站请求',403);
      if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('写入请求必须使用 JSON',415);
    }
    const store=new Store(db);
    // Only enabled after the hosting platform verifies owner-only access.
    // Sites dispatch supplies the access boundary for this unattended writer.
    if(path[0]==='service-tick') {
      if(request.method!=='POST')throw new AppError('方法不支持',405);
      if(env.PRIVATE_SERVICE_UPDATES!=='true')throw new AppError('私有服务调度入口未启用',403);
      return json(await runDue(store,env,Date.now(),fetch,'sites-cloud-task'));
    }
    if(path[0]==='tick') {
      if(request.method!=='POST')throw new AppError('方法不支持',405);
      if(!env.SCHEDULER_SECRET||env.SCHEDULER_SECRET.length<32)throw new AppError('后台调度密钥未配置',503);
      if(!await safeEqual(request.headers.get('authorization')||'',`Bearer ${env.SCHEDULER_SECRET}`))throw new AppError('后台调度未授权',401);
      return json(await runDue(store,env,Date.now(),fetch,'http-scheduler'));
    }
    const authenticated=request.headers.get('oai-authenticated-user-id');
    let session=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('radar_session='))?.slice(14);
    if(!session||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(session)) {session=crypto.randomUUID();cookie=`radar_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`;}
    const owner=authenticated?`user:${authenticated}`:`demo:${session}`;
    const reply=(body,status=200)=>json(body,status,cookie?{'Set-Cookie':cookie}:{});
    let body={};
    if(request.method!=='GET') {
      if(Number(request.headers.get('content-length')||0)>32768)throw new AppError('请求过大',413);
      const raw=await request.text();if(raw.length>32768)throw new AppError('请求过大',413);
      try {body=JSON.parse(raw);}catch{throw new AppError('JSON 格式无效');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('请求格式无效');
    }
    if(path[0]==='config'&&request.method==='GET')return reply({symbols:SYMBOLS,modelConfigured:!!(env.MODEL_API_KEY&&env.MODEL_NAME),relayConfigured:!!env.DATA_RELAY_URL,schedulerConfigured:!!env.SCHEDULER_SECRET||env.PRIVATE_SERVICE_UPDATES==='true',schedulerCadenceSeconds:env.PRIVATE_SERVICE_UPDATES==='true'?3600:15,heartbeat:await store.heartbeatStatus(),sessionMode:authenticated?'authenticated':'isolated-demo',disclosure:'腾讯公开行情为实验接入；扶摇与 iFinD 需配置授权中继。演示数据不代表真实市场。'});
    if(path[0]==='compile'&&request.method==='POST')return reply(await compile(body.input,env));
    if(path[0]==='notifications') {
      if(request.method==='GET')return reply({notifications:await store.notifications(owner)});
      if(request.method==='POST'&&typeof body.id==='string'){await store.markRead(owner,body.id);return reply({ok:true});}
    }
    if(path[0]==='seed'&&request.method==='POST') {
      if((await store.list(owner)).length)return reply({tasks:await store.list(owner)});
      const r1=defaultRule();r1.schedule.intervalSeconds=60;
      const r2=defaultRule(SYMBOLS[1]);r2.conditions=[{type:'event',keyword:'回购',lookbackMinutes:1440}];r2.schedule.intervalSeconds=120;
      const r3=defaultRule(SYMBOLS[3]);r3.conditions=[{type:'price',op:'gt',value:40},{type:'heat',op:'gt',value:80}];
      const created=[];
      for(const [i,r] of [r1,r2,r3].entries()){
        const t=await store.create(owner,{title:['茅台价格防线','宁德时代 · 回购公告','招商银行 · 量价关注'][i],rule:r,confirmed:true});
        if(i===2)await store.action(owner,t.id,'scenario','stale');
        await runTask(store,owner,t.id,{env,key:'initial-demo'});created.push(t.id);
      }
      return reply({tasks:await store.list(owner),created},201);
    }
    if(path[0]==='tasks') {
      if(path.length===1&&request.method==='GET')return reply({tasks:await store.list(owner)});
      if(path.length===1&&request.method==='POST')return reply({task:await store.create(owner,body)},201);
      const id=path[1];
      if(id&&path.length===2&&request.method==='GET')return reply(await store.detail(owner,id));
      if(id&&path.length===2&&request.method==='PATCH')return reply({task:await store.edit(owner,id,body)});
      if(id&&path[2]==='run'&&request.method==='POST')return reply(await runTask(store,owner,id,{env,key:request.headers.get('idempotency-key')||crypto.randomUUID()}));
      if(id&&path[2]==='action'&&request.method==='POST')return reply({task:await store.action(owner,id,body.action,body.value)});
    }
    throw new AppError('接口不存在',404);
  }catch(e){return json({error:e instanceof AppError?e.message:'服务暂时不可用，请稍后重试；如持续失败请检查数据库与服务日志'},e instanceof AppError?e.status:500,cookie?{'Set-Cookie':cookie}:{});}
}
