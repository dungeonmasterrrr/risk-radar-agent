import { AppError, SYMBOLS } from './rules.mjs';
import { requestFuyao } from './fuyao.mjs';
export const NASDAQ100={code:'^NDX',market:'GLOBAL',name:'纳斯达克100',assetType:'INDEX'};
const supported=new Set(['EQUITY','ETF','INDEX']);
export async function yahooJson(path,fetcher=fetch){
  let response;try{response=await fetcher(`https://query1.finance.yahoo.com${path}`,{redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{throw new AppError('Yahoo 行情网络请求失败或超时',502);}
  if(!response.ok)throw new AppError(`Yahoo 实验行情返回 HTTP ${response.status}`,502);
  try{return await response.json();}catch{throw new AppError('Yahoo 行情格式无效',502);}
}
export async function searchInstruments(query,env={},fetcher=fetch){
  const q=typeof query==='string'?query.trim():'';
  if(!q||q.length>80)throw new AppError('请输入 1–80 字的名称或代码');
  const special=/纳斯达克\s*100|纳指\s*100|NASDAQ.?100|\^NDX|^NDX$/i.test(q);
  const results=[],warnings=[];
  if(special)results.push({...NASDAQ100,provider:'yahoo',supported:true,note:'指数本身 · Yahoo 实验行情，可能延迟'});
  const jobs=[];
  if(env.FUYAO_API_KEY)jobs.push((async()=>{
    const {data}=await requestFuyao('/api/meta/tickers/search',{q,limit:'20'},env.FUYAO_API_KEY,fetcher);
    for(const row of data.item){if(!/^\d{6}$/.test(row.ticker)||!['SH','SZ'].includes(row.exchange)||typeof row.name!=='string')continue;
      const available=['a-share','a-share-index'].includes(row.asset_type);
      results.push({code:row.ticker,market:row.exchange,name:row.name,assetType:row.asset_type,provider:'fuyao',supported:available,note:available?'扶摇已接入价格':'数据目录可找到；该资产类型行情尚未接入'});
    }
  })());
  if(!special&&/^[A-Za-z^][A-Za-z0-9.^=-]{0,24}$/.test(q))jobs.push((async()=>{
    const data=await yahooJson(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`,fetcher);
    for(const row of data.quotes||[])if(supported.has(row.quoteType)&&/^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,24}$/.test(row.symbol))results.push({code:row.symbol,market:'GLOBAL',name:row.longname||row.shortname||row.symbol,assetType:row.quoteType,provider:'yahoo',supported:true,note:`${row.exchange||''} · Yahoo 实验行情，可能延迟`});
  })());
  for(const r of await Promise.allSettled(jobs))if(r.status==='rejected')warnings.push(r.reason instanceof AppError?r.reason.message:'标的查询失败');
  if(!env.FUYAO_API_KEY)for(const s of SYMBOLS)if([s.name,s.code,...s.aliases].some(x=>x.includes(q)||q.includes(x)))results.push({...s,provider:'tencent',supported:true,note:'示例标的 · 腾讯实验行情'});
  return {items:results.filter((s,i,a)=>a.findIndex(t=>t.code===s.code&&t.market===s.market)===i),warnings};
}
export async function verifyInstrument(symbol,env={},fetcher=fetch){
  if(symbol.market==='GLOBAL'){
    if(!/^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,24}$/.test(symbol.code))throw new AppError('标的代码格式无效');
    const data=await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol.code)}?interval=1d&range=5d`,fetcher);
    const meta=data.chart?.result?.[0]?.meta;
    if(meta?.symbol!==symbol.code||!supported.has(meta.instrumentType))throw new AppError('未核实该标的的行情能力');
    return {code:meta.symbol,market:'GLOBAL',name:meta.symbol==='^NDX'?NASDAQ100.name:meta.longName||meta.shortName||meta.symbol,assetType:meta.instrumentType};
  }
  if(SYMBOLS.some(s=>s.code===symbol.code&&s.market===symbol.market))return {...SYMBOLS.find(s=>s.code===symbol.code&&s.market===symbol.market),assetType:symbol.code==='000300'&&symbol.market==='SH'?'a-share-index':'a-share'};
  const found=await searchInstruments(`${symbol.code}.${symbol.market}`,env,fetcher);
  const match=found.items.find(s=>s.code===symbol.code&&s.market===symbol.market&&s.supported);
  if(!match)throw new AppError(found.warnings.join('；')||'未核实该标的；请先按名称或代码搜索并选择已接入的结果');
  return {code:match.code,market:match.market,name:match.name,assetType:match.assetType};
}
