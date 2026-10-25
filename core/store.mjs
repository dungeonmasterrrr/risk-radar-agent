import { AppError, validateRule, summarize } from './rules.mjs';
const uid = () => crypto.randomUUID();
export const initialState = () => ({ lastTruth: false, episode: 0, episodeDelivered: false, seen: [], lastNotifiedAt: null, failures: 0, health: 'pending', lastResult: null, lastRunAt: null });
export function decodeTask(row) { return row ? { ...row, rule: JSON.parse(row.rule_json), state: JSON.parse(row.state_json), rule_json: undefined, state_json: undefined, summary: summarize(JSON.parse(row.rule_json)) } : null; }
export class Store {
  constructor(db) { this.db = db; }
  query(sql, ...args) { return this.db.prepare(sql).bind(...args); }
  async all(sql, ...args) { return (await this.query(sql, ...args).all()).results; }
  async task(owner, id) {
    const task = decodeTask(await this.query('SELECT * FROM tasks WHERE id=? AND owner=?', id, owner).first());
    if (!task) throw new AppError('任务不存在或无访问权限', 404);
    return task;
  }
  async list(owner) { return (await this.all('SELECT * FROM tasks WHERE owner=? ORDER BY created_at DESC', owner)).map(decodeTask); }
  async create(owner, input, now = Date.now()) {
    if (input.confirmed !== true) throw new AppError('请检查规则并明确确认后启用');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 80) throw new AppError('任务名须为 1–80 字');
    if ((await this.list(owner)).length >= 50) throw new AppError('演示空间最多保留 50 个任务', 429);
    const rule = validateRule(input.rule); const id = uid();
    await this.db.batch([
      this.query('INSERT INTO tasks (id,owner,title,status,rule_json,version,state_json,scenario,revision,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id,owner,input.title.trim(),'active',JSON.stringify(rule),1,JSON.stringify(initialState()),'normal',0,now,now,now),
      this.query('INSERT INTO versions (id,task_id,owner,version,rule_json,created_at,note) VALUES (?,?,?,?,?,?,?)',uid(),id,owner,1,JSON.stringify(rule),now,'用户检查并确认启用'),
      this.query('INSERT INTO audit (id,task_id,owner,at,action,detail) VALUES (?,?,?,?,?,?)',uid(),id,owner,now,'created','确认规则并启用 v1'),
    ]);
    return this.task(owner,id);
  }
  async edit(owner, id, input, now = Date.now()) {
    const t = await this.task(owner,id);
    if (t.lease_until > now) throw new AppError('任务正在检查，请稍后修改',409);
    if (input.confirmed !== true) throw new AppError('修改后的规则需要重新确认');
    if (input.version !== t.version) throw new AppError('规则已被修改，请刷新后重试',409);
    const rule = validateRule(input.rule); const version=t.version+1;
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length>80) throw new AppError('任务名须为 1–80 字');
    const marker = uid();
    await this.db.batch([
      this.query('UPDATE tasks SET title=?,rule_json=?,version=?,state_json=?,revision=revision+1,next_run_at=?,updated_at=?,lease_token=?,lease_until=NULL WHERE id=? AND owner=? AND revision=? AND (lease_until IS NULL OR lease_until<=?)',input.title.trim(),JSON.stringify(rule),version,JSON.stringify(initialState()),now,now,marker,id,owner,t.revision,now),
      this.query('INSERT INTO versions (id,task_id,owner,version,rule_json,created_at,note) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND lease_token=?)',uid(),id,owner,version,JSON.stringify(rule),now,'用户重新确认；新版本重置命中、去重与冷却状态',id,marker),
      this.query('INSERT INTO audit (id,task_id,owner,at,action,detail) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND lease_token=?)',uid(),id,owner,now,'edited',`规则更新为 v${version}；历史记录保留`,id,marker),
    ]);
    const updated=await this.task(owner,id);
    if(updated.lease_token!==marker) throw new AppError('并发修改冲突，请刷新后重试',409);
    return updated;
  }
  async action(owner,id,action,value,now=Date.now()) {
    const t=await this.task(owner,id);
    if(t.lease_until>now) throw new AppError('任务正在检查，请稍后操作',409);
    let sql,args,detail;
    if(action==='pause'||action==='resume') { sql='status=?,next_run_at=?';args=[action==='pause'?'paused':'active',now];detail=action==='pause'?'暂停后台检查':'恢复检查；保留去重和冷却状态'; }
    else if(action==='scenario') {
      if(t.rule.provider!=='demo') throw new AppError('仅演示数据任务允许注入场景');
      if(!['normal','match','clear','stale','conflict','failure','missing'].includes(value)) throw new AppError('场景无效');
      sql='scenario=?,next_run_at=?';args=[value,now];detail=`设置演示场景：${value}`;
    } else throw new AppError('操作无效');
    const marker=uid();
    await this.db.batch([
      this.query(`UPDATE tasks SET ${sql},revision=revision+1,updated_at=?,lease_token=?,lease_until=NULL WHERE id=? AND owner=? AND revision=? AND (lease_until IS NULL OR lease_until<=?)`,...args,now,marker,id,owner,t.revision,now),
      this.query('INSERT INTO audit (id,task_id,owner,at,action,detail) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND lease_token=?)',uid(),id,owner,now,action,detail,id,marker),
    ]);
    const updated=await this.task(owner,id);
    if(updated.lease_token!==marker) throw new AppError('并发操作冲突，请重试',409);
    return updated;
  }
  async detail(owner,id) {
    const task=await this.task(owner,id);
    const [runs,versions,audit]=await Promise.all([
      this.all('SELECT * FROM runs WHERE task_id=? AND owner=? ORDER BY at DESC,rowid DESC LIMIT 100',id,owner),
      this.all('SELECT * FROM versions WHERE task_id=? AND owner=? ORDER BY version DESC',id,owner),
      this.all('SELECT * FROM audit WHERE task_id=? AND owner=? ORDER BY at DESC,rowid DESC LIMIT 100',id,owner),
    ]);
    return {task,runs:runs.map(r=>({...r,evidence:JSON.parse(r.evidence_json),evidence_json:undefined})),versions:versions.map(v=>({...v,rule:JSON.parse(v.rule_json),rule_json:undefined})),audit};
  }
  notifications(owner) { return this.all('SELECT * FROM notifications WHERE owner=? ORDER BY at DESC,rowid DESC LIMIT 100',owner); }
  async markRead(owner,id) { await this.query('UPDATE notifications SET is_read=1 WHERE id=? AND owner=?',id,owner).run(); }
  async heartbeat(now,source) { await this.query('INSERT INTO system (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','scheduler',JSON.stringify({at:now,source})).run(); }
  async heartbeatStatus() { const row=await this.query('SELECT value FROM system WHERE key=?','scheduler').first();return row?JSON.parse(row.value):null; }
}
