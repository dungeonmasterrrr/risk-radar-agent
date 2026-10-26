import {AppError} from './rules.mjs';
import {getFuyaoSnapshot} from './fuyao.mjs';
const BASE='https://api-mcp.51ifind.com:8643/ds-mcp-servers';
const ENDPOINTS={stock:`${BASE}/hexin-ifind-ds-stock-mcp`,news:`${BASE}/hexin-ifind-ds-news-mcp`,index:`${BASE}/hexin-ifind-ds-index-mcp`};
const ALLOWED={stock:['stock_highfreq_quotes'],index:['index_highfreq_quotes'],news:['search_notice','search_news','search_trending_news']};
const PROTOCOL='2025-03-26';
let active=0;const queue=[];
async function limited(fn,waitMs){if(active>=2)await new Promise((resolve,reject)=>{const slot=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{const i=queue.indexOf(slot);if(i>=0)queue.splice(i,1);reject(new AppError('iFinD 请求排队超时，等待下轮检查',502));},Math.max(1,waitMs));queue.push(slot);});else active++;try{return await fn();}finally{const next=queue.shift();if(next)next();else active--;}}
async function responseText(response){let size=0,text='';const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288)throw new AppError('iFinD 响应过大，未采用截断数据',502);text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel().catch(()=>{});}}
export function parseMcpResponse(raw,id){
  let candidates=[];try{candidates=[JSON.parse(raw)];}catch{
    for(const block of raw.split(/\r?\n\r?\n/)){const text=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(text)try{candidates.push(JSON.parse(text));}catch{/* Ignore SSE heartbeats, not result messages. */}}
  }
  const matches=candidates.filter(x=>x?.jsonrpc==='2.0'&&x.id===id);
  if(matches.length!==1)throw new AppError('iFinD MCP 响应格式或请求编号不匹配',502);
  if(matches[0].error)throw new AppError('iFinD MCP 返回协议错误，请检查账号权限和工具参数',502);
  return matches[0].result;
}
function unwrap(result){
  if(result?.isError)throw new AppError('iFinD 工具执行失败，请检查权益、额度或参数',502);
  const objects=[];
  for(const c of result?.content||[])if(c.type==='text'&&typeof c.text==='string')try{objects.push(JSON.parse(c.text));}catch{/* Only adopt structured business envelopes. */}
  if(objects.length!==1||objects[0]?.code!==1||![null,undefined,0,'0',''].includes(objects[0].subCode))throw new AppError('iFinD 业务返回未通过校验，未采用其内容',502);
  let data=objects[0].data;
  if(typeof data==='string'&&/^[\[{]/.test(data.trim()))try{data=JSON.parse(data);}catch{throw new AppError('iFinD 返回的数据 JSON 无效',502);}
  return data;
}
export function createIfindClient(env={},fetcher=fetch){
  const key=env.IFIND_MCP_API_KEY?.trim();
  if(!key||key.length<10||/\s/.test(key)||/your.*key|你的密钥/i.test(key))throw new AppError('尚未配置有效 iFinD 密钥 IFIND_MCP_API_KEY',503);
  let counter=0;const sessions=new Map(),initializing=new Map(),deadline=Date.now()+40000;
  async function post(server,method,params,notify=false){
    if(!ENDPOINTS[server])throw new AppError('不支持的 iFinD 服务');
    const id=++counter;
    return limited(async()=>{
      const remaining=deadline-Date.now();if(remaining<=0)throw new AppError('iFinD 本次取数已超时，等待下轮检查',502);
      let response,raw;
      try{response=await fetcher(ENDPOINTS[server],{method:'POST',redirect:'manual',signal:AbortSignal.timeout(Math.min(12000,remaining)),headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:key,'User-Agent':'RiskRadar/1.0',...(sessions.has(server)?{'Mcp-Session-Id':sessions.get(server),'MCP-Protocol-Version':PROTOCOL}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notify?{id}:{}),method,...(params?{params}:{})})});
        if(!response.ok){await response.body?.cancel().catch(()=>{});throw new AppError(response.status===429?'iFinD 请求受限，请等待后台退避或检查额度':[401,403].includes(response.status)?'iFinD 密钥无效或当前账号无此权限':`iFinD 接口返回 HTTP ${response.status}，未跟随重定向`,502);}
        raw=await responseText(response);
      }catch(e){if(e instanceof AppError)throw e;throw new AppError('iFinD 网络请求失败或超时',502);}
      if(method==='initialize'){
        const session=response.headers.get('mcp-session-id');
        if(!session||session.length>1024)throw new AppError('iFinD 初始化未返回有效会话标识',502);
        sessions.set(server,session);
      }
      return notify?null:parseMcpResponse(raw,id);
    },deadline-Date.now());
  }
  async function init(server){if(!initializing.has(server))initializing.set(server,(async()=>{const result=await post(server,'initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:'risk-radar',version:'1.0.0'}});if(result?.protocolVersion!==PROTOCOL)throw new AppError('iFinD MCP 协议版本不匹配',502);await post(server,'notifications/initialized',null,true);})());return initializing.get(server);}
  return {
    async list(server){await init(server);const result=await post(server,'tools/list',{});if(!Array.isArray(result?.tools))throw new AppError('iFinD 工具列表无效',502);return result.tools.map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema}));},
    async call(server,tool,args){if(!ALLOWED[server]?.includes(tool))throw new AppError('该 iFinD 工具未接入');await init(server);return unwrap(await post(server,'tools/call',{name:tool,arguments:args}));},
  };
}
const dateKey=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
function sourceBase(now,tool){return {source:`同花顺 iFinD MCP · ${tool}`,tool,simulated:false,fetchedAt:new Date(now).toISOString()};}
export function ifindPrice(data,symbol,now,tool){
  const base=sourceBase(now,tool),table=data?.tables;
  if(!Array.isArray(table)||!Array.isArray(table[0]))throw new AppError('iFinD 行情缺少结构化表格',502);
  const headers=table[0],code=headers.indexOf('证券代码'),time=headers.indexOf('time'),price=headers.indexOf('最新价');
  if([code,time,price].some(i=>i<0))throw new AppError('iFinD 行情字段不完整',502);
  const rows=table.slice(1).filter(row=>Array.isArray(row)&&row[code]===`${symbol.code}.${symbol.market}`);
  if(rows.length!==1)throw new AppError('iFinD 行情标的缺失、重复或不匹配',502);
  const row=rows[0],raw=row[price],value=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
  const t=row[time];
  if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)||!Number.isFinite(Date.parse(t.replace(' ','T')+'+08:00'))||new Date(Date.parse(t.replace(' ','T')+'+08:00')+8*3600000).toISOString().slice(0,19)!==t.replace(' ','T'))throw new AppError('iFinD 行情缺少有效来源时间',502);
  if(!Number.isFinite(value)||value<=0)throw new AppError('iFinD 尚未返回有效最新价，不以其他字段替代',502);
  return {...base,value,currency:'CNY',observedAt:t.replace(' ','T')+'+08:00',rawFields:{code:row[code],time:t,price:raw}};
}
export function normalizeIfindQuery(kind,data,depth=0){
  if(depth>3)throw new AppError('iFinD 返回数据嵌套过深',502);
  if(Array.isArray(data)){const items=data.filter(r=>r&&typeof r==='object'&&!(r['备注']&&Object.keys(r).length===1));return {kind,items,empty:items.length===0,message:'返回语义检索片段；不代表完整数据覆盖。'};}
  for(const key of ['result','data'])if(typeof data?.[key]==='string'&&/^[\[{]/.test(data[key].trim()))try{return normalizeIfindQuery(kind,JSON.parse(data[key]),depth+1);}catch{throw new AppError('iFinD 资讯片段格式无效',502);}
  const message=typeof data==='string'?data:data?.result;
  if(typeof message==='string'&&/结果为空|暂无.*结果/.test(message))return {kind,items:[],empty:true,message};
  throw new AppError('iFinD 查询返回结构尚不支持，未推测字段含义',502);
}
export async function queryIfind(input,env={},fetcher=fetch){
  const {kind,query}=input;
  if(!['notice','news','hotspot'].includes(kind)||typeof query!=='string'||!query.trim()||query.length>200)throw new AppError('请选择查询类型并输入 1–200 字关键词');
  const size=input.size??5;if(!Number.isInteger(size)||size<1||size>20)throw new AppError('查询条数须为 1–20');
  let args,tool;
  if(kind==='hotspot'){tool='search_trending_news';const scope=input.timeScope||'24小时';if(!['6小时','24小时','近一周'].includes(scope))throw new AppError('不支持的热点时间范围');args={keyword:query.trim(),time_scope:scope,size};}
  else{tool=kind==='notice'?'search_notice':'search_news';for(const v of [input.start,input.end])if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new AppError('查询起止日期无效');if(input.start>input.end||Date.parse(input.end)-Date.parse(input.start)>366*86400000)throw new AppError('查询日期须按顺序且不超过366天');args={query:query.trim(),time_start:input.start,time_end:input.end,size};}
  const data=await createIfindClient(env,fetcher).call('news',tool,args);
  const normalized=normalizeIfindQuery(kind,data);let excluded=0;
  if(kind!=='hotspot'){const filtered=normalized.items.filter(row=>{const date=row['日期'];const valid=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=input.start&&date<=input.end;if(!valid)excluded++;return valid;});normalized.items=filtered;normalized.empty=filtered.length===0;}
  return {...normalized,...sourceBase(Date.now(),tool),excludedOutOfRange:excluded,query:args};
}
async function noticeSnapshot(data,rule,condition,now,query){
  const base={...sourceBase(now,'search_notice'),observedAt:new Date(now).toISOString(),timeBasis:'检索完成时间；公告时间见每条记录',coverage:'semantic',query,items:[]};
  const normalized=normalizeIfindQuery('notice',data);
  if(normalized.empty)return {...base,searchMessage:normalized.message};
  const dedup=new Map();let invalid=0;
  for(const row of normalized.items){
    if(!row||row['备注']&&!row['公告标题'])continue;
    const title=row['公告标题'],published=row['日期'],excerpt=row['公告片段内容'];
    if(typeof title!=='string'||typeof published!=='string'||typeof excerpt!=='string'){invalid++;continue;}
    if(!title.includes(rule.symbol.name)){invalid++;continue;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(published)||!Number.isFinite(Date.parse(published))||new Date(published).toISOString().slice(0,10)!==published){invalid++;continue;}
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${rule.symbol.market}${rule.symbol.code}|${published}|${title}`));
    const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    dedup.set(id,{id:`ifind-notice:${id}`,idBasis:'标的、公告日期与标题的SHA-256；不是上游公告ID',title,excerpt,publishedAt:`${published}T00:00:00+08:00`,timePrecision:'day',publicationDate:published,url:null});
  }
  return {...base,items:[...dedup.values()],invalidRows:invalid,matchScope:'title-and-excerpt',searchMessage:'语义检索只返回相关片段；未命中不代表没有公告。'};
}
export async function getIfindSnapshot(rule,now,env={},fetcher=fetch){
  const client=createIfindClient(env,fetcher),snapshot={events:{}};
  if(rule.conditions.some(c=>c.type==='price'))try{const index=rule.symbol.assetType==='a-share-index'||rule.symbol.code==='000300'&&rule.symbol.market==='SH',server=index?'index':'stock',tool=`${server}_highfreq_quotes`;const data=await client.call(server,tool,{symbols:`${rule.symbol.code}.${rule.symbol.market}`,indicators:'最新价',data_mode:'real_time'});snapshot.price=ifindPrice(data,rule.symbol,now,tool);}catch(e){snapshot.price={...sourceBase(now,'highfreq_quotes'),error:e instanceof AppError?e.message:'iFinD 行情解析失败'};}
  // Sequential calls keep per-task concurrency below the free-account limit.
  for(const c of rule.conditions.filter(c=>c.type==='event'))try{const args={query:`${rule.symbol.name} ${rule.symbol.code}.${rule.symbol.market} ${c.keyword}`,time_start:dateKey(now-c.lookbackMinutes*60000),time_end:dateKey(now),size:20};const data=await client.call('news','search_notice',args);snapshot.events[c.id]=await noticeSnapshot(data,rule,c,now,args);}catch(e){snapshot.events[c.id]={...sourceBase(now,'search_notice'),error:e instanceof AppError?e.message:'iFinD 公告数据解析失败'};}
  if(rule.schedule.mode==='trading')try{const calendar=await getFuyaoSnapshot({...rule,conditions:[]},now,env,fetcher);snapshot.tradingDay=calendar.tradingDay;snapshot.tradingCalendar=calendar.tradingCalendar;}catch(e){snapshot.tradingCalendar={source:'扶摇交易日历',error:e instanceof AppError?e.message:'交易日历不可用'};}
  return snapshot;
}
