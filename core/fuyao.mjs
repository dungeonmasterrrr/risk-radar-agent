import { AppError } from './rules.mjs';
const ORIGIN='https://fuyao.aicubes.cn';
const dateKey=ms=>new Date(ms+8*3600000).toISOString().slice(0,10).replaceAll('-','');
const errors={2001:'扶摇密钥无效或未认证',2003:'扶摇账号尚无此数据权限',3001:'扶摇未找到该标的',3002:'扶摇数据尚未就绪',3004:'扶摇当前接口不支持该标的类型',4001:'扶摇请求受限，等待退避重试',5002:'扶摇上游请求超时',5003:'扶摇数据源暂不可用'};
function validTimestamp(value){return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=8640000000000000;}
export async function requestFuyao(path,query,key,fetcher){
  const url=new URL(path,ORIGIN);for(const [k,v]of Object.entries(query))url.searchParams.set(k,v);
  let response;
  try{response=await fetcher(url.href,{headers:{'X-api-key':key},redirect:'manual',signal:AbortSignal.timeout(12000)});}
  catch(e){throw new AppError(['AbortError','TimeoutError'].includes(e?.name)?'扶摇接口请求超时':'扶摇网络请求失败',502);}
  if(response.status===429)throw new AppError(errors[4001],429);
  if(!response.ok)throw new AppError(`扶摇接口返回 HTTP ${response.status}，未跟随重定向`,502);
  let body;try{body=await response.json();}catch{throw new AppError('扶摇响应不是有效 JSON',502);}
  if(!body||typeof body.code!=='number')throw new AppError('扶摇响应信封缺少业务结果码',502);
  if(body.code!==0)throw new AppError(errors[body.code]||`扶摇业务请求失败（code=${body.code}）`,502);
  if(!body.data||!Array.isArray(body.data.item))throw new AppError('扶摇响应缺少数据列表',502);
  const requestId=typeof body.request_id==='string'&&body.request_id.length<=128&&!body.request_id.includes(key)?body.request_id:null;
  return {data:body.data,url:url.href,requestId};
}
function base(result,now,source){return {source,url:result.url,requestId:result.requestId,simulated:false,observedAt:validTimestamp(result.data.timestamp)?new Date(result.data.timestamp).toISOString():null,fetchedAt:new Date(now).toISOString()};}
export async function getFuyaoHotList(period,now,env={},fetcher=fetch){
  if(!['day','hour'].includes(period))throw new AppError('热榜周期须为day或hour');
  if(!env.FUYAO_API_KEY)throw new AppError('尚未配置扶摇密钥 FUYAO_API_KEY',503);
  const result=await requestFuyao('/api/a-share/special-data/hot-stock-list',{period,limit:'100'},env.FUYAO_API_KEY,fetcher);
  const b=base(result,now,'扶摇 · 同花顺A股热股榜');
  if(!validTimestamp(result.data.timestamp))throw new AppError('热榜缺少有效来源时间',502);
  if(result.data.item.length>100)throw new AppError('热榜返回超出请求范围，未采用数据',502);
  const codes=new Set(),ranks=new Set();let lastRank=0;
  const rows=result.data.item.map(row=>{
    if(!row||!/^\d{6}\.(SH|SZ)$/.test(row.thscode)||typeof row.name!=='string'||!row.name.trim()||!Number.isInteger(row.rank)||row.rank<1||row.rank>100||codes.has(row.thscode)||ranks.has(row.rank)||row.rank<=lastRank||row.ticker&&row.ticker!==row.thscode.slice(0,6))throw new AppError('热榜标的、排名、顺序或重复字段校验失败',502);
    codes.add(row.thscode);ranks.add(row.rank);lastRank=row.rank;
    const rankChange=Number.isSafeInteger(row.rank_change)?row.rank_change:null;
    const trend=['up','down','flat','unknown'].includes(row.rank_trend)?row.rank_trend:'unknown';
    const conflict=rankChange!==null&&trend!=='unknown'&&((rankChange>0&&trend!=='up')||(rankChange<0&&trend!=='down')||(rankChange===0&&trend!=='flat'));
    return {code:row.thscode.slice(0,6),market:row.thscode.slice(-2),name:row.name,thscode:row.thscode,rank:row.rank,rawHeat:typeof row.heat==='string'&&/^\d+(?:\.\d+)?$/.test(row.heat)?row.heat:null,rankChange,trend,conflict};
  });
  let coverageRank=0;while(ranks.has(coverageRank+1))coverageRank++;
  return {...b,period,coverageRank,requestedLimit:100,returnedCount:rows.length,rows};
}
export function heatForSymbol(board,symbol){
  const row=board.rows.find(r=>r.thscode===`${symbol.code}.${symbol.market}`);
  const {rows,...metadata}=board;
  return {...metadata,listed:row?true:board.coverageRank===100?false:null,rank:row?.rank??null,rawHeat:row?.rawHeat??null,rankChange:row?.rankChange??null,trend:row?.trend||'unknown',conflict:row?.conflict||false,thscode:`${symbol.code}.${symbol.market}`};
}
export async function getFuyaoSnapshot(rule,now,env={},fetcher=fetch){
  const needsPrice=rule.conditions.some(c=>c.type==='price');
  const needsCalendar=rule.schedule.mode==='trading';
  const snapshot={};
  if(rule.conditions.some(c=>c.type==='event'))snapshot.event={source:'扶摇直连',simulated:false,error:'公告条件请使用iFinD MCP'};
  const periods=[...new Set(rule.conditions.filter(c=>c.type==='heat'&&['day','hour'].includes(c.period)).map(c=>c.period))];
  if(periods.length)snapshot.heatByPeriod={};
  for(const period of periods)try{snapshot.heatByPeriod[period]=heatForSymbol(await getFuyaoHotList(period,now,env,fetcher),rule.symbol);}catch(e){snapshot.heatByPeriod[period]={source:'扶摇 · 同花顺A股热股榜',period,simulated:false,error:e instanceof AppError?e.message:'热榜数据解析失败'};}
  if(!needsPrice&&!needsCalendar)return snapshot;
  if(!env.FUYAO_API_KEY)throw new AppError('尚未配置扶摇密钥 FUYAO_API_KEY',503);
  const key=env.FUYAO_API_KEY;
  if(needsPrice){
    try{
      const index=rule.symbol.assetType==='a-share-index'||rule.symbol.market==='SH'&&rule.symbol.code==='000300';
      const path=index?'/api/a-share-index/prices/snapshot':'/api/a-share/prices/snapshot';
      const thscode=`${rule.symbol.code}.${rule.symbol.market}`;
      const result=await requestFuyao(path,{thscodes:thscode},key,fetcher);
      const b=base(result,now,index?'扶摇 · 指数行情快照':'扶摇 · A股行情快照');
      const matches=result.data.item.filter(row=>row?.thscode===thscode);
      if(matches.length!==1){snapshot.price={...b,error:'扶摇快照标的缺失、重复或代码不匹配'};}
      else{
        const row=matches[0];
        const rawFields={thscode:row.thscode,last_price:typeof row.last_price==='number'?row.last_price:null,prev_price:typeof row.prev_price==='number'?row.prev_price:null,timestamp:result.data.timestamp};
        if(!validTimestamp(result.data.timestamp))snapshot.price={...b,error:'扶摇快照缺少有效来源时间',rawFields};
        else if(typeof row.last_price!=='number'||!Number.isFinite(row.last_price)||row.last_price<=0)snapshot.price={...b,value:null,error:'扶摇尚未提供有效最新成交价；可能尚未开市或数据未就绪，不使用昨收价替代',rawFields};
        else snapshot.price={...b,value:row.last_price,currency:'CNY',rawFields};
      }
    }catch(e){snapshot.price={source:'扶摇行情',simulated:false,error:e instanceof AppError?e.message:'扶摇行情数据解析失败'};}
  }
  if(needsCalendar){
    try{
      const result=await requestFuyao('/api/a-share/calendar/trading-days',{},key,fetcher);
      const b=base(result,now,'扶摇 · A股交易日历');
      const today=dateKey(now);
      const items=result.data.item;
      const validRows=items.length>0&&items.every(row=>{
        if(typeof row?.date!=='string'||!/^\d{8}$/.test(row.date)||!validTimestamp(row.date_ms))return false;
        const midnight=new Date(row.date_ms+8*3600000);
        return dateKey(row.date_ms)===row.date&&midnight.getUTCHours()===0&&midnight.getUTCMinutes()===0&&midnight.getUTCSeconds()===0&&midnight.getUTCMilliseconds()===0;
      });
      if(!validRows)throw new AppError('扶摇交易日历为空或日期字段无效，无法判断是否交易日',502);
      if(!validTimestamp(result.data.timestamp)||dateKey(result.data.timestamp)!==today||result.data.timestamp-now>60000)throw new AppError('扶摇交易日历来源时间不覆盖今天，无法判断是否交易日',502);
      snapshot.tradingDay=items.some(row=>row.date===today);
      snapshot.tradingCalendar={...b,date:today,tradingDay:snapshot.tradingDay,window:{first:items[0].date,last:items.at(-1).date},count:items.length};
    }catch(e){snapshot.tradingCalendar={source:'扶摇交易日历',simulated:false,error:e instanceof AppError?e.message:'扶摇交易日历解析失败'};}
  }
  return snapshot;
}
