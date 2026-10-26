import { AppError } from './rules.mjs';
import { yahooJson } from './instruments.mjs';
export async function getYahooSnapshot(rule,now,fetcher=fetch){
  const days=Math.max(5,...rule.conditions.filter(c=>c.type==='drawdown').map(c=>c.lookbackDays));
  const from=Math.floor((now-(days+10)*86400000)/1000);
  const url=`/v8/finance/chart/${encodeURIComponent(rule.symbol.code)}?interval=1d&period1=${from}&period2=${Math.floor(now/1000)+1}`;
  const body=await yahooJson(url,fetcher),result=body.chart?.result?.[0],meta=result?.meta;
  if(meta?.symbol!==rule.symbol.code)throw new AppError('Yahoo 返回标的不匹配或无数据',502);
  const base={source:'Yahoo Finance · 实验行情（可能延迟，无 SLA）',simulated:false,url:`${body.sourceOrigin}${url}`,observedAt:typeof meta.regularMarketTime==='number'?new Date(meta.regularMarketTime*1000).toISOString():null,fetchedAt:new Date(now).toISOString(),currency:meta.currency,timezone:meta.exchangeTimezoneName,delayMinutes:meta.exchangeDataDelayedBy??null};
  const current=meta.regularMarketPrice;
  const snapshot={price:{...base,value:current},drawdowns:{}};
  if(typeof current!=='number'||!Number.isFinite(current)||current<=0)throw new AppError('Yahoo 缺少有效最新价',502);
  for(const c of rule.conditions.filter(c=>c.type==='drawdown')){
    const timestamps=result.timestamp,highs=result.indicators?.quote?.[0]?.high;
    const start=now-c.lookbackDays*86400000;
    const evidence={...base,lookbackDays:c.lookbackDays,windowStart:new Date(start).toISOString(),windowEnd:new Date(now).toISOString(),current};
    if(!Array.isArray(timestamps)||!Array.isArray(highs)||timestamps.length!==highs.length){snapshot.drawdowns[c.id]={...evidence,error:'历史最高价序列缺失或长度不匹配'};continue;}
    const rows=timestamps.map((t,i)=>({at:t*1000,high:highs[i]})).filter(r=>r.at>=start&&r.at<=now);
    // A rolling high requires history spanning the requested window, not a short fragment.
    if(!rows.length||rows[0].at>start+7*86400000||rows.at(-1).at<now-7*86400000||rows.some((r,i)=>!Number.isFinite(r.high)||r.high<=0||(i>0&&(r.at<=rows[i-1].at||r.at-rows[i-1].at>7*86400000)))){snapshot.drawdowns[c.id]={...evidence,error:'历史数据不完整，不能可靠计算该回看窗口的回撤'};continue;}
    const peak=Math.max(current,...rows.map(r=>r.high));
    const peakAt=peak===current?base.observedAt:new Date(rows.find(r=>r.high===peak).at).toISOString();
    snapshot.drawdowns[c.id]={...evidence,peak,peakAt,points:rows.length,value:(peak-current)/peak*100,definition:'相对滚动窗口内日线最高价（含当前价）的回撤百分比；未复权'};
  }
  if(rule.schedule.mode==='trading'){
    const p=meta.currentTradingPeriod?.regular;
    if(!p||!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start>=p.end||now/1000-p.end>4*86400)snapshot.tradingCalendar={...base,error:'来源未提供覆盖当前日期的交易时段'};
    else {snapshot.tradingDay=now>=p.start*1000&&now<p.end*1000;snapshot.tradingCalendar={...base,start:p.start,end:p.end,tradingDay:snapshot.tradingDay};}
  }
  return snapshot;
}
