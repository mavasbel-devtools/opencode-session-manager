import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { InstalledMagicContextAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/InstalledMagicContextAdapter"
import { compareVersions } from "@session-manager/domain/services/Versions"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { cachedPackageDirectory, makeMagicContextPackage } from "@test/support/sessions/magic-context-package"
import { makeContextStore } from "@test/support/sessions/stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-mc-release-")
})
afterEach(() => {
  removeTemporary(directory)
})

const adapter = (roots: readonly string[], override?: string) => {
  const temporary = join(directory, "tmp")
  mkdirSync(temporary, { recursive: true })
  return { release: new InstalledMagicContextAdapter(roots, override, process.execPath, temporary), temporary }
}

const formatOf = (file: string) => {
  const db = new Database(file, { readonly: true })
  try {
    return (db.query("select max(version) as v from schema_migrations").get() as { v: number }).v
  } finally {
    db.close()
  }
}

describe("InstalledMagicContextAdapter", () => {
  it("finds the newest release in OpenCode's package cache and probes the format it writes", () => {
    const cache = join(directory, "cache")
    makeMagicContextPackage(cachedPackageDirectory(cache, "packages", "0.40.0"), { version: "0.40.0", latest: 90 })
    makeMagicContextPackage(cachedPackageDirectory(cache, "npm", "latest", "222"), { version: "0.45.0", latest: 94 })
    makeMagicContextPackage(cachedPackageDirectory(cache, "npm", "latest", "111"), { version: "0.44.9", latest: 93 })
    makeMagicContextPackage(cachedPackageDirectory(cache, "npm", "next", "1"), { version: "0.46.0", latest: 95, entry: false })
    mkdirSync(join(cache, "npm", "@cortexkit", "unrelated@1"), { recursive: true })
    const { release, temporary } = adapter([cache, join(directory, "missing")])
    const found = release.installed()
    expect(found).toEqual({ version: "0.45.0", latestFormat: 94, packageDirectory: cachedPackageDirectory(cache, "npm", "latest", "222") })
    expect(release.installed()).toBe(found!)
    expect(release.searched()).toEqual([cache, join(directory, "missing")])
    expect(readdirSync(temporary)).toEqual([])
  })

  it("upgrades a copy with the release's own code, and reports a refusal or a crash", () => {
    const pkg = makeMagicContextPackage(join(directory, "pkg"), { version: "1.0.0", latest: 5 })
    const { release } = adapter([], pkg)
    expect(release.searched()).toEqual([pkg])
    const found = release.installed()!
    const store = join(directory, "context.db")
    makeContextStore(store, { version: 2 })
    expect(release.upgrade(found, store)).toEqual({ ok: true, format: 5 })
    expect(formatOf(store)).toBe(5)

    const refused = join(directory, "refused.db")
    makeContextStore(refused, { version: 2 })
    new Database(refused).exec("create table refuse_upgrade (x)")
    const outcome = release.upgrade(found, refused)
    expect(outcome).toEqual({ ok: false, detail: 'refused: {"fence":null,"refusal":{"reason":"test refusal"}}' })

    const crashed = join(directory, "crashed.db")
    makeContextStore(crashed, { version: 2 })
    new Database(crashed).exec("create table crash_upgrade (x)")
    const crash = release.upgrade(found, crashed)
    expect(crash.ok).toBe(false)
    expect(crash.ok ? "" : crash.detail).toMatch(/^exit 1: .*crashed on purpose/)

    expect(release.upgrade({ ...found, packageDirectory: join(directory, "nowhere") }, store)).toEqual({
      ok: false,
      detail: `no store entry in ${join(directory, "nowhere")}`,
    })
    expect(release.upgrade({ ...found, packageDirectory: pkg }, store)).toEqual({ ok: true, format: 5 })
  })

  it("finds nothing without a package, a version, or a usable probe", () => {
    expect(adapter([join(directory, "empty")]).release.installed()).toBeNull()
    const noVersion = join(directory, "no-version")
    makeMagicContextPackage(noVersion, { version: "1.0.0", latest: 1 })
    Bun.write(join(noVersion, "package.json"), "{}")
    expect(adapter([], noVersion).release.installed()).toBeNull()
    const broken = join(directory, "broken")
    makeMagicContextPackage(broken, { version: "1.0.0", latest: 1 })
    Bun.write(join(broken, "package.json"), "not json")
    expect(adapter([], broken).release.installed()).toBeNull()
    const badProbe = makeMagicContextPackage(join(directory, "bad-probe"), { version: "1.0.0", latest: "ninety" })
    expect(adapter([], badProbe).release.installed()).toBeNull()
    const upgradeFails = makeMagicContextPackage(join(directory, "bad-upgrade"), { version: "1.0.0", latest: "ninety" })
    expect(
      adapter([], upgradeFails).release.upgrade({ version: "1", latestFormat: 1, packageDirectory: upgradeFails }, join(directory, "absent", "x.db")),
    ).toMatchObject({ ok: false })
  })

  it("compares versions in semver 2.0.0 §11 order", () => {
    expect(compareVersions("0.45.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareVersions("1.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.x", "1.0")).toBe(0)
    expect(compareVersions("0.1", "0.2")).toBeLessThan(0)
  })

  it("orders pre-releases per the semver 2.0.0 §11 example, ignoring build metadata", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ]
    for (let index = 0; index + 1 < ordered.length; index++) {
      expect(compareVersions(ordered[index]!, ordered[index + 1]!)).toBeLessThan(0)
      expect(compareVersions(ordered[index + 1]!, ordered[index]!)).toBeGreaterThan(0)
    }
    expect(compareVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0)
    expect(compareVersions("1.0.0-beta.1+build", "1.0.0-beta.1")).toBe(0)
  })
})
