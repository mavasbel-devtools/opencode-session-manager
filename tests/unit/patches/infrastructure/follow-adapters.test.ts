import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import { CompositeInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/CompositeInstallationsAdapter"
import { ManagedInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/ManagedInstallationsAdapter"
import { FsFollowLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsFollowLockAdapter"
import { FsEvidenceAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsEvidenceAdapter"
import { FsManagedStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter"
import { JsonDerivedReleasesAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter"
import { ArboristInstallerAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter"
import { NpmPackumentAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/NpmPackumentAdapter"
import { magicContextPlugin, OpencodeLivePluginsAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeLivePluginsAdapter"
import { OpencodeSandboxAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpencodeSandboxAdapter"
import { BunTranspileAdapter } from "@session-manager/infrastructure/adapters/outbound/parse/BunTranspileAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import { FakeInstallations } from "@test/support/patches/fakes"
import { LocalRegistry, tarball } from "@test/support/patches/registry"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

const release = { patch: "p", release: { version: "1.0.0", files: [{ path: "dist/a.js", before: "a", after: "b", replacements: [] }] } }

describe("FsManagedStoreAdapter", () => {
  it("stages, publishes in one rename, lists, and removes", async () => {
    const installs = path.join(box.data, "installs")
    const store = new FsManagedStoreAdapter(installs)
    await expect(store.versions()).rejects.toThrow(/ENOENT/)
    const staging = await store.stage("1.0.0")
    expect(await store.versions()).toEqual([])
    expect(path.basename(staging)).toMatch(/^\.staging-1\.0\.0-[0-9a-f-]{36}$/)
    write(path.join(staging, "package.json"), "{}")
    expect(await store.published("1.0.0")).toBeNull()
    const folder = await store.publish(staging, "1.0.0")
    expect([folder, existsSync(staging), readFileSync(path.join(folder, "package.json"), "utf8")]).toEqual([path.join(installs, "1.0.0"), false, "{}"])
    write(path.join(installs, "stray-file"), "")
    expect([await store.published("1.0.0"), await store.published("stray-file"), await store.versions()]).toEqual([folder, null, ["1.0.0"]])
    await expect(store.publish(await store.stage("1.0.0"), "1.0.0")).rejects.toThrow(`${folder} already exists`)
    await store.remove(folder)
    expect(await store.versions()).toEqual([])
  })
})

describe("ManagedInstallationsAdapter and CompositeInstallationsAdapter", () => {
  it("lists the copies follow installed, with their folder as the spec, after the npm cache's", async () => {
    const installs = path.join(box.data, "installs")
    const root = (version: string) => path.join(installs, version, "node_modules", MAGIC_CONTEXT_PACKAGE)
    write(path.join(root("2.0.0"), "package.json"), JSON.stringify({ name: MAGIC_CONTEXT_PACKAGE, version: "2.0.0" }))
    write(path.join(root("1.0.0"), "package.json"), JSON.stringify({ name: MAGIC_CONTEXT_PACKAGE, version: "1.0.0" }))
    write(path.join(root("3.0.0"), "package.json"), JSON.stringify({ name: "other", version: "3.0.0" }))
    mkdirSync(path.join(installs, "4.0.0"))
    mkdirSync(path.join(installs, ".staging-5.0.0-x"))
    expect(await new ManagedInstallationsAdapter(path.join(box.data, "none")).list()).toEqual([])
    const managed = new ManagedInstallationsAdapter(installs)
    const cache = new FakeInstallations([{ spec: "0.9.0", root: "/cache", version: "0.9.0" }])
    expect(await new CompositeInstallationsAdapter([cache, managed]).list()).toEqual([
      { spec: "0.9.0", root: "/cache", version: "0.9.0" },
      { spec: root("1.0.0"), root: root("1.0.0"), version: "1.0.0" },
      { spec: root("2.0.0"), root: root("2.0.0"), version: "2.0.0" },
    ])
  })
})

describe("JsonDerivedReleasesAdapter, FsEvidenceAdapter", () => {
  it("keeps one derived release per patch and version, and fails on anything but a missing file", async () => {
    const file = path.join(box.data, "derived.json")
    const derived = new JsonDerivedReleasesAdapter(file)
    expect(await derived.list()).toEqual([])
    await derived.save(release)
    await derived.save({ ...release, patch: "q" })
    await derived.save({ ...release, release: { ...release.release, files: [] } })
    expect(await derived.list()).toEqual([{ ...release, patch: "q" }, { ...release, release: { ...release.release, files: [] } }])
    expect(readdirSync(box.data)).toEqual(["derived.json"])
    await expect(new JsonDerivedReleasesAdapter(box.data).list()).rejects.toThrow(/EISDIR/)
  })

  it("never overwrites an evidence document: a taken name gets a number", async () => {
    const evidence = new FsEvidenceAdapter(path.join(box.state, "evidence"))
    const file = await evidence.write("a.md", "# A\n")
    expect([file, readFileSync(file, "utf8")]).toEqual([path.join(box.state, "evidence", "a.md"), "# A\n"])
    expect([await evidence.write("a.md", "2"), await evidence.write("a.md", "3"), await evidence.write("b", "x"), await evidence.write("b", "y")]).toEqual(
      ["a-2.md", "a-3.md", "b", "b-2"].map((name) => path.join(box.state, "evidence", name)),
    )
    expect(readFileSync(file, "utf8")).toBe("# A\n")
    write(path.join(box.home, "file"), "")
    await expect(new FsEvidenceAdapter(path.join(box.home, "file")).write("a.md", "x")).rejects.toThrow()
    const blocked = path.join(box.home, "blocked")
    mkdirSync(blocked)
    chmodSync(blocked, 0o500)
    await expect(new FsEvidenceAdapter(blocked).write("a.md", "x")).rejects.toThrow(/EACCES/)
  })
})

describe("FsFollowLockAdapter", () => {
  it("is held by one run at a time, taken over from an owner that is gone, and released", async () => {
    const file = path.join(box.state, "follow.lock")
    const lock = new FsFollowLockAdapter(file, { isAlive: async () => true })
    const release = (await lock.acquire())!
    expect(readFileSync(file, "utf8")).toBe(String(process.pid))
    expect(await lock.acquire()).toBeNull()
    await release()
    expect(existsSync(file)).toBe(false)
    const gone = new FsFollowLockAdapter(file, { isAlive: async () => false })
    writeFileSync(file, "999999999")
    expect(await gone.acquire()).not.toBeNull()
    await (await gone.acquire())!()
    writeFileSync(file, "not a pid")
    expect(await gone.acquire()).not.toBeNull()
    await expect(new FsFollowLockAdapter(path.join(box.home, "missing-dir", "x", "\0"), { isAlive: async () => true }).acquire()).rejects.toThrow()
  })
})

describe("BunTranspileAdapter, SystemClockAdapter", () => {
  it("parses JavaScript without running it", () => {
    const parser = new BunTranspileAdapter()
    expect([parser.error("const a = [] /* x */; export { a }"), parser.error("const a = ;")]).toEqual([null, expect.stringContaining("Unexpected")])
  })

  it("sleeps", async () => {
    const clock = new SystemClockAdapter()
    const start = clock.now()
    await clock.sleep(20)
    expect(clock.now() - start).toBeGreaterThanOrEqual(15)
  })
})

describe("NpmPackumentAdapter and ArboristInstallerAdapter on a local registry", () => {
  it("reads latest and a given version, and fails clearly", async () => {
    const one = tarball(box.home, "0.49.19", "1.0.0")
    const two = tarball(box.home, "0.49.19", "2.0.0")
    const registry = new LocalRegistry([one, two])
    try {
      const npm = new NpmPackumentAdapter(`${registry.url}/`)
      expect(await npm.latest()).toEqual({ version: "2.0.0", integrity: two.integrity })
      expect([await npm.find("1.0.0"), await npm.find("9.9.9")]).toEqual([{ version: "1.0.0", integrity: one.integrity }, null])
      expect(registry.requests[0]).toBe("/@cortexkit%2fopencode-magic-context")
      registry.latest = "9.9.9"
      await expect(npm.latest()).rejects.toThrow("the registry names no installable latest version (dist-tags.latest 9.9.9)")
      registry.latest = null
      await expect(npm.latest()).rejects.toThrow("dist-tags.latest missing")
      registry.failures = true
      await expect(npm.find("1.0.0")).rejects.toThrow(/HTTP 503/)
    } finally {
      registry.stop()
    }
  })

  it("installs a package the way OpenCode does and reports its root, version and integrity", async () => {
    const pack = tarball(box.home, "0.49.19", "2.0.0")
    const registry = new LocalRegistry([pack])
    try {
      const folder = path.join(box.home, "install")
      mkdirSync(folder)
      const installer = new ArboristInstallerAdapter(registry.url, path.join(box.home, "npm-cache"))
      const installed = await installer.install(`${MAGIC_CONTEXT_PACKAGE}@2.0.0`, folder)
      expect(installed).toEqual({ root: path.join(folder, "node_modules", MAGIC_CONTEXT_PACKAGE), version: "2.0.0", integrity: pack.integrity })
      expect(JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8"))).toEqual({ dependencies: { [MAGIC_CONTEXT_PACKAGE]: "2.0.0" } })
      expect(readFileSync(path.join(installed.root, "dist/v2/server-271qxsf5.js"))).toEqual(
        readFileSync(path.join(import.meta.dir, "../../../support/patches/fixtures/magic-context-0.49.19/dist/v2/server-271qxsf5.js")),
      )
      await expect(installer.install("left-pad@1.0.0", path.join(box.home, "other"))).rejects.toThrow()
    } finally {
      registry.stop()
    }
  })

  it("installs into a folder reached through a symlink by staging through the real path", async () => {
    const pack = tarball(box.home, "0.49.19", "2.0.0")
    const registry = new LocalRegistry([pack])
    try {
      const real = path.join(box.home, "real-install")
      mkdirSync(real)
      const link = path.join(box.home, "link-install")
      symlinkSync(real, link)
      const installer = new ArboristInstallerAdapter(registry.url, path.join(box.home, "npm-cache"))
      const installed = await installer.install(`${MAGIC_CONTEXT_PACKAGE}@2.0.0`, link)
      expect(installed).toEqual({ root: path.join(realpathSync(real), "node_modules", MAGIC_CONTEXT_PACKAGE), version: "2.0.0", integrity: pack.integrity })
    } finally {
      registry.stop()
    }
  })

  it("refuses an install that holds no Magic Context", async () => {
    const pack = tarball(box.home, "0.49.19", "2.0.0")
    const registry = new LocalRegistry([pack])
    try {
      const installer = new ArboristInstallerAdapter(registry.url, path.join(box.home, "npm-cache"))
      const empty = path.join(box.home, "empty")
      mkdirSync(empty)
      writeFileSync(path.join(empty, "package.json"), "{}")
      await expect(installer.install(`${MAGIC_CONTEXT_PACKAGE}-missing@file:${box.home}/nothing`, empty)).rejects.toThrow()
    } finally {
      registry.stop()
    }
  })
})

describe("OpencodeLivePluginsAdapter", () => {
  const service = () => path.join(box.state, "opencode", "service.json")

  it("finds Magic Context in a plugin answer by folder, package or spec", () => {
    const answer = (source: object, state: object = { status: "active" }) => ({ data: [{ source: { type: "builtin" } }, { source, state }] })
    expect(magicContextPlugin(answer({ type: "local", path: `/x/${MAGIC_CONTEXT_PACKAGE}/index.js` }))).toEqual({ source: `/x/${MAGIC_CONTEXT_PACKAGE}/index.js`, status: "active" })
    expect(magicContextPlugin(answer({ type: "package", target: `${MAGIC_CONTEXT_PACKAGE}@1.0.0` }, { status: "failed", error: "boom" }))).toEqual({ source: `${MAGIC_CONTEXT_PACKAGE}@1.0.0`, status: "failed: boom" })
    expect(magicContextPlugin(answer({ type: "package", target: MAGIC_CONTEXT_PACKAGE }, {}))).toEqual({ source: MAGIC_CONTEXT_PACKAGE, status: "unknown" })
    expect(magicContextPlugin(answer({ type: "local", path: `/x/${MAGIC_CONTEXT_PACKAGE}` }))).toEqual({ source: `/x/${MAGIC_CONTEXT_PACKAGE}`, status: "active" })
    expect(magicContextPlugin(answer({ type: "local", path: "/x/other/index.js" }))).toBeNull()
    expect(magicContextPlugin({})).toBeNull()
  })

  it("is null without a service file or a listening server", async () => {
    expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toBeNull()
    write(service(), JSON.stringify({ url: "http://127.0.0.1:9" }))
    expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toBeNull()
    write(service(), JSON.stringify({ url: "http://127.0.0.1:9", password: "pw" }))
    expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toBeNull()
    write(service(), "not json")
    expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toBeNull()
  })

  it("lists each loaded location once, by the location the server answers for", async () => {
    box.pin("1.0.0")
    const server = box.liveServer(3, (entry, pathname) => pathname === "/api/debug/location" ? null : Response.json({ location: { directory: "/work" }, data: [{ source: { type: "package", target: entry }, state: { status: "active" } }] }))
    try {
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: "/work", source: `${MAGIC_CONTEXT_PACKAGE}@1.0.0`, status: "active" }])
    } finally {
      server.stop(true)
    }
  })

  it("reports a server that is not ready, and a location that fails, instead of treating them as no server", async () => {
    box.pin("1.0.0")
    let failing = true
    const server = box.liveServer(1, (_, pathname) => (failing && pathname === "/api/plugin" ? new Response("", { status: 503 }) : null))
    try {
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: "/work/0", source: null, status: "HTTP 503" }])
      failing = false
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: "/work/0", source: `${MAGIC_CONTEXT_PACKAGE}@1.0.0`, status: "active" }])
      failing = true
      const odd = box.liveServer(1, (_, pathname) => (pathname === "/api/debug/location" ? Response.json({}) : null))
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: `http://127.0.0.1:${odd.port}`, source: null, status: "not a list of locations" }])
      odd.stop(true)
      write(service(), JSON.stringify({ url: `http://127.0.0.1:${server.port}`, password: "wrong" }))
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: `http://127.0.0.1:${server.port}`, source: null, status: "HTTP 401" }])
    } finally {
      server.stop(true)
    }
  })

  it("lists a location without Magic Context", async () => {
    write(path.join(box.config, "opencode", "opencode.jsonc"), "{}")
    const server = box.liveServer(1)
    try {
      expect(await new OpencodeLivePluginsAdapter(service()).magicContext()).toEqual([{ directory: "/work/0", source: null, status: null }])
    } finally {
      server.stop(true)
    }
  })
})

