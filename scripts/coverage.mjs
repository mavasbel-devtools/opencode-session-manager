#!/usr/bin/env bun
// Runs one measured tier under the per-file 100 % coverage gate.
//
// unit: every src file, with bunfig.coverage.toml.
// e2e: per platform. The e2e tier runs the real operating-system adapters, which only work on their
// own platform, so each platform gates its own files and leaves the other platforms' adapters and
// containers to their own e2e run (bunfig.coverage.e2e-<platform>.toml; see AGENTS.md, platform law).
import { existsSync } from "node:fs"

const tier = process.argv[2]
const configs = {
  unit: "bunfig.coverage.toml",
  e2e: `bunfig.coverage.e2e-${process.platform}.toml`,
}
const config = configs[tier]
if (config === undefined) {
  console.error(`usage: bun scripts/coverage.mjs <${Object.keys(configs).join("|")}>`)
  process.exit(2)
}
if (!existsSync(config)) {
  console.error(`no e2e coverage configuration for ${process.platform} (${config})`)
  process.exit(1)
}
const run = Bun.spawnSync([process.execPath, `--config=${config}`, "test", "--max-concurrency=1", "--timeout=300000", `tests/${tier}`], {
  stdio: ["inherit", "inherit", "inherit"],
})
process.exit(run.exitCode ?? 1)
