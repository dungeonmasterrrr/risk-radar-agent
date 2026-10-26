import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../core/api.mjs';
import {defaultRule} from '../core/rules.mjs';

import {openLocalDb} from '../scripts/local-db.mjs';

test('扶摇A股在行情429时仍保存并列出，运行失败保留任务且不发提醒',async()=>{
  const db=openLocalDb(':memory:'),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('',{status:429});};
  const request=(path,body)=>new Request(`https://radar.test/api/radar/${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'save-availability',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{
    const rule=defaultRule();rule.provider='fuyao';
    const created=await handleApi(request('tasks',{rule,title:'茅台价格提醒',confirmed:true}),db,{FUYAO_API_KEY:'test'});
    assert.equal(created.status,201);assert.equal(calls,0);
    const task=(await created.json()).task;
    const run=await (await handleApi(request(`tasks/${task.id}/run`,{}),db,{FUYAO_API_KEY:'test'})).json();
    assert.equal(run.run.result,'unknown');assert.match(run.run.explanation,/受限/);
    const list=await (await handleApi(request('tasks'),db)).json();
    assert.equal(list.tasks.length,1);assert.equal(list.tasks[0].id,task.id);assert.equal(list.tasks[0].state.health,'degraded');
    assert.equal((await(await handleApi(request('notifications'),db)).json()).notifications.length,0);
  }finally{globalThis.fetch=original;db.close();}
});

test('已知标的身份不允许绕过条件和来源校验',async()=>{
  const db=openLocalDb(':memory:');
  try{const rule=defaultRule();rule.provider='yahoo';const response=await handleApi(new Request('https://radar.test/api/radar/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'错来源',rule,confirmed:true})}),db);assert.equal(response.status,400);assert.match((await response.json()).error,/不匹配/);}finally{db.close();}
});
