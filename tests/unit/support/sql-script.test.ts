import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { runScript, statementsOf } from "@test/support/sessions/sql-script"

describe("statementsOf", () => {
  it("splits at semicolons outside quotes, comments and trigger bodies", () => {
    expect(
      statementsOf(`insert into t values ('a;b'); -- note; here
        create trigger x after insert on t begin update t set a = "c;d"; delete from t where a = 'z'; end;
        update t set a = 1;;
        select 1`),
    ).toEqual([
      "insert into t values ('a;b')",
      `create trigger x after insert on t begin update t set a = "c;d"; delete from t where a = 'z'; end`,
      "update t set a = 1",
      "select 1",
    ])
    expect(statementsOf("select 'open")).toEqual(["select 'open"])
    expect(statementsOf("select 1 -- tail")).toEqual(["select 1"])
    expect(statementsOf("select extended, legend from t")).toEqual(["select extended, legend from t"])
    expect(statementsOf("create trigger y after insert on t begin update t set a = case when 1 then 2 else 3 end; end; select 2")).toEqual([
      "create trigger y after insert on t begin update t set a = case when 1 then 2 else 3 end; end",
      "select 2",
    ])
  })

  it("makes a failing statement anywhere in a script throw", () => {
    const db = new Database(":memory:")
    db.exec("create table t (a integer primary key)")
    expect(() => runScript(db, "insert into t values (1); insert into t values (1); insert into t values (2);")).toThrow(/UNIQUE/)
    expect(db.query("select a from t").all()).toEqual([{ a: 1 }])
    db.close()
  })
})
