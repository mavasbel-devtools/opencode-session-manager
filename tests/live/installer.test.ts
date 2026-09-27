import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { appendFile, cp, mkdir, mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { removeTemporary, requireBun, root, run } from "@test/support/live/process"

let temporaryRoot = ""
let pluginRoot = ""
let release = ""
const base = () => ({ ...(process.env as Record<string, string>), OPENCODE_V2_PLUGIN_ROOT: pluginRoot })
const installer = (args: string[], env: Record<string, string>) => run([requireBun(), "scripts/install-plugin.mjs", ...args], { env })

beforeAll(async () => {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-session-id-installer-"))
  pluginRoot = path.join(temporaryRoot, "v2-plugins")
  const installed = await installer(["v2"], base())
  if (installed.exitCode !== 0) throw new Error(installed.stderr)
  release = (JSON.parse(installed.stdout) as { release: string }).release
  if (!release) throw new Error(`installer printed no release: ${installed.stdout}`)
}, 120_000)

afterAll(async () => {
  // Guarded: a beforeAll that throws leaves temporaryRoot empty, and an
  // unguarded rm("") would delete this repository (it happened once).
  await removeTemporary(temporaryRoot)
})

describe("install-plugin.mjs v2 contract", () => {
  it("stages a content-addressed release whose files are byte-identical to dist/v2", async () => {
    expect(path.dirname(release)).toBe(path.join(pluginRoot, "session-id", "releases"))
    const manifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8"))
    expect(manifest).toMatchObject({ schema: 1, host: "v2.0.14", contracts: { v2: "2.0.14" }, pluginName: "session-id", pluginId: "session-id-tool" })
    expect(path.basename(release)).toBe(`sha256-${manifest.releaseHash}`)
    for (const file of ["server.js", "tui.js"]) {
      expect(Buffer.compare(await readFile(path.join(release, file)), await readFile(path.join(root, "dist", "v2", file)))).toBe(0)
    }
    const valid = await installer(["validate-v2"], { ...base(), OPENCODE_V2_RELEASE_DIRECTORY: release })
    expect(valid.exitCode).toBe(0)
    expect(JSON.parse(valid.stdout)).toEqual({ host: "v2", release, status: "valid" })
  })

  it("is idempotent: reinstalling the same build yields the same release", async () => {
    const again = await installer(["v2"], base())
    expect((JSON.parse(again.stdout) as { release: string }).release).toBe(release)
  })

  it("refuses to guess a profile, a release, or an unknown command", async () => {
    const env = { ...(process.env as Record<string, string>) }
    delete env.OPENCODE_V2_PLUGIN_ROOT
    delete env.OPENCODE_V2_PLUGIN_DIR
    delete env.OPENCODE_V2_RELEASE_DIRECTORY
    const noRoot = await installer(["v2"], env)
    expect(noRoot.exitCode).not.toBe(0)
    expect(noRoot.stderr).toContain("installers never choose or edit a global OpenCode profile")
    const noRelease = await installer(["validate-v2"], base())
    expect(noRelease.stderr).toContain("OPENCODE_V2_RELEASE_DIRECTORY is required")
    const unknown = await installer(["v1"], base())
    expect(unknown.stderr).toContain("usage: bun scripts/install-plugin.mjs <v2|validate-v2|shims-v2|deploy-v2>")
    const noRootDeploy = await installer(["deploy-v2"], env)
    expect(noRootDeploy.exitCode).not.toBe(0)
    expect(noRootDeploy.stderr).toContain("installers never choose or edit a global OpenCode profile")
  })

  it("deploy-v2 stages the release and points the shims at it, backing up what was there", async () => {
    const deployRoot = path.join(temporaryRoot, "deploy", "v2-plugins")
    const directory = path.join(deployRoot, "session-id")
    await mkdir(directory, { recursive: true })
    // A pre-existing hand-written plugin, exactly what the real directory holds.
    await cp(path.join(root, "tests", "support", "fixtures", "legacy-session-id-index.js"), path.join(directory, "index.js"))
    const deployed = await installer(["deploy-v2"], { ...(process.env as Record<string, string>), OPENCODE_V2_PLUGIN_ROOT: deployRoot })
    expect(deployed.exitCode).toBe(0)
    const report = JSON.parse(deployed.stdout) as {
      staged: { release: string }
      shims: { release: string; backedUp: string[]; backup: string }
    }
    const { staged, shims } = report
    expect(shims.release).toBe(staged.release)
    expect(shims.backedUp).toEqual(["index.js"])
    expect(await readFile(path.join(shims.backup, "index.js"), "utf8")).toBe(
      await readFile(path.join(root, "tests", "support", "fixtures", "legacy-session-id-index.js"), "utf8"),
    )
    for (const [shim, artifact] of [
      ["index.js", "server.js"],
      ["tui.js", "tui.js"],
    ]) {
      expect(await readFile(path.join(directory, shim!), "utf8")).toBe(
        `export { default } from ${JSON.stringify(pathToFileURL(path.join(staged.release, artifact!)).href)}\n`,
      )
    }
  }, 120_000)

  it("rejects a release outside the root and a tampered artifact, and never writes shims for them", async () => {
    const outside = path.join(temporaryRoot, "elsewhere", path.basename(release))
    await cp(release, outside, { recursive: true })
    const moved = await installer(["shims-v2"], { ...base(), OPENCODE_V2_RELEASE_DIRECTORY: outside })
    expect(moved.stderr).toContain("outside its configured immutable release root")
    const tampered = path.join(pluginRoot, "session-id", "releases", "sha256-tampered")
    await cp(release, tampered, { recursive: true })
    await appendFile(path.join(tampered, "tui.js"), "\n// changed\n")
    const bad = await installer(["validate-v2"], { ...base(), OPENCODE_V2_RELEASE_DIRECTORY: tampered })
    expect(bad.stderr).toContain("artifact mismatch: tui.js")
    const badShims = await installer(["shims-v2"], { ...base(), OPENCODE_V2_RELEASE_DIRECTORY: tampered })
    expect(badShims.exitCode).not.toBe(0)
    expect(await Bun.file(path.join(pluginRoot, "session-id", "index.js")).exists()).toBe(false)
  })
})
