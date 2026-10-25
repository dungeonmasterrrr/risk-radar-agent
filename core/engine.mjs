import { AppError, evaluate, marketSession, summarize } from './rules.mjs';
import { getSnapshot } from './providers.mjs';
import { initialState } from './store.mjs';
export function decide(previous, evaluation, rule, now) {
  const state={...initialState(),...structuredClone(previous)};
  state.health=evaluation.degraded?'degraded':'healthy';state.lastRunAt=now;
  if(evaluation.truth===null) { state.lastResult='unknown';state.failures++;return {state,result:'unknown',decision:'unavailable',explanation:'本次无法判断：'+evaluation.results.filter(r=>r.truth===null).map(r=>r.reason).join('；')}; }
  state.failures=evaluation.degraded?state.failures+1:0;
  if(!evaluation.truth) {state.lastTruth=false;state.episodeDelivered=false;state.lastResult='not_met';return {state,result:'not_met',decision:'none',explanation:'条件未满足：'+evaluation.results.filter(r=>r.truth!==true).map(r=>r.reason).join('；')};}
  if(!state.lastTruth) {state.episode++;state.episodeDelivered=false;}
  state.lastTruth=true;state.lastResult='matched';
  const identities=[...new Set(evaluation.results.filter(r=>r.truth===true).flatMap(r=>r.identities))];
  const unseen=identities.filter(id=>!state.seen.includes(id));
  if(identities.length?!unseen.length:state.episodeDelivered) return {state,result:'matched',decision:'deduplicated',explanation:'条件满足，已去重：同一事件或同一轮持续命中已通知；条件恢复后可进入新一轮'};
  if(state.lastNotifiedAt!==null && now-state.lastNotifiedAt<rule.cooldownSeconds*1000) return {state,result:'matched',decision:'cooldown',explanation:`条件满足，通知被冷却策略抑制；剩余 ${Math.ceil((rule.cooldownSeconds*1000-(now-state.lastNotifiedAt))/1000)} 秒；命中记录已保留`};
  if(state.seen.length+unseen.length>5000) {state.health='degraded';return {state,result:'matched',decision:'unavailable',explanation:'事件去重容量已达上限；为避免重复提醒，本次保留命中但不通知，请创建新规则版本'};}
  state.lastNotifiedAt=now;state.episodeDelivered=true;state.seen.push(...unseen);
  return {state,result:'matched',decision:'notified',dedupKey:identities.length?`ids:${unseen.sort().join('|')}`:`episode:${state.episode}`,explanation:'条件满足，已生成站内提醒：'+evaluation.results.filter(r=>r.truth===true).map(r=>r.reason).join('；')};
}
export async function runTask(store,owner,id,{now=Date.now(),key=crypto.randomUUID(),env={},fetcher=fetch,scheduled=false}={}) {
  if(typeof key!=='string'||key.length>100||!key.length) throw new AppError('检查请求标识无效');
  const before=await store.task(owner,id);
  const existing=await store.query('SELECT * FROM runs WHERE task_id=? AND version=? AND request_key=?',id,before.version,key).first();
  if(existing) return {run:{...existing,evidence:JSON.parse(existing.evidence_json),evidence_json:undefined},replayed:true};
  if(before.status!=='active') throw new AppError('任务已暂停，请先恢复',409);
  const token=crypto.randomUUID();
  const claimed=await store.query('UPDATE tasks SET lease_until=?,lease_token=?,revision=revision+1 WHERE id=? AND owner=? AND status=? AND (lease_until IS NULL OR lease_until<=?) AND revision=? RETURNING *',now+60000,token,id,owner,'active',now,before.revision).first();
  if(!claimed) throw new AppError('任务正在执行或已变更，请稍后重试',409);
  const rule=JSON.parse(claimed.rule_json);const state=JSON.parse(claimed.state_json);
  let snapshot={},evaluation,outcome;
  try {
    if(rule.schedule.mode==='trading'&&!marketSession(now)) {
      outcome={state:{...state,health:'healthy',lastRunAt:now,lastResult:'skipped'},result:'skipped',decision:'outside_session',explanation:'当前不在 A 股工作日连续交易时段，跳过条件计算；工作日判断不替代官方交易日历'};
    } else {
      try { snapshot=await getSnapshot(rule,claimed.scenario,now,env,fetcher); }
      catch(e) {snapshot={price:{error:e.message},event:{error:e.message},heat:{error:e.message}};}
      if(rule.schedule.mode==='trading'&&rule.provider!=='demo'&&typeof snapshot.tradingDay!=='boolean') {
        evaluation={truth:null,degraded:true,results:[{truth:null,reason:'缺少授权交易日历，无法确认是否为交易日；需配置数据中继',evidence:null}]};
      } else if(rule.schedule.mode==='trading'&&snapshot.tradingDay===false) {
        outcome={state:{...state,health:'healthy',lastRunAt:now,lastResult:'skipped'},result:'skipped',decision:'non_trading_day',explanation:'授权交易日历显示为非交易日，跳过检查'};
      } else evaluation=evaluate(rule,snapshot,now);
      if(!outcome) outcome=decide(state,evaluation,rule,now);
    }
    const interval=outcome.state.failures?Math.min(900,rule.schedule.intervalSeconds*2**Math.min(outcome.state.failures,5)):rule.schedule.intervalSeconds;
    const run={id:crypto.randomUUID(),task_id:id,owner,version:claimed.version,at:now,result:outcome.result,decision:outcome.decision,explanation:outcome.explanation,evidence:{simulated:rule.provider==='demo',scenario:rule.provider==='demo'?claimed.scenario:null,scheduled,logic:rule.logic,checks:evaluation?.results||[],snapshot,ruleSummary:summarize(rule)},request_key:key};
    const guard='EXISTS(SELECT 1 FROM tasks WHERE id=? AND lease_token=? AND version=? AND status=?)';
    const args=[id,token,claimed.version,'active'];
    const statements=[store.query(`INSERT INTO runs (id,task_id,owner,version,at,result,decision,explanation,evidence_json,request_key) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,run.id,id,owner,run.version,now,run.result,run.decision,run.explanation,JSON.stringify(run.evidence),key,...args)];
    if(outcome.decision==='notified') statements.push(store.query(`INSERT INTO notifications (id,task_id,owner,run_id,at,message,is_read,dedup_key) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,crypto.randomUUID(),id,owner,run.id,now,`${claimed.title}：${run.explanation}`,0,`${claimed.version}:${outcome.dedupKey}`,...args));
    statements.push(store.query('UPDATE tasks SET state_json=?,next_run_at=?,lease_until=NULL,lease_token=NULL,revision=revision+1,updated_at=? WHERE id=? AND lease_token=? AND version=?',JSON.stringify(outcome.state),now+interval*1000,now,id,token,claimed.version));
    await store.db.batch(statements);
    const saved=await store.query('SELECT id FROM runs WHERE id=?',run.id).first();
    if(!saved) throw new AppError('执行期间任务版本或租约已变更，结果未提交',409);
    return {run};
  } catch(e) {
    await store.query('UPDATE tasks SET lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?',id,token).run();
    throw e;
  }
}
export async function runDue(store,env={},now=Date.now(),fetcher=fetch,source='scheduler') {
  await store.heartbeat(now,source);
  const due=await store.all('SELECT id,owner,next_run_at FROM tasks WHERE status=? AND next_run_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY next_run_at LIMIT 12','active',now,now);
  const results=[];
  for(let offset=0;offset<due.length;offset+=4) {
    const batch=await Promise.all(due.slice(offset,offset+4).map(async t=>{
      try {const r=await runTask(store,t.owner,t.id,{now,key:`due:${t.next_run_at}`,env,fetcher,scheduled:true});return {id:t.id,result:r.run.result};}
      catch(e) {return {id:t.id,error:e instanceof AppError?e.message:'执行失败，等待下一轮重试'};}
    }));
    results.push(...batch);
  }
  return {checked:results.length,results};
}
