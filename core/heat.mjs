export const HEAT_TRENDS={up:'上升',down:'下降',flat:'持平',unknown:'未知'};
export const heatPeriod=p=>p==='hour'?'小时榜':'24小时榜';
export const usesRawHeatThreshold=text=>/热度(?:值|指数)?\s*(?:高于|低于|大于|小于|超过|不少于|不低于|不高于|达到|升至|降至|[<>≤≥=])\s*[\d一二两三四五六七八九十百千万亿零〇]/.test(text);
export function isLegacyHeat(c){return c?.type==='heat'&&(!c.mode||'value' in c||'op' in c);}
export function heatLabel(c){
  if(isLegacyHeat(c))return '旧版数值热度条件（已停用，请编辑）';
  const board=`同花顺热股${heatPeriod(c.period)}`;
  if(c.mode==='rank')return `${board}前 ${c.topN} 名`;
  if(c.mode==='rank_change')return `${board}前100名内，排名${HEAT_TRENDS[c.direction]}至少 ${c.minChange} 位`;
  if(c.mode==='trend')return `${board}前100名内，趋势${HEAT_TRENDS[c.trend]}`;
  return `进入${board}前100名`;
}
export function heatEvidence(data){
  if(!data||data.error)return data?.error||'尚无热榜数据';
  if(data.listed===false)return `未进入返回的前100名；榜单时间 ${data.observedAt||'未知'}`;
  if(data.listed!==true)return `本次覆盖前 ${data.coverageRank||0} 名，无法确认完整前100名`;
  const delta=Number.isInteger(data.rankChange)?`${data.rankChange>0?'+':''}${data.rankChange} 位`:'未提供';
  return `排名 ${data.rank??'未提供'} · 原始热度值 ${data.rawHeat??'未提供'} · 排名变化 ${delta} · 趋势 ${HEAT_TRENDS[data.trend]||'未知'}`;
}
export function evaluateHeat(c,data){
  if(isLegacyHeat(c))return {truth:null,reason:'旧版原始热度数值比较已停用，请编辑并确认新的热榜规则'};
  if(data.period!==c.period)return {truth:null,reason:'热榜周期与规则不一致'};
  const needed=c.mode==='rank'?c.topN:100;
  if(data.listed!==true){
    if(data.coverageRank>=needed)return {truth:false,reason:`返回榜单覆盖前 ${data.coverageRank} 名，目标未进入前 ${needed} 名；不代表没有热度`};
    return {truth:null,reason:`本次榜单仅覆盖前 ${data.coverageRank||0} 名，无法确认前 ${needed} 名条件`};
  }
  if(!Number.isInteger(data.rank)||data.rank<1||data.rank>100)return {truth:null,reason:'热榜排名缺失或无效'};
  if(c.mode==='listed')return {truth:true,reason:`已进入${heatPeriod(c.period)}前100名，当前第 ${data.rank} 名`};
  if(c.mode==='rank')return {truth:data.rank<=c.topN,reason:`当前第 ${data.rank} 名；要求前 ${c.topN} 名`};
  if(c.mode==='rank_change'){
    if(!Number.isInteger(data.rankChange))return {truth:null,reason:'来源未提供可验证的排名变化'};
    const movement=c.direction==='up'?data.rankChange:-data.rankChange;
    return {truth:movement>=c.minChange,reason:`来源排名变化 ${data.rankChange>0?'+':''}${data.rankChange} 位；要求${HEAT_TRENDS[c.direction]}至少 ${c.minChange} 位`};
  }
  if(!['up','down','flat'].includes(data.trend))return {truth:null,reason:'来源未提供可验证的排名趋势'};
  return {truth:data.trend===c.trend,reason:`来源趋势${HEAT_TRENDS[data.trend]}；要求${HEAT_TRENDS[c.trend]}`};
}
