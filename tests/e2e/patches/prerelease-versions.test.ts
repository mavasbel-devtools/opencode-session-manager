import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout, spyOn } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { magicContextEntry } from "@session-manager/domain/services/Jsonc"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { LocalRegistry, tarball } from "@test/support/patches/registry"
import { Sandbox, write } from "@test/support/patches/sandbox"

// `compareVersions` holds semver 2.0.0 §11 order, so `follow` must too: a prerelease sorts below
// its release, identifiers compare numerically, alphabetically, or by length. These pairs stop in
// detect (`up-to-date`: no install, no proof, no server), except the longer prerelease, which a
// shorter loaded copy is older than and which is adopted for real.
setDefaultTimeout(60_000)

let box: Sandbox
let registry: LocalRegistry
let live: ReturnType<typeof Bun.serve> | null
let env: Record<string, string>

beforeEach(() => {
  box = new Sandbox()
  // Shaped like the real magic-context.jsonc: comments and escaped quotes.
  write(path.join(box.config, "cortexkit", "magic-context.jsonc"), '{\n  // the threshold\n  /* 13 % */ "note": "a \\"q\\"",\n  "execute_threshold_percentage": 13,\n}\n')
  registry = new LocalRegistry([])
  live = box.liveServer()
  const notifier = box.notifier()
  env = box.env({
    OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY: registry.url,
    OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("ok"),
    OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command,
    OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "3000",
    OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS: "10",
  })
})

afterEach(() => {
  live?.stop(true)
  registry.stop()
  box.dispose()
})

/** An installed copy pinned by spec, reporting `loaded` as its version. */
const load = (loaded: string) => {
  const root = box.install("0.49.50", loaded)
  const manifest = path.join(root, "package.json")
  writeFileSync(manifest, JSON.stringify({ ...JSON.parse(readFileSync(manifest, "utf8")), version: loaded }))
  box.pin(loaded)
}

async function follow() {
  const output = new FakeOutput()
  const errors: string[] = []
  const write = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    errors.push(String(chunk).replace(/\n$/, ""))
    return true
  })
  try {
    const code = await (await buildContainer(env as CliEnvironment, { output })).run(["patches", "follow", "--json"])
    return { code, report: JSON.parse(output.text()) as { outcome: string }, err: errors.join("\n") }
  } finally {
    write.mockRestore()
  }
}

/** Serves `latest` (built from the 0.49.50 fixture files), replacing the empty registry. */
const serve = (latest: string) => {
  registry.stop()
  registry = new LocalRegistry([tarball(box.home, "0.49.50", latest)], latest)
  env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY: registry.url }
}

describe("follow compares prereleases in semver order", () => {
  it.each([
    ["0.49.50", "0.49.50-beta.2"],
    ["0.49.50-beta.11", "0.49.50-beta.2"],
    ["0.49.50-beta", "0.49.50-1"],
    ["0.49.50-beta", "0.49.50-alpha"],
    ["0.49.50-beta.1", "0.49.50-beta"],
    ["0.49.50-beta.1", "0.49.50-beta.1"],
  ])("loaded %s stays up to date against npm latest %s", async (loaded, latest) => {    load(loaded)
    serve(latest)
    const { code, report } = await follow()
    expect([code, report.outcome]).toEqual([0, "up-to-date"])
  })

  it("adopts a longer prerelease a shorter loaded copy is older than", async () => {
    load("0.49.50-beta")
    serve("0.49.50-beta.1")
    // A service.json that is not JSON reads as no server: the adoption is confirmed when it starts.
    write(path.join(box.state, "opencode", "service.json"), "not json")
    const { code, report } = await follow()
    expect([code, report.outcome]).toEqual([0, "adopted"])
    expect(magicContextEntry(readFileSync(path.join(box.config, "opencode", "opencode.jsonc"), "utf8"))).toContain(
      "installs/0.49.50-beta.1/",
    )
  })

  it("adopts a non-numeric prerelease a numeric one is older than", async () => {
    load("0.49.50-1")
    serve("0.49.50-beta")
    const { code, report } = await follow()
    expect([code, report.outcome]).toEqual([0, "adopted"])
    expect(magicContextEntry(readFileSync(path.join(box.config, "opencode", "opencode.jsonc"), "utf8"))).toContain(
      "installs/0.49.50-beta/",
    )
  })
})
