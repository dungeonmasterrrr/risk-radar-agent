'use client';
import { useState } from 'react';
import { Layers3, RefreshCw } from 'lucide-react';
export default function DataStatus({config}:{config:any}){
  const [checking,setChecking]=useState(false),[result,setResult]=useState<any>(null),[error,setError]=useState('');
  async function check(){
    setChecking(true);setError('');setResult(null);
    try{
      const r=await fetch('/api/radar/fuyao-check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const data:any=await r.json();if(!r.ok)throw new Error(data.error||'连接检查失败');setResult(data);
    }catch(e:any){setError(e.message||'连接检查失败，请稍后重试');}finally{setChecking(false);}
  }
  const configured=config?.fuyaoConfigured;
  const badge=config?.fuyaoConfigured?'扶摇密钥已配置':'数据密钥未配置';
  return <section className="panel system-card"><div className="panel-heading"><h2><Layers3 size={17}/>行情数据连接</h2><span className={`pill ${configured?'green':'amber'}`}><i/>{badge}</span></div>
    <p>扶摇支持服务端直连：股票／指数价格与交易日历。是否有数据以每次实际检查为准。</p>
    <p>在创建或编辑任务时选择“扶摇直连”。盘前、字段为空或数据过期时返回“无法判断”，不拿昨收价代替最新价。</p>
    <p>全球标的可使用 Yahoo 实验行情，可能延迟；真实公告与热度尚未接入。演示任务继续保留明确的模拟标记。</p>
    <div style={{margin:'16px 23px 4px'}}><button className="button" disabled={checking||!config?.fuyaoConfigured} onClick={check}><RefreshCw size={13} className={checking?'spin':''}/>{checking?'正在验证…':'检查扶摇连接'}</button>
      {error&&<p role="alert" style={{fontSize:11,color:'#9b712c',marginTop:12}}>{error}</p>}
      {result&&<div role="status" className="inline-note" style={{marginTop:12}}><p style={{marginBottom:6}}>行情接口：{result.snapshot.price?.requestId?'正常':'未通过'}；交易日历：{result.snapshot.tradingCalendar?.requestId?'正常':'未通过'}。</p><p style={{marginBottom:0}}>{result.latestPriceAvailable?`最新价：${result.snapshot.price.value} 元；来源时间 ${result.snapshot.price.observedAt}`:result.snapshot.price?.error||'暂无有效最新价'}{result.snapshot.tradingCalendar?.error?`；${result.snapshot.tradingCalendar.error}`:''}</p></div>}
    </div>
  </section>;
}
