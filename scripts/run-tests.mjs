import { globSync } from "node:fs"
import { spawnSync } from "node:child_process"

const tier = process.argv[2]
const TIERS = ["unit", "component", "e2e", "live"]
if (!tier || !TIERS.includes(tier)) {
  console.error(`usage: node scripts/run-tests.mjs <${TIERS.join("|")}>`)
  process.exit(2)
}

const files = globSync(`tests/${tier}/**/*.test.ts`).sort()
if (files.length === 0) {
  console.error(`no test files found under tests/${tier}`)
  process.exit(1)
}

const result = spawnSync(process.execPath, ["--no-warnings", "--test", ...files], { stdio: "inherit" })
process.exit(result.status ?? 1)
