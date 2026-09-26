import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const project = path.resolve(import.meta.dir, "../..")
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sessions-transfer-installer-"))

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

describe("dual-host installer contract", () => {
  test("stages byte-verified v1 artifacts and an immutable v2 release without changing configuration", async () => {
    const v1Directory = path.join(temporaryRoot, "v1", "plugins")
    const v2Root = path.join(temporaryRoot, "v2-plugins")
    const environment = Object.fromEntries(Object.entries({
      ...process.env,
      OPENCODE_V1_PLUGIN_DIR: v1Directory,
      OPENCODE_V2_PLUGIN_DIR: v2Root,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"))

    await run(["run", "install:plugin:v1"], environment)
    await run(["run", "install:plugin:v2"], environment)

    const v1Manifest = JSON.parse(await readFile(path.join(v1Directory, ".opencode-plugin-manifests", "sessions-transfer-v1.json"), "utf8")) as {
      host: string
      validation: { moduleShape: string; isolatedHost: string }
      artifacts: Array<{ file: string; sha256: string }>
      contracts: { v1: string; v2: string }
      lockfile: { file: string; bytes: number; sha256: string }
      toolchain: { bun: string; node: string }
      commands: { build: string; install: string }
    }
    expect(v1Manifest.host).toBe("v1.18.32")
    expect(v1Manifest.validation).toEqual({ moduleShape: "passed", isolatedHost: "not-run" })
    expectProvenance(v1Manifest)
    expect(v1Manifest.artifacts.map((artifact) => artifact.file)).toEqual(["sessions-transfer.js", "sessions-transfer.tui.js"])

    const releaseRoot = path.join(v2Root, "sessions-transfer", "releases")
    const releases = await readdir(releaseRoot)
    expect(releases).toHaveLength(1)
    const release = path.join(releaseRoot, releases[0]!)
    const v2Manifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8")) as {
      host: string
      validation: { moduleShape: string; isolatedHost: string }
      artifacts: Array<{ file: string; sha256: string }>
      contracts: { v1: string; v2: string }
      lockfile: { file: string; bytes: number; sha256: string }
      toolchain: { bun: string; node: string }
      commands: { build: string; install: string }
    }
    expect(v2Manifest.host).toBe("v2.0.14")
    expect(v2Manifest.validation).toEqual({ moduleShape: "passed", isolatedHost: "not-run" })
    expectProvenance(v2Manifest)
    expect(v2Manifest.artifacts.map((artifact) => artifact.file)).toEqual(["server.js", "tui.js"])

    await run(["run", "validate:installed:v1"], environment)
    await run(["run", "validate:installed:v2"], { ...environment, OPENCODE_V2_RELEASE_DIRECTORY: release })
  }, 60_000)
})

async function run(arguments_: string[], environment: Record<string, string>) {
  const child = Bun.spawn([globalThis.process.execPath, ...arguments_], { cwd: project, env: environment, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (exitCode !== 0) throw new Error(`${arguments_.join(" ")} failed: ${stdout}${stderr}`)
}

function expectProvenance(manifest: {
  contracts: { v1: string; v2: string }
  lockfile: { file: string; bytes: number; sha256: string }
  toolchain: { bun: string; node: string }
  commands: { build: string; install: string }
}) {
  expect(manifest.contracts).toEqual({ v1: "1.18.32", v2: "2.0.14" })
  expect(manifest.lockfile.file).toBe("bun.lock")
  expect(manifest.lockfile.bytes).toBeGreaterThan(0)
  expect(manifest.lockfile.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(manifest.toolchain.bun).toBe(Bun.version)
  expect(manifest.toolchain.node).toBe(process.version)
  expect(manifest.commands.build).toBe("bun run build")
  expect(manifest.commands.install).toContain("install-plugin.mjs")
}
