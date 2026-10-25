import { AppError } from './rules.mjs';
export const SCENARIOS = ['normal', 'match', 'clear', 'stale', 'conflict', 'failure', 'missing'];
export async function fetchJson(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new AppError(`数据接口返回 HTTP ${response.status}`, 502);
  return response.json();
}
export function demoSnapshot(rule, scenario, now) {
  const base = { source: '内置可复现演示数据', simulated: true, observedAt: new Date(now - (scenario === 'stale' ? 86400000 : 2000)).toISOString(), fetchedAt: new Date(now).toISOString() };
  if (scenario === 'failure') return { price: { ...base, error: '模拟接口超时：等待退避重试' }, event: { ...base, error: '模拟接口超时' }, heat: { ...base, error: '模拟接口超时' }, tradingDay: true };
  const priceRule = rule.conditions.find(c => c.type === 'price');
  const heatRule = rule.conditions.find(c => c.type === 'heat');
  function value(c, fallback) {
    if (!c || !['match', 'clear'].includes(scenario)) return fallback;
    const below = c.op.startsWith('l');
    const delta = Math.max(c.value * .01, .01);
    return Math.max(0, Number((c.value + ((scenario === 'match') === below ? -delta : delta)).toFixed(4)));
  }
  const keyword = rule.conditions.find(c => c.type === 'event')?.keyword || '回购';
  return {
    price: { ...base, value: scenario === 'missing' ? null : value(priceRule, 1388), currency: 'CNY', conflict: scenario === 'conflict', alternatives: scenario === 'conflict' ? [1388, 1412] : undefined },
    heat: { ...base, value: value(heatRule, 72), metric: '演示热度指数（自定义 0–100）', conflict: scenario === 'conflict' },
    event: { ...base, items: scenario === 'clear' ? [] : [{ id: 'demo-announcement-001', title: `${rule.symbol.name}：关于${keyword}事项的演示公告`, publishedAt: new Date(now - 60000).toISOString(), url: null }], conflict: scenario === 'conflict' },
    tradingDay: true,
  };
}
export async function getSnapshot(rule, scenario, now, env = {}, fetcher = fetch) {
  if (rule.provider === 'demo') return demoSnapshot(rule, scenario, now);
  if (rule.conditions.every(c => c.type === 'calendar')) return {};
  if (rule.provider === 'relay') {
    if (!env.DATA_RELAY_URL) throw new AppError('尚未配置授权数据中继 DATA_RELAY_URL', 503);
    const url = new URL(env.DATA_RELAY_URL);
    if (url.protocol !== 'https:') throw new AppError('授权数据中继必须使用 HTTPS', 503);
    url.searchParams.set('code', rule.symbol.code); url.searchParams.set('market', rule.symbol.market);
    const result = await fetchJson(url, { headers: env.DATA_RELAY_TOKEN ? { Authorization: `Bearer ${env.DATA_RELAY_TOKEN}` } : {} }, fetcher);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new AppError('数据中继格式无效', 502);
    for (const k of ['price', 'heat', 'event']) if (result[k]) { result[k].fetchedAt = new Date(now).toISOString(); result[k].simulated = false; }
    return result;
  }
  const ticker = `${rule.symbol.market.toLowerCase()}${rule.symbol.code}`;
  const response = await fetcher(`https://qt.gtimg.cn/q=${ticker}`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'RiskRadar/1.0' } });
  if (!response.ok) throw new AppError(`公开行情接口 HTTP ${response.status}`, 502);
  const raw = new TextDecoder('gb18030').decode(await response.arrayBuffer());
  const fields = raw.match(/="([^"\r\n]+)"/)?.[1]?.split('~');
  if (!fields || fields[2] !== rule.symbol.code || !/^\d{14}$/.test(fields[30] || '') || !/^\d+(\.\d+)?$/.test(fields[3] || '')) throw new AppError('公开行情接口字段校验失败', 502);
  const t = fields[30];
  const observedAt = `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}+08:00`;
  return { price: { value: Number(fields[3]), currency: 'CNY', source: '腾讯公开行情（实验接入，无 SLA）', url: `https://qt.gtimg.cn/q=${ticker}`, observedAt, fetchedAt: new Date(now).toISOString(), simulated: false, rawFields: { code: fields[2], price: fields[3], timestamp: t } } };
}