describe("OpencodeSandboxAdapter", () => {
  const sandbox = (mode: string, timeoutMs = 5_000) =>
    new OpencodeSandboxAdapter({ opencode: box.opencodeStandIn(mode), parent: path.join(box.home, "sandboxes"), timeoutMs, settleMs: 10, pollMs: 20 })
  const leftovers = () => readdirSync(path.join(box.home, "sandboxes"))
  const ROOT = `/plugins/node_modules/${MAGIC_CONTEXT_PACKAGE}`

  it("starts an isolated server with the plugin and the user's configuration, reads its log, and removes the home", async () => {
    const proof = await sandbox("ok").prove(ROOT, '{ "execute_threshold_percentage": 13 }')
    expect(proof).toEqual({ status: "active", source: `${ROOT}/index.js`, lines: ["[2026-10-23T00:00:00.000Z] [magic-context] @cortexkit/opencode-magic-context v2 setup"], error: null })
    expect(leftovers()).toEqual([])
  })

  it("passes the log's rejections through, without a magic-context.jsonc too", async () => {
    const proof = await sandbox("reject").prove(ROOT, null)
    expect([proof.status, proof.lines.length, proof.lines[0]]).toEqual(["active", 2, expect.stringContaining("config reload failed")])
  })

  it("reads no lines when Magic Context wrote no log", async () => {
    expect(await sandbox("nolog").prove(ROOT, null)).toEqual({ status: "active", source: `${ROOT}/index.js`, lines: [], error: null })
  })

  it("reports a plugin the server never lists", async () => {
    expect(await sandbox("missing", 300).prove(ROOT, null)).toEqual({ status: null, source: null, lines: [expect.stringContaining("v2 setup")], error: null })
  })

  it("reports a server that prints nothing in time, one that exits, and one that cannot start", async () => {
    expect((await sandbox("silent", 300).prove("/p", null)).error).toBe("opencode serve printed no address and password within 300 ms")
    expect((await sandbox("exit").prove("/p", null)).error).toBe("opencode serve printed no address and password within 5000 ms")
    const missing = new OpencodeSandboxAdapter({ opencode: path.join(box.home, "no-such-opencode"), parent: path.join(box.home, "sandboxes"), timeoutMs: 100, settleMs: 0, pollMs: 10 })
    expect((await missing.prove("/p", null)).error).toMatch(/ENOENT|No such file/)
    expect(leftovers()).toEqual([])
  }, 30_000)
})
