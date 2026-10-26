'use client';
import { useEffect, useRef, useState } from 'react';
export default function InstrumentPicker({symbol,onSelect,examples=[]}:any){
  const [query,setQuery]=useState(''),[items,setItems]=useState<any[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const generation=useRef(0);
  useEffect(()=>{const id=++generation.current;setItems([]);setMessage('');if(!query.trim()){setBusy(false);return;}setBusy(true);const controller=new AbortController();const timer=setTimeout(async()=>{
    try{const r=await fetch(`/api/radar/instruments?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});const data:any=await r.json();if(id!==generation.current)return;if(!r.ok)throw new Error(data.error||'搜索失败');setItems(data.items);setMessage([...(data.warnings||[]),...(!data.items.length?['没有找到可核实的标的。可尝试完整名称、股票代码或英文代码。']:[])].join('；'));}catch(e:any){if(id===generation.current&&e.name!=='AbortError')setMessage(e.message||'搜索失败');}finally{if(id===generation.current)setBusy(false);}
  },350);return()=>{clearTimeout(timer);controller.abort();};},[query]);
  function select(s:any){onSelect({code:s.code,market:s.market,name:s.name,...(s.assetType?{assetType:s.assetType}:{})},s.provider);setQuery('');setItems([]);}
  return <div className="editor-field"><label htmlFor="instrument-search">监控标的 · 名称或代码搜索</label><div className="inline-note" style={{margin:0}}>{symbol.name} · {symbol.market} {symbol.code}</div><input id="instrument-search" autoComplete="off" placeholder="如：中国平安、601318、纳斯达克100、MSFT" value={query} onChange={e=>setQuery(e.target.value)}/>{busy&&<small role="status">正在核对数据目录…</small>}{message&&<small role="status">{message}</small>}{items.length>0&&<div className="instrument-results" aria-label="标的搜索结果">{items.map(s=><button type="button" key={`${s.market}:${s.code}`} disabled={!s.supported} onClick={()=>select(s)}><b>{s.name} · {s.code}</b><small>{s.note}</small></button>)}</div>}{!query&&<details><summary>常用示例（可搜索更多）</summary><div className="example-chips">{examples.map((s:any)=><button type="button" key={`${s.market}${s.code}`} onClick={()=>select(s)}>{s.name}</button>)}</div></details>}</div>;
}
