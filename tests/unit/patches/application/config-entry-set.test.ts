import { describe, expect, it } from "bun:test"
import { ConfigEntrySet } from "@session-manager/application/patches/follow/ConfigEntrySet"
import { PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import { decode, encode, FakeBackups, FakeFiles, FakeHash, sha } from "@test/support/patches/fakes"

const PRIMARY = "/config/opencode/opencode.jsonc"
const TUI = "/config/opencode/tui.jsonc"
const OLD = "@cortexkit/opencode-magic-context@1.0.0"
const NEW = "/data/installs/2.0.0/node_modules/@cortexkit/opencode-magic-context"
const text = (entry: string) => `{\n  // the plugins\n  "plugin": [\n    "${entry}", // Magic Context\n  ],\n}\n`

function world(files: Record<string, string>) {
  const store = new FakeFiles(files)
  const backups = new FakeBackups()
  const hash = new FakeHash()
  const primary = new PluginEntryEditor(store, hash, backups, PRIMARY, "opencode.jsonc")
  const secondary = new PluginEntryEditor(store, hash, backups, TUI, "tui.jsonc")
  return { store, backups, primary, secondary, set: new ConfigEntrySet(store, primary, secondary), hash }
}

describe("ConfigEntrySet: publishing both configuration files", () => {
  it("U1 replaces both entries, reads both back, and backs up both originals", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const change = await w.set.set(NEW)
    expect(change.ok).toBe(true)
    if (!change.ok) return
    expect(change.previous).toEqual({ opencode: OLD, tui: OLD })
    expect([change.primary.previous, change.secondary!.previous]).toEqual([OLD, OLD])
    expect([w.store.text(PRIMARY), w.store.text(TUI)]).toEqual([text(NEW), text(NEW)])
    expect(w.backups.stored.size).toBe(2)
    expect([...w.backups.stored.keys()].sort()).toEqual([
      `config/follow/opencode.jsonc@${sha(text(OLD))}`,
      `config/follow/tui.jsonc@${sha(text(OLD))}`,
    ])
    expect(w.store.replaces).toEqual([PRIMARY, TUI])
    expect((await w.set.current())).toEqual({ opencode: NEW, tui: NEW })
    expect([w.set.location(), w.set.secondaryLocation()]).toEqual([PRIMARY, TUI])
  })

  it("U2 changes only the primary when tui.jsonc is absent, and records tui as null", async () => {
    const w = world({ [PRIMARY]: text(OLD) })
    const change = await w.set.set(NEW)
    expect(change.ok).toBe(true)
    if (!change.ok) return
    expect([change.previous, change.secondary]).toEqual([{ opencode: OLD, tui: null }, null])
    expect([w.store.text(PRIMARY), w.store.text(TUI)]).toEqual([text(NEW), undefined])
    expect(w.store.replaces).toEqual([PRIMARY])
    expect(await w.set.current()).toEqual({ opencode: NEW, tui: null })
  })

  it("U2 refuses a tui path that cannot be read, before writing anything", async () => {
    const w = world({ [PRIMARY]: text(OLD) })
    const read = w.store.read.bind(w.store)
    w.store.read = async (file) => {
      if (file === TUI) throw new Error("EISDIR: illegal operation on a directory")
      return read(file)
    }
    await expect(w.set.set(NEW)).rejects.toThrow("EISDIR")
    expect(w.store.text(PRIMARY)).toBe(text(OLD))
    expect(w.store.replaces).toEqual([])
  })

  it("U3 refuses a duplicate Magic Context entry in either file before any write", async () => {
    const duplicate = `{ "plugin": ["${OLD}", "${NEW}"] }`
    const primary = world({ [PRIMARY]: duplicate, [TUI]: text(OLD) })
    expect(await primary.set.set(NEW)).toMatchObject({ ok: false, reason: `${PRIMARY} does not have exactly one Magic Context entry` })
    expect(primary.store.replaces).toEqual([])
    expect([primary.store.text(PRIMARY), primary.store.text(TUI)]).toEqual([duplicate, text(OLD)])
    const tui = world({ [PRIMARY]: text(OLD), [TUI]: duplicate })
    expect(await tui.set.set(NEW)).toMatchObject({ ok: false, reason: `${TUI} does not have exactly one Magic Context entry` })
    expect(tui.store.replaces).toEqual([])
    expect([tui.store.text(PRIMARY), tui.store.text(TUI)]).toEqual([text(OLD), duplicate])
    const none = world({ [PRIMARY]: "{}\n", [TUI]: text(OLD) })
    expect(await none.set.set(NEW)).toMatchObject({ ok: false, reason: `${PRIMARY} does not have exactly one Magic Context entry` })
    expect(none.store.replaces).toEqual([])
  })

  it("U3 refuses a missing primary even when tui.jsonc is fine", async () => {
    const w = world({ [TUI]: text(OLD) })
    expect(await w.set.set(NEW)).toMatchObject({ ok: false, reason: `${PRIMARY} does not exist` })
    expect(w.store.replaces).toEqual([])
    expect(w.store.text(TUI)).toBe(text(OLD))
  })

  it("U4 puts the primary back byte for byte when the secondary write fails, and names both files", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const before = w.store.contents.get(PRIMARY)!
    w.store.failReplace.add(TUI)
    const change = await w.set.set(NEW)
    expect(change.ok).toBe(false)
    if (change.ok) return
    expect(change.reason).toContain(TUI)
    expect(change.reason).toContain("cannot write")
    expect(change.reason).toContain(PRIMARY)
    expect(decode(w.store.contents.get(PRIMARY)!)).toBe(decode(before))
    expect(w.store.replaces).toEqual([PRIMARY, TUI, PRIMARY])
  })

  it("U4 exits 1 with the original sha when restoring the primary also fails", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const original = w.store.contents.get(PRIMARY)!
    w.store.failReplace.add(TUI)
    const replace = w.store.replace.bind(w.store)
    let primaryWrites = 0
    w.store.replace = async (file, bytes) => {
      if (file === PRIMARY) {
        primaryWrites += 1
        if (primaryWrites === 2) throw new Error("EACCES")
      }
      return replace(file, bytes)
    }
    const change = await w.set.set(NEW)
    expect(change.ok).toBe(false)
    if (change.ok) return
    expect(change.reason).toContain(`original sha256 ${sha(original)}`)
    expect(change.reason).toContain("could not be restored")
    expect(decode(w.store.contents.get(PRIMARY)!)).toBe(text(NEW))
  })

  it("U4 reports a restore that did not read back the original bytes", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const original = w.store.contents.get(PRIMARY)!
    w.store.failReplace.add(TUI)
    const replace = w.store.replace.bind(w.store)
    let primaryWrites = 0
    w.store.replace = async (file, bytes) => {
      if (file === PRIMARY) {
        primaryWrites += 1
        if (primaryWrites === 2) {
          w.store.contents.set(PRIMARY, encode("corrupted"))
          return
        }
      }
      return replace(file, bytes)
    }
    const change = await w.set.set(NEW)
    expect(change.ok).toBe(false)
    if (change.ok) return
    expect(change.reason).toContain(`original sha256 ${sha(original)}`)
    expect(change.reason).toContain("did not read back its original bytes")
  })

  it("U5 restores the secondary then the primary, and refuses an empty previous record", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const change = await w.set.set(NEW)
    if (!change.ok) throw new Error(change.reason)
    w.store.replaces = []
    const back = await w.set.revert(change.previous)
    expect(back.ok).toBe(true)
    expect([w.store.text(PRIMARY), w.store.text(TUI)]).toEqual([text(OLD), text(OLD)])
    expect(w.store.replaces).toEqual([TUI, PRIMARY])
    expect(await w.set.current()).toEqual({ opencode: OLD, tui: OLD })

    w.store.replaces = []
    expect(await w.set.revert({ opencode: null, tui: null })).toMatchObject({ ok: false, reason: `${PRIMARY} has no recorded entry` })
    expect(w.store.replaces).toEqual([])
    expect(await w.set.revert({ opencode: OLD, tui: OLD })).toMatchObject({ ok: true })
  })

  it("U5 leaves both untouched when a recorded tui.jsonc no longer exists", async () => {
    const w = world({ [PRIMARY]: text(OLD) })
    w.store.replaces = []
    expect(await w.set.revert({ opencode: OLD, tui: OLD })).toMatchObject({ ok: false, reason: `${TUI} does not exist` })
    expect(w.store.replaces).toEqual([])
    expect(w.store.text(PRIMARY)).toBe(text(OLD))
  })

  it("U5 puts the secondary back when the primary cannot be reverted", async () => {
    const w = world({ [PRIMARY]: text(OLD), [TUI]: text(OLD) })
    const change = await w.set.set(NEW)
    if (!change.ok) throw new Error(change.reason)
    w.store.failReplace.add(PRIMARY)
    const back = await w.set.revert(change.previous)
    expect(back.ok).toBe(false)
    if (back.ok) return
    expect(back.reason).toContain("cannot write")
    expect(w.store.text(TUI)).toBe(text(NEW))
  })
})
