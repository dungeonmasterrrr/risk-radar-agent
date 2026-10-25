import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(), status: text('status').notNull(),
  rule: text('rule_json').notNull(), version: integer('version').notNull(), state: text('state_json').notNull(),
  scenario: text('scenario').notNull(), revision: integer('revision').notNull().default(0), nextRunAt: integer('next_run_at').notNull(),
  leaseUntil: integer('lease_until'), leaseToken: text('lease_token'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [index('tasks_owner_idx').on(t.owner), index('tasks_due_idx').on(t.status, t.nextRunAt)]);
export const versions = sqliteTable('versions', {
  id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }), owner: text('owner').notNull(),
  version: integer('version').notNull(), rule: text('rule_json').notNull(), createdAt: integer('created_at').notNull(), note: text('note').notNull(),
}, t => [uniqueIndex('versions_unique').on(t.taskId, t.version)]);
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }), owner: text('owner').notNull(),
  version: integer('version').notNull(), at: integer('at').notNull(), result: text('result').notNull(), decision: text('decision').notNull(),
  explanation: text('explanation').notNull(), evidence: text('evidence_json').notNull(), requestKey: text('request_key').notNull(),
}, t => [uniqueIndex('runs_unique').on(t.taskId, t.version, t.requestKey), index('runs_task_idx').on(t.taskId, t.at)]);
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }), owner: text('owner').notNull(),
  runId: text('run_id').notNull().references(() => runs.id), at: integer('at').notNull(), message: text('message').notNull(),
  read: integer('is_read').notNull().default(0), dedupKey: text('dedup_key').notNull(),
}, t => [uniqueIndex('notifications_unique').on(t.taskId, t.dedupKey)]);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }), owner: text('owner').notNull(),
  at: integer('at').notNull(), action: text('action').notNull(), detail: text('detail').notNull(),
});
export const system = sqliteTable('system', { key: text('key').primaryKey(), value: text('value').notNull() });
