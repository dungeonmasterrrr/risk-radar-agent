'use client';
import HeatEvidence from './heat-evidence';
import {useEffect,useRef,useState} from 'react';
export default function DraftPreview({rule}:any){
  const [busy,setBusy]=useState(false),[result,setResult]=useState<any>(null),[error,setError]=useState('');const generation=useRef(0);
  useEffect(()=>{generation.current++;setResult(null);setError('');setBusy(false);},[rule]);
  async function preview(){const id=generation.current;setBusy(true);setError('');setResult(null);try{const r=await fetch('/api/radar/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rule})});const d:any=await r.json();if(id!==generation.current)return;if(!r.ok)throw new Error(d.error||'试算失败');setResult(d);}catch(e:any){if(id===generation.current)setError(e.message||'试算失败');}finally{if(id===generation.current)setBusy(false);}}
  return <div className="inline-note"><button className="button" type="button" disabled={busy} onClick={preview}>{busy?'正在读取数据…':'试算草案'}</button><small style={{display:'block',marginTop:8}}>读取当前数据并计算条件；确认启用后才会持续监控。</small>{error&&<p role="alert">{error}</p>}{result&&<div role="status" style={{marginTop:12}}><b>{result.evaluation.truth===null?'当前无法判断':result.evaluation.truth?'当前满足条件':'当前未满足条件'}</b>{result.evaluation.results.map((c:any)=><div key={c.id} style={{marginTop:8}}><p>{c.condition}：{c.reason}</p>{c.type==='heat'&&<HeatEvidence data={c.evidence}/>}{c.type==='drawdown'&&c.evidence?.peak&&<p>窗口最高价 {c.evidence.peak}，当前价 {c.evidence.current}，回撤 {c.evidence.value.toFixed(2)}%；日线 {c.evidence.points} 条。</p>}<small>{c.evidence?.source} {c.evidence?.observedAt?`· 行情时间 ${c.evidence.observedAt}`:''}</small></div>)}</div>}</div>;
}
