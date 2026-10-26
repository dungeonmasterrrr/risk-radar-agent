'use client';
import {HEAT_TRENDS,heatPeriod} from '@/core/heat.mjs';
export default function HeatEvidence({data}:any){
  if(!data||data.error||!data.period)return null;
  const change=Number.isInteger(data.rankChange)?`${data.rankChange>0?'+':''}${data.rankChange} 位`:'未提供';
  const rank=data.listed===true?`第 ${data.rank} 名`:data.listed===false?'未进前100名':'无法确认';
  return <div className="heat-evidence"><dl className="heat-metrics">{[['排名',rank],['原始热度值',data.rawHeat??'未提供'],['排名变化',change],['趋势',HEAT_TRENDS[data.trend as keyof typeof HEAT_TRENDS]||'未知']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><small>{heatPeriod(data.period)} · 原始热度值仅展示 · 来源时间 {Number.isFinite(Date.parse(data.observedAt))?new Date(data.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未知'}{data.simulated?' · 模拟':''}</small></div>;
}
