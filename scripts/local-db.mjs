import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
export function openLocalDb(filename=':memory:',migrate=true) {
  const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  if(migrate){
    sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
    for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
      if(sqlite.prepare('SELECT name FROM _migrations WHERE name=?').get(file))continue;
      sqlite.exec('BEGIN IMMEDIATE');
      try{sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
    }
  }
  function statement(sql,args=[]) {
    return { bind(...values){return statement(sql,values);},
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...args)};},
      async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};},
      _sql:sql,_args:args,
    };
  }
  return {prepare:statement,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>({meta:{changes:sqlite.prepare(s._sql).run(...s._args).changes}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();},sqlite};
}
