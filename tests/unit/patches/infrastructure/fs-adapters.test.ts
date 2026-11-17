import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Sha256Adapter } from "@session-manager/infrastructure/adapters/outbound/crypto/Sha256Adapter"
import { FileKeyValueAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FileKeyValueAdapter"
import { FsBackupAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsBackupAdapter"
import { JsonlAuditLogAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter"
import { NodeFilesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFilesAdapter"
import { TextFileAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/TextFileAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import { cleanup, tempDir, write } from "@test/support/patches/sandbox"

let dir: string
beforeEach(() => {
  dir = tempDir()
})
afterEach(() => cleanup(dir))

const bytes = (text: string) => new TextEncoder().encode(text)
const key = { version: "1.0.0", patch: "p", path: "dist/v2/a.js", sha: "abc" }

describe("NodeFilesAdapter", () => {
  const files = new NodeFilesAdapter()

  it("reads bytes, null for a missing file, and throws on anything else", async () => {
    write(path.join(dir, "a.js"), "hello")
    expect(new TextDecoder().decode((await files.read(path.join(dir, "a.js")))!)).toBe("hello")
    expect(await files.read(path.join(dir, "missing.js"))).toBeNull()
    await expect(files.read(dir)).rejects.toThrow(/EISDIR/)
  })

  it("replaces a file in one step, keeping its mode and leaving nothing beside it", async () => {
    const file = write(path.join(dir, "a.js"), "old")
    chmodSync(file, 0o640)
    await files.replace(file, bytes("new"))
    expect([readFileSync(file, "utf8"), statSync(file).mode & 0o777, readdirSync(dir)]).toEqual(["new", 0o640, ["a.js"]])
  })

  it("leaves the file and the folder untouched when the folder is not writable", async () => {
    const file = write(path.join(dir, "ro", "a.js"), "old")
    chmodSync(path.dirname(file), 0o555)
    await expect(files.replace(file, bytes("new"))).rejects.toThrow(/EACCES/)
    expect([readFileSync(file, "utf8"), readdirSync(path.dirname(file))]).toEqual(["old", ["a.js"]])
  })

  it("lists files by extension, recursively, relative and sorted", async () => {
    write(path.join(dir, "dist", "v2", "b.js"), "")
    write(path.join(dir, "dist", "a.js"), "")
    write(path.join(dir, "dist", "a.d.ts"), "")
    expect(await files.list(path.join(dir, "dist"), ".js")).toEqual(["a.js", "v2/b.js"])
  })
})

describe("Sha256Adapter and SystemClockAdapter", () => {
  it("hashes like sha256sum and tells the time", () => {
    expect(new Sha256Adapter().sha256(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    const now = new SystemClockAdapter().now()
    expect(Math.abs(now - Date.now())).toBeLessThan(1000)
  })
})

describe("FsBackupAdapter", () => {
  it("stores a backup once, read-only, addressed by checksum", async () => {
    const backups = new FsBackupAdapter(path.join(dir, "backups"))
    const where = await backups.save(key, bytes("v1"))
    expect(where).toBe(path.join(dir, "backups", "1.0.0", "p", "dist/v2/a.js@abc"))
    expect(await backups.save(key, bytes("ignored, already stored"))).toBe(where)
    expect([readFileSync(where, "utf8"), statSync(where).mode & 0o777]).toEqual(["v1", 0o444])
    expect(new TextDecoder().decode((await backups.find(key))!)).toBe("v1")
    expect(await backups.find({ ...key, sha: "other" })).toBeNull()
    expect(readdirSync(path.dirname(where))).toEqual(["a.js@abc"])
  })

  it("throws when the backup folder cannot be read", async () => {
    write(path.join(dir, "file"), "")
    await expect(new FsBackupAdapter(path.join(dir, "file")).find(key)).rejects.toThrow(/ENOTDIR/)
  })

  it("leaves no partial file when writing fails", async () => {
    const root = path.join(dir, "backups")
    mkdirSync(path.join(root, "1.0.0", "p", "dist", "v2"), { recursive: true })
    chmodSync(path.join(root, "1.0.0", "p", "dist", "v2"), 0o555)
    await expect(new FsBackupAdapter(root).save(key, bytes("x"))).rejects.toThrow(/EACCES/)
    expect(readdirSync(path.join(root, "1.0.0", "p", "dist", "v2"))).toEqual([])
  })
})

describe("JsonlAuditLogAdapter", () => {
  it("appends one JSON line per record, private to the user, naming user and process", async () => {
    const file = path.join(dir, "state", "audit.log")
    const audit = new JsonlAuditLogAdapter(file)
    const record = { time: "t", action: "apply" as const, patch: "p", version: "1", root: "/r", path: "a", from: null, to: "x", outcome: "applied", backup: null, reason: null }
    await audit.append(record)
    await audit.append({ ...record, outcome: "refused" })
    const lines = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(lines.map((l) => [l.outcome, l.user, l.pid])).toEqual([
      ["applied", os.userInfo().username, process.pid],
      ["refused", os.userInfo().username, process.pid],
    ])
    expect([audit.location(), statSync(file).mode & 0o777]).toEqual([file, 0o600])
  })
})

describe("TextFileAdapter", () => {
  it("reads text and lines, null when missing, throws otherwise", async () => {
    const file = write(path.join(dir, "log"), "a\nb")
    const text = new TextFileAdapter(file)
    expect([text.location(), await text.read(), await text.lines()]).toEqual([file, "a\nb", ["a", "b"]])
    const missing = new TextFileAdapter(path.join(dir, "none"))
    expect([await missing.read(), await missing.lines()]).toEqual([null, null])
    await expect(new TextFileAdapter(dir).read()).rejects.toThrow(/EISDIR/)
  })
})

describe("FileKeyValueAdapter", () => {
  it("stores, reads and deletes values, and throws when its folder is a file", async () => {
    const store = new FileKeyValueAdapter(path.join(dir, "kv"))
    expect(await store.get("k")).toBeNull()
    await store.set("k", "v")
    expect(await store.get("k")).toBe("v")
    await store.set("k", null)
    await store.set("k", null)
    expect([await store.get("k"), existsSync(path.join(dir, "kv", "k"))]).toEqual([null, false])
    writeFileSync(path.join(dir, "flat"), "")
    await expect(new FileKeyValueAdapter(path.join(dir, "flat")).get("k")).rejects.toThrow(/ENOTDIR/)
  })
})
