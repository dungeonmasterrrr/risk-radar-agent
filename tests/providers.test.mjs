import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshot } from '../core/providers.mjs';
import { defaultRule } from '../core/rules.mjs';
test('腾讯实验接口读取行情原始时间，不将抓取时间当数据时间',async()=>{const r=defaultRule();r.provider='tencent';const f=Array(40).fill('');f[2]='600519';f[3]='1335.00';f[30]='20261023161458';const out=await getSnapshot(r,'normal',Date.parse('2026-10-26T00:00Z'),{},async()=>new Response(`v_sh600519="${f.join('~')}";`));assert.equal(out.price.value,1335);assert.equal(out.price.observedAt,'2026-10-23T16:14:58+08:00');assert.equal(out.price.simulated,false);assert.equal(out.price.rawFields.timestamp,'20261023161458');});
test('公开行情错误状态和字段变化均不静默接受',async()=>{const r=defaultRule();r.provider='tencent';await assert.rejects(getSnapshot(r,'normal',Date.now(),{},async()=>new Response('',{status:429})),/429/);await assert.rejects(getSnapshot(r,'normal',Date.now(),{},async()=>new Response('unexpected')),/校验失败/);});
test('旧中继规则明确要求迁移，忽略旧中继配置且不发请求',async()=>{const r=defaultRule();r.provider='relay';await assert.rejects(getSnapshot(r,'normal',Date.now(),{DATA_RELAY_URL:'https://example.com'},async()=>{assert.fail('不应访问旧中继');}),/已移除/);});
