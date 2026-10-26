import {heatLabel,evaluateHeat,isLegacyHeat} from './heat.mjs';
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const SYMBOLS = [
  { code: '600519', market: 'SH', name: '贵州茅台', aliases: ['茅台'] },
  { code: '300750', market: 'SZ', name: '宁德时代', aliases: ['宁德'] },
  { code: '000001', market: 'SZ', name: '平安银行', aliases: [] },
  { code: '600036', market: 'SH', name: '招商银行', aliases: ['招行'] },
  { code: '000300', market: 'SH', name: '沪深300', aliases: ['沪深三百'] },
];
export function resolveSymbol(text) {
  const qualified=text.match(/\b(SH|SZ)(\d{6})\b|\b(\d{6})\.(SH|SZ)\b/i);
  if(qualified){const market=(qualified[1]||qualified[4]).toUpperCase(),code=qualified[2]||qualified[3];return SYMBOLS.find(s=>s.code===code&&s.market===market)||null;}
  if(/(?<!\d)000001(?!\d)/.test(text)&&!text.includes('平安银行'))return null;
  const matches = SYMBOLS.filter(s => [s.name, ...s.aliases].some(n => text.includes(n)) || new RegExp(`(?<!\\d)${s.code}(?!\\d)`).test(text));
  return matches.length === 1 ? matches[0] : null;
}
const number = (v, min, max, label) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new AppError(`${label}须在 ${min}–${max} 之间`);
  return v;
};
const text = (v, max, label) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new AppError(`${label}不能为空且不得超过 ${max} 字`);
  return v.trim();
};
export function validateRule(input) {
  if (!input || typeof input !== 'object') throw new AppError('规则格式错误');
  const r = structuredClone(input);
  const symbol=r.symbol;
  if(!symbol||!['SH','SZ','GLOBAL'].includes(symbol.market)||typeof symbol.name!=='string'||!symbol.name.trim()||symbol.name.length>120)throw new AppError('请选择已核实名称、代码与市场的标的');
  if(typeof symbol.code!=='string'||(symbol.market==='GLOBAL'?!/^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,24}$/.test(symbol.code):!/^\d{6}$/.test(symbol.code)))throw new AppError('标的代码格式无效');
  r.symbol={code:symbol.code,market:symbol.market,name:symbol.name,...(symbol.assetType?{assetType:symbol.assetType}:{})};
  if(!['demo','tencent','fuyao','yahoo','ifind'].includes(r.provider))throw new AppError('该数据来源已移除；请选择扶摇或其他已接入来源');
  if(r.provider==='yahoo'&&symbol.market!=='GLOBAL'||['fuyao','tencent','ifind'].includes(r.provider)&&symbol.market==='GLOBAL')throw new AppError('标的市场与数据来源不匹配');
  if (!['all', 'any'].includes(r.logic)) throw new AppError('组合条件须为 all 或 any');
  if (!Array.isArray(r.conditions) || r.conditions.length < 1 || r.conditions.length > 8) throw new AppError('请配置 1–8 个条件');
  r.conditions = r.conditions.map((c, i) => {
    const id = `c${i + 1}`;
    if(c.type==='heat'){
      if(isLegacyHeat(c))throw new AppError('原始热度数值阈值已取消，请改为上榜、排名、排名变化或趋势条件');
      if(!['listed','rank','rank_change','trend'].includes(c.mode)||!['day','hour'].includes(c.period))throw new AppError('请选择热榜触发方式与周期');
      const item={id,type:'heat',mode:c.mode,period:c.period};
      if(c.mode==='rank'){if(!Number.isInteger(c.topN))throw new AppError('排名须为整数');item.topN=number(c.topN,1,100,'前N名');}
      if(c.mode==='rank_change'){if(!['up','down'].includes(c.direction)||!Number.isInteger(c.minChange))throw new AppError('请选择排名变化方向与整数位数');item.direction=c.direction;item.minChange=number(c.minChange,1,1000000,'排名变化位数');}
      if(c.mode==='trend'){if(!['up','down','flat'].includes(c.trend))throw new AppError('请选择上升、下降或持平趋势');item.trend=c.trend;}
      return item;
    }
    if (c.type === 'price') {
      if (!['lt', 'lte', 'gt', 'gte'].includes(c.op)) throw new AppError('比较方式无效');
      return { id, type: c.type, op: c.op, value: number(c.value, 0, 1e9, '阈值') };
    }
    if(c.type==='drawdown')return {id,type:'drawdown',op:'gte',value:number(c.value,0.01,100,'回撤百分比'),lookbackDays:number(c.lookbackDays,7,3650,'回看自然日')};
    if (c.type === 'event') return { id, type: 'event', keyword: text(c.keyword, 40, '事件关键词'), lookbackMinutes: number(c.lookbackMinutes, 1, 10080, '事件回看分钟') };
    if (c.type === 'calendar') {
      if (typeof c.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:\+08:00|Z)$/.test(c.at) || !Number.isFinite(Date.parse(c.at))) throw new AppError('日历时间须包含日期、时刻与时区');
      const date = c.at.slice(0, 10);
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || Number(c.at.slice(11, 13)) > 23) throw new AppError('日历日期或时刻不存在');
      return { id, type: 'calendar', at: new Date(c.at).toISOString(), label: text(c.label, 60, '日历事项') };
    }
    throw new AppError('不支持的条件类型');
  });
  if(r.conditions.some(c=>c.type==='drawdown')&&!['yahoo','demo'].includes(r.provider))throw new AppError('回撤条件当前支持 Yahoo 实验行情或演示数据');
  if(r.provider==='yahoo'&&r.conditions.some(c=>!['price','drawdown','calendar'].includes(c.type)))throw new AppError('Yahoo 当前支持价格、回撤与日历条件');
  if(r.conditions.some(c=>c.type==='heat')&&(!['demo','fuyao','ifind'].includes(r.provider)||r.symbol.market==='GLOBAL'||r.symbol.assetType==='a-share-index'||r.symbol.market==='SH'&&r.symbol.code==='000300'))throw new AppError('同花顺热榜仅支持A股股票，请选择扶摇或iFinD来源的A股股票');
  if(r.provider==='fuyao'&&r.conditions.some(c=>!['price','calendar','heat'].includes(c.type)))throw new AppError('扶摇支持价格、交易日历与同花顺热榜；公告请使用iFinD MCP');
  if (!['always', 'trading'].includes(r.schedule?.mode)) throw new AppError('调度模式无效');
  number(r.schedule.intervalSeconds, 30, 86400, '检查间隔秒');
  number(r.cooldownSeconds, 0, 604800, '冷却秒');
  number(r.maxAgeSeconds, 5, 86400, '数据有效期秒');
  return { symbol: r.symbol, provider: r.provider, logic: r.logic, conditions: r.conditions, schedule: { mode: r.schedule.mode, intervalSeconds: r.schedule.intervalSeconds }, cooldownSeconds: r.cooldownSeconds, maxAgeSeconds: r.maxAgeSeconds };
}
export function defaultRule(symbol = SYMBOLS[0]) {
  return { symbol: { ...symbol }, provider: 'demo', logic: 'all', conditions: [{ id: 'c1', type: 'price', op: 'lt', value: 1400 }], schedule: { mode: 'always', intervalSeconds: 300 }, cooldownSeconds: 1800, maxAgeSeconds: 300 };
}
export const OPS = { lt: '<', lte: '≤', gt: '>', gte: '≥' };
export function conditionLabel(c) {
  if(c.type==='drawdown')return `较近 ${c.lookbackDays} 个自然日日线最高价回撤 ≥ ${c.value}%`;
  if (c.type === 'price') return `最新价 ${OPS[c.op]} ${c.value} 元`;
  if (c.type === 'heat') return heatLabel(c);
  if (c.type === 'event') return `近 ${c.lookbackMinutes} 分钟公告含「${c.keyword}」`;
  return `${c.label} · ${c.at}`;
}
export function summarize(r) { return r.conditions.map(conditionLabel).join(r.logic === 'all' ? ' 且 ' : ' 或 '); }
export function marketSession(now) {
  const d = new Date(now + 8 * 3600000);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && ((mins >= 570 && mins < 690) || (mins >= 780 && mins < 900));
}
export function combine(results, logic) {
  if (logic === 'all') return results.includes(false) ? false : results.includes(null) ? null : true;
  return results.includes(true) ? true : results.includes(null) ? null : false;
}
export function evaluate(rule, snapshot, now) {
  const results = rule.conditions.map(c => {
    const base = { id: c.id, condition: conditionLabel(c), type: c.type, truth: null, reason: '', evidence: null, identities: [] };
    if(isLegacyHeat(c))return {...base,reason:'旧版原始热度数值比较已停用，请编辑并确认热榜规则'};
    if (c.type === 'calendar') {
      const truth = now >= Date.parse(c.at);
      return { ...base, truth, reason: truth ? '已到指定提醒时间' : '尚未到指定提醒时间', evidence: { source: '用户确认的日历规则', at: c.at, checkedAt: new Date(now).toISOString() }, identities: truth ? [`calendar:${c.at}`] : [] };
    }
    const data = c.type==='heat'?(snapshot.heatByPeriod?.[c.period]||snapshot.heat):c.type==='drawdown'?snapshot.drawdowns?.[c.id]:c.type==='event'?(snapshot.events?.[c.id]||snapshot.event):snapshot[c.type];
    if (!data || data.error) return { ...base, reason: data?.error || '来源未提供该类数据', evidence: data || null };
    if (typeof data.source !== 'string' || !data.source.trim()) return { ...base, reason: '缺少可追溯的数据来源', evidence: data };
    const age = (now - Date.parse(data.observedAt)) / 1000;
    if (!Number.isFinite(age) || age < -60 || age > rule.maxAgeSeconds) return { ...base, reason: `数据时间无效或已过期（有效期 ${rule.maxAgeSeconds} 秒）`, evidence: data };
    if (data.conflict) return { ...base, reason: '来源数据存在冲突，本次不采用任一冲突值', evidence: data };
    if(c.type==='heat')return {...base,...evaluateHeat(c,data),evidence:data};
    if (c.type === 'event') {
      if (!Array.isArray(data.items) || data.items.some(e => typeof e.id !== 'string' || !e.id || typeof e.title !== 'string' || !Number.isFinite(Date.parse(e.publishedAt)))) return { ...base, reason: '事件字段缺失或发布时间无效', evidence: data };
      const relevant=data.items.filter(e=>(data.matchScope==='title-and-excerpt'?`${e.title}\n${e.excerpt||''}`:e.title).includes(c.keyword));
      const cutoff=now-c.lookbackMinutes*60000;
      const matches=relevant.filter(e=>Date.parse(e.publishedAt)<=now&&Date.parse(e.publishedAt)>=cutoff);
      const ambiguous=relevant.some(e=>e.timePrecision==='day'&&Date.parse(e.publishedAt)<cutoff&&Date.parse(e.publishedAt)+86400000>cutoff&&Date.parse(e.publishedAt)<=now);
      if(!matches.length&&(ambiguous||data.coverage==='semantic'))return {...base,reason:ambiguous?'公告仅提供日期，无法确认是否落在分钟回看窗口内':'本次语义检索未确认命中；检索不保证完整公告覆盖，不能断言不存在事件',evidence:data};
      return { ...base, truth: matches.length > 0, reason: `匹配到 ${matches.length} 条公告`, evidence: data, identities: matches.map(e => `event:${e.id}`) };
    }
    if (typeof data.value !== 'number' || !Number.isFinite(data.value) || data.value < 0) return { ...base, reason: '数值缺失或无效', evidence: data };
    const v = data.value;
    const truth = { lt: v < c.value, lte: v <= c.value, gt: v > c.value, gte: v >= c.value }[c.op];
    return { ...base, truth, reason: `实际值 ${v}；要求 ${OPS[c.op]} ${c.value}`, evidence: data };
  });
  return { truth: combine(results.map(r => r.truth), rule.logic), results, degraded: results.some(r => r.truth === null) };
}
