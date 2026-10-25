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
  const symbol = SYMBOLS.find(s => s.code === r.symbol?.code && s.market === r.symbol?.market);
  if (!symbol) throw new AppError('请选择已核对代码与市场的标的');
  r.symbol = { code: symbol.code, market: symbol.market, name: symbol.name };
  if (!['demo', 'tencent', 'relay'].includes(r.provider)) throw new AppError('不支持的数据来源');
  if (!['all', 'any'].includes(r.logic)) throw new AppError('组合条件须为 all 或 any');
  if (!Array.isArray(r.conditions) || r.conditions.length < 1 || r.conditions.length > 8) throw new AppError('请配置 1–8 个条件');
  r.conditions = r.conditions.map((c, i) => {
    const id = `c${i + 1}`;
    if (c.type === 'price' || c.type === 'heat') {
      if (!['lt', 'lte', 'gt', 'gte'].includes(c.op)) throw new AppError('比较方式无效');
      return { id, type: c.type, op: c.op, value: number(c.value, 0, 1e9, '阈值') };
    }
    if (c.type === 'event') return { id, type: 'event', keyword: text(c.keyword, 40, '事件关键词'), lookbackMinutes: number(c.lookbackMinutes, 1, 10080, '事件回看分钟') };
    if (c.type === 'calendar') {
      if (typeof c.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:\+08:00|Z)$/.test(c.at) || !Number.isFinite(Date.parse(c.at))) throw new AppError('日历时间须包含日期、时刻与时区');
      const date = c.at.slice(0, 10);
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || Number(c.at.slice(11, 13)) > 23) throw new AppError('日历日期或时刻不存在');
      return { id, type: 'calendar', at: new Date(c.at).toISOString(), label: text(c.label, 60, '日历事项') };
    }
    throw new AppError('不支持的条件类型');
  });
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
  if (c.type === 'price') return `最新价 ${OPS[c.op]} ${c.value} 元`;
  if (c.type === 'heat') return `热度指数 ${OPS[c.op]} ${c.value}`;
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
    if (c.type === 'calendar') {
      const truth = now >= Date.parse(c.at);
      return { ...base, truth, reason: truth ? '已到指定提醒时间' : '尚未到指定提醒时间', evidence: { source: '用户确认的日历规则', at: c.at, checkedAt: new Date(now).toISOString() }, identities: truth ? [`calendar:${c.at}`] : [] };
    }
    const data = snapshot[c.type];
    if (!data || data.error) return { ...base, reason: data?.error || '来源未提供该类数据', evidence: data || null };
    if (typeof data.source !== 'string' || !data.source.trim()) return { ...base, reason: '缺少可追溯的数据来源', evidence: data };
    const age = (now - Date.parse(data.observedAt)) / 1000;
    if (!Number.isFinite(age) || age < -60 || age > rule.maxAgeSeconds) return { ...base, reason: `数据时间无效或已过期（有效期 ${rule.maxAgeSeconds} 秒）`, evidence: data };
    if (data.conflict) return { ...base, reason: '来源数据存在冲突，本次不采用任一冲突值', evidence: data };
    if (c.type === 'event') {
      if (!Array.isArray(data.items) || data.items.some(e => typeof e.id !== 'string' || !e.id || typeof e.title !== 'string' || !Number.isFinite(Date.parse(e.publishedAt)))) return { ...base, reason: '事件字段缺失或发布时间无效', evidence: data };
      const matches = data.items.filter(e => e.title.includes(c.keyword) && Date.parse(e.publishedAt) <= now && now - Date.parse(e.publishedAt) <= c.lookbackMinutes * 60000);
      return { ...base, truth: matches.length > 0, reason: `匹配到 ${matches.length} 条公告`, evidence: data, identities: matches.map(e => `event:${e.id}`) };
    }
    if (typeof data.value !== 'number' || !Number.isFinite(data.value) || data.value < 0) return { ...base, reason: '数值缺失或无效', evidence: data };
    const v = data.value;
    const truth = { lt: v < c.value, lte: v <= c.value, gt: v > c.value, gte: v >= c.value }[c.op];
    return { ...base, truth, reason: `实际值 ${v}；要求 ${OPS[c.op]} ${c.value}`, evidence: data };
  });
  return { truth: combine(results.map(r => r.truth), rule.logic), results, degraded: results.some(r => r.truth === null) };
}
