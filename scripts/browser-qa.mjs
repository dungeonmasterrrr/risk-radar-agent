import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_IMPORT || 'playwright');
const origin=process.env.RADAR_ORIGIN||'http://127.0.0.1:5173';
const out=new URL('../outputs/qa/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--disable-gpu']});
const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'zh-CN'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const checks=[];
async function step(name,fn){await fn();checks.push({name,passed:true});console.log(`PASS ${name}`);}
let cookie='',createdId;
try {
  await step('页面加载与隔离会话',async()=>{await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'每一次关注，都有回应.'}).waitFor();await page.getByRole('button',{name:'载入演示任务'}).click();await page.getByRole('button',{name:'茅台价格防线',exact:false}).first().waitFor();await page.screenshot({path:fileURLToPath(new URL('overview-desktop.png',out)),fullPage:true});});
  await step('自然语言生成、修改与明确确认',async()=>{await page.getByRole('button',{name:'创建监控',exact:true}).click();await page.getByLabel('你想关注什么？').fill('茅台价格低于1400元，每5分钟检查，冷却30分钟');await page.getByRole('button',{name:'生成规则草案'}).click();await page.getByText('检查并修改规则',{exact:true}).waitFor();await page.getByLabel('任务名称',{exact:true}).fill('浏览器验收任务');await page.getByLabel('通知冷却（秒）').fill('0');assert.equal(await page.getByRole('button',{name:'确认并启用'}).isDisabled(),true);await page.screenshot({path:fileURLToPath(new URL('rule-draft.png',out)),fullPage:true});await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认并启用'}).click();await page.getByRole('heading',{name:'浏览器验收任务',exact:true}).waitFor();});
  await step('立即检查与持续命中去重',async()=>{await page.getByRole('button',{name:'立即检查',exact:true}).click();await page.getByText('条件满足，已生成站内提醒：',{exact:false}).first().waitFor();await page.getByRole('button',{name:'立即检查',exact:true}).click();await page.getByText('条件满足，已去重：',{exact:false}).first().waitFor();});
  await step('异常注入、解释与原始证据',async()=>{await page.getByLabel('演示场景').selectOption('stale');await page.getByRole('button',{name:'立即检查',exact:true}).click();await page.getByRole('heading',{name:'无法判断',exact:true}).waitFor();await page.locator('.run-record').first().locator('summary').first().click();await page.getByText('查看原始快照与追溯标识').first().click();await page.screenshot({path:fileURLToPath(new URL('stale-evidence.png',out)),fullPage:true});assert.ok((await page.locator('.run-evidence').first().textContent()).includes('observedAt'));});
  await step('规则新版本及历史记录',async()=>{await page.getByRole('button',{name:'编辑规则'}).click();await page.getByLabel('条件阈值').fill('1500');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认新版本'}).click();await page.getByRole('button',{name:/规则版本/}).click();await page.locator('.version-row').nth(1).waitFor();assert.equal(await page.locator('.version-row').count(),2);await page.screenshot({path:fileURLToPath(new URL('versions.png',out)),fullPage:true});});
  await step('暂停与恢复',async()=>{await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'恢复',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'立即检查',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'恢复',exact:true}).click();await page.getByRole('button',{name:'暂停',exact:true}).waitFor();});
  await step('提醒中心与已读操作',async()=>{await page.getByRole('button',{name:'提醒中心',exact:true}).click();await page.getByRole('heading',{name:'值得你留意的变化.'}).waitFor();const buttons=page.getByRole('button',{name:'标为已读'});if(await buttons.count())await buttons.first().click();await page.screenshot({path:fileURLToPath(new URL('notifications.png',out)),fullPage:true});});
  await step('手机窄屏布局与任务搜索',async()=>{await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'监控总览',exact:true}).click();await page.getByLabel('搜索任务或标的').fill('浏览器验收任务');assert.equal(await page.locator('tbody tr').count(),1);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);await page.screenshot({path:fileURLToPath(new URL('overview-mobile.png',out)),fullPage:true});});
  cookie=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
  const list=await (await fetch(`${origin}/api/radar/tasks`,{headers:{cookie}})).json();
  createdId=list.tasks.find(t=>t.title==='浏览器验收任务').id;
  const scenario=await fetch(`${origin}/api/radar/tasks/${createdId}/action`,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'scenario',value:'normal'})});assert.equal(scenario.status,200);
  assert.deepEqual(errors,[]);await browser.close();
  await step('关闭浏览器后由独立进程执行并保存结果',async()=>{
    const vars=await readFile(new URL('../.dev.vars',import.meta.url),'utf8');const secret=vars.match(/^SCHEDULER_SECRET=(.+)$/m)?.[1].trim();assert.ok(secret);
    const result=spawnSync(process.execPath,['scripts/scheduler.mjs','--once'],{cwd:new URL('../',import.meta.url),env:{...process.env,RADAR_ORIGIN:origin,SCHEDULER_SECRET:secret},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);const d=await (await fetch(`${origin}/api/radar/tasks/${createdId}`,{headers:{cookie}})).json();assert.equal(d.runs[0].evidence.scheduled,true);assert.equal(d.runs[0].version,2);checks.push({name:'后台执行证据',runId:d.runs[0].id,at:d.runs[0].at,decision:d.runs[0].decision});
  });
  await writeFile(new URL('browser-results.json',out),JSON.stringify({at:new Date().toISOString(),origin,checks,pageErrors:errors},null,2));
  console.log(JSON.stringify({passed:checks.length,pageErrors:errors.length}));
} catch(e){await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:true}).catch(()=>{});await browser.close().catch(()=>{});throw e;}
