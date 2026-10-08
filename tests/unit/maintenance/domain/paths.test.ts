import { test } from "bun:test"
import assert from "node:assert/strict"
import { defaultDatabasePath } from "@session-manager/domain/model/Database"
import { baseName, dirName, joinPath } from "@session-manager/domain/model/DatabasePaths"
import { SIDECARS, sidecarPaths } from "@session-manager/domain/model/Sidecars"

test("baseName understands both separators and a bare name", () => {
  assert.equal(baseName("C:/a/b/opencode.db"), "opencode.db")
  assert.equal(baseName("C:\\a\\b\\opencode.db"), "opencode.db")
  assert.equal(baseName("opencode.db"), "opencode.db")
})

test("dirName yields the parent, a root, or nothing", () => {
  assert.equal(dirName("C:/a/b/opencode.db"), "C:/a/b")
  assert.equal(dirName("C:\\a\\b\\opencode.db"), "C:\\a\\b")
  assert.equal(dirName("/opencode.db"), "/")
  assert.equal(dirName("opencode.db"), "")
})

test("joinPath normalises separators and drops empty parts", () => {
  assert.equal(joinPath("C:/a", "b", "c"), "C:/a/b/c")
  assert.equal(joinPath("C:/a/", "/b/"), "C:/a/b")
  assert.equal(joinPath("C:\\a\\", "b"), "C:\\a/b")
  assert.equal(joinPath("", "b"), "b")
})

test("there are exactly three sidecars, in the fixed order", () => {
  assert.deepEqual([...SIDECARS], ["", "-wal", "-shm"])
})

test("sidecarPaths labels each file by its own name", () => {
  assert.deepEqual(sidecarPaths("C:/data/opencode.db"), [
    { label: "opencode.db", path: "C:/data/opencode.db" },
    { label: "opencode.db-wal", path: "C:/data/opencode.db-wal" },
    { label: "opencode.db-shm", path: "C:/data/opencode.db-shm" },
  ])
})

test("defaultDatabasePath honours XDG_DATA_HOME and falls back to the home directory", () => {
  assert.equal(defaultDatabasePath({ XDG_DATA_HOME: "D:/x" }, "C:/home"), "D:/x/opencode/opencode.db")
  assert.equal(defaultDatabasePath({}, "C:/home"), "C:/home/.local/share/opencode/opencode.db")
  assert.equal(defaultDatabasePath({ XDG_DATA_HOME: undefined }, "C:/home"), "C:/home/.local/share/opencode/opencode.db")
})
