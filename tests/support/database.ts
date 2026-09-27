import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

export function fileSha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

export interface MakeDatabaseOptions {
  readonly keepOpen?: boolean
}

/**
 * A WAL database shaped like `opencode.db`: text primary keys, an FK cascade, a table without a
 * primary key, BLOB values, integers beyond 2^53, and many free pages after a delete.
 * With `keepOpen` the connection is returned still open (a live writer).
 */
export function makeDatabase(file: string, options: MakeDatabaseOptions = {}): DatabaseSync | undefined {
  const db = new DatabaseSync(file)
  db.exec(`
    pragma journal_mode = wal;
    pragma foreign_keys = on;
    pragma user_version = 7;
    create table project(id text primary key);
    create table session_v2(id text primary key, project_id text not null references project(id) on delete cascade, data blob, big integer);
    create table session_message(id text primary key, session_id text not null references session_v2(id) on delete cascade, seq integer not null, data text);
    create table nopk(a text, b integer);
    create table instruction_entry(session_id text not null, key text not null, value text, primary key (session_id, key));
    insert into instruction_entry values ('ses_1', 'b', '2'), ('ses_1', 'a', '1'), ('ses_0', 'z', '3');
    create table seq(id integer primary key autoincrement, v text);
    create index session_message_seq on session_message(session_id, seq);
  `)
  db.exec("begin")
  db.prepare("insert into project values ('p1')").run()
  const session = db.prepare("insert into session_v2 values (?, 'p1', ?, ?)")
  const message = db.prepare("insert into session_message values (?, ?, ?, ?)")
  for (let s = 0; s < 40; s++) {
    session.run(`ses_${s}`, Buffer.from([s, 255, 0]), 9007199254740993n + BigInt(s))
    for (let m = 0; m < 50; m++) message.run(`msg_${s}_${m}`, `ses_${s}`, m, "x".repeat(400))
  }
  db.prepare("insert into nopk values ('dup', 1)").run()
  db.prepare("insert into nopk values ('dup', 1)").run()
  db.prepare("insert into seq(v) values ('a')").run()
  db.exec("commit")
  db.exec("delete from session_v2 where id >= 'ses_2'")
  db.exec("pragma wal_checkpoint(truncate)")
  db.prepare("insert into project values ('p-wal-only')").run()
  if (options.keepOpen === true) return db
  db.close()
  return undefined
}

/** A database with no BLOB column and no table without a primary key (shape coverage for fingerprints). */
export function makePlainDatabase(file: string): void {
  const db = new DatabaseSync(file)
  db.exec("create table t(a text primary key, b integer); insert into t values ('x', 1)")
  db.close()
}
