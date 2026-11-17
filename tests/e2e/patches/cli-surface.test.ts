import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { bootstrap } from "@session-manager/main/cli/cli"
import { PATCHES_HELP } from "@session-manager/infrastructure/adapters/inbound/cli/PatchesCliAdapter"
import manifest from "@package-json"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { removeTemporarySync } from "@test/support/live/process"
import { Sandbox } from "@test/support/patches/sandbox"

/**
 * Every row of Appendix B through `opencode-session-manager patches …`: the usage text, every
 * flag, every exit code, and the D19 output shapes (program name, `--version`, `ERROR:`).
 */
let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

async function run(extra: Record<string, string>, ...argv: string[]) {
  const output = new FakeOutput()
  const errors: string[] = []
  const write = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    errors.push(String(chunk).replace(/\n$/, ""))
    return true
  })
  try {
    const code = await (await buildContainer({ ...box.env(), ...extra } as CliEnvironment, { output })).run(["patches", ...argv])
    return { code, out: output.text(), err: errors.join("\n") }
  } finally {
    write.mockRestore()
  }
}

const KNOWN = PATCHES_HELP.split("\n")[0]

describe("patches command surface", () => {
  it("names the program and every command in --help, and prints the version like the top level", async () => {
    expect(KNOWN).toContain("opencode-session-manager patches")
    expect(PATCHES_HELP).toContain("exit codes: 0 ok, 1 not ok / refused / failed / stopped, 2 usage error.")
    for (const command of ["status", "apply", "undo", "check", "inspect", "effect", "notify", "follow"]) {
      expect(PATCHES_HELP).toContain(command)
    }
    expect((await run({}, "--help"))).toEqual({ code: 0, out: PATCHES_HELP, err: "" })
    expect((await run({}, "--version"))).toEqual({ code: 0, out: `opencode-session-manager ${manifest.version}`, err: "" })
    const top = new FakeOutput()
    await (await buildContainer(box.env() as CliEnvironment, { output: top })).run(["--help"])
    expect(top.text()).toContain("patches <status|apply|undo|check|inspect|effect|notify|follow> [--json] ...")
  })

  it("status reports every patch on every installed copy, as text and JSON", async () => {
    expect(await run({}, "status")).toEqual({
      code: 0,
      out: "OpenCode loads Magic Context: (not configured in opencode.jsonc)\ninstalled copies:\n  (none)\npatches:",
      err: "",
    })
    box.install("0.47.0")
    box.pin("0.47.0")
    const status = await run({}, "status", "--json")
    expect(status.code).toBe(0)
    expect(Object.keys(JSON.parse(status.out)).sort()).toEqual(["installations", "loadedSpec", "patches"])
    expect((await run({}, "status")).out).toContain("execute-threshold-min on 0.47.0 (loaded): not-applied")
  })

  it("apply and undo take --patch, --version and --json, and refuse unknown patches", async () => {
    box.install("0.47.0")
    box.pin("0.47.0")
    expect(await run({}, "apply", "--patch", "nope")).toEqual({
      code: 2,
      out: "",
      err: "usage error: unknown patch nope; known: execute-threshold-min, no-session-model-fallback, refusal-recovery, fold-identity-stable, fold-provenance-heal\nrun with --help for usage",
    })
    expect((await run({}, "apply", "--patch", "execute-threshold-min", "--version", "9.9.9")).err).toBe(
      "error: Magic Context 9.9.9 is not installed",
    )
    const applied = await run({}, "apply", "--patch", "execute-threshold-min", "--json")
    expect([applied.code, JSON.parse(applied.out).results[0].outcome]).toEqual([0, "applied"])
    const undone = await run({}, "undo", "--patch", "execute-threshold-min", "--json")
    expect([undone.code, JSON.parse(undone.out).results[0].outcome]).toEqual([0, "reverted"])
  })

  it("check exits 0 only when every patch is applied on the loaded copy", async () => {
    box.install("0.49.50")
    box.pin("0.49.50")
    expect((await run({}, "check")).code).toBe(1)
    expect(JSON.parse((await run({}, "check", "--json")).out)).toMatchObject({ ok: false })
    expect((await run({}, "apply")).code).toBe(0)
    expect((await run({}, "check")).out).toBe("OK: every patch is applied on the loaded Magic Context (0.49.50)")
  })

  it("inspect needs --version and reviews a version the patch was not checked against", async () => {
    expect((await run({}, "inspect")).err).toBe("usage error: inspect needs --version <v>\nrun with --help for usage")
    expect((await run({}, "inspect", "--version", "9.9.9")).err).toBe("error: Magic Context 9.9.9 is not installed")
    box.install("0.47.0")
    const inspected = await run({}, "inspect", "--version", "0.47.0", "--json")
    expect(inspected.code).toBe(0)
    expect(JSON.parse(inspected.out).version).toBe("0.47.0")
  })

  it("effect takes --since and --json, and rejects a bad --since", async () => {
    box.threshold(13)
    const effect = await run({}, "effect", "--json")
    expect(effect.code).toBe(1)
    expect(Object.keys(JSON.parse(effect.out)).sort()).toEqual(["configured", "log", "since", "summary", "verdict"])
    expect(JSON.parse(effect.out).verdict).toBe("no-data")
    expect((await run({}, "effect", "--since", "not-a-time")).err).toBe("usage error: --since not-a-time is not a date and time\nrun with --help for usage")
  })

  it("notify takes --json, and stays quiet once everything is applied", async () => {
    box.install("0.49.50")
    box.pin("0.49.50")
    const notifier = box.notifier()
    expect((await run({ OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command }, "notify")).code).toBe(1)
    const quiet = await run({ OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command }, "notify", "--json")
    expect(quiet.code).toBe(1)
    expect(JSON.parse(quiet.out)).toMatchObject({ ok: false })
    expect((await run({}, "apply")).code).toBe(0)
    expect(await run({ OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command }, "notify")).toEqual({
      code: 0,
      out: "OK: nothing to notify",
      err: "",
    })
  })

  it("follow takes --version or --rollback with --json, never both, and reports an empty rollback", async () => {
    expect((await run({}, "follow", "--version", "1.0.0", "--rollback")).err).toBe("usage error: follow takes --rollback or --version, not both\nrun with --help for usage")
    expect((await run({}, "follow", "--bogus")).err).toContain("usage error:")
    const empty = await run({}, "follow", "--rollback")
    expect(empty.code).toBe(1)
    expect(empty.out.split("\n")[0]).toBe("follow: stopped")
    const report = JSON.parse((await run({}, "follow", "--rollback", "--json")).out)
    expect([report.outcome, report.steps.at(-1)]).toEqual(["stopped", expect.objectContaining({ step: "rollback", ok: false, detail: "no previous entry is recorded: follow has not adopted anything" })])
  })

  it("an unexpected error is reported as ERROR: with exit 1", async () => {
    const config = path.join(box.config, "opencode", "opencode.jsonc")
    mkdirSync(path.dirname(config), { recursive: true })
    removeTemporarySync(config)
    mkdirSync(config)
    const errors: string[] = []
    const write = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      errors.push(String(chunk))
      return true
    })
    const logged: unknown[] = []
    const error = spyOn(console, "error").mockImplementation((...args: unknown[]) => void logged.push(args))
    try {
      await expect(bootstrap(["patches", "status"], box.env() as CliEnvironment)).resolves.toBe(1)
      expect(logged.length + errors.length).toBeGreaterThan(0)
      expect([...logged.flat().map(String), ...errors].join("")).toContain("ERROR:")
    } finally {
      write.mockRestore()
      error.mockRestore()
    }
    expect(existsSync(config)).toBe(true)
  })
})
