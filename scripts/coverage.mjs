import { globSync, mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const tier = process.argv[2]
const TIERS = ["unit", "e2e"]
if (!tier || !TIERS.includes(tier)) {
  console.error(`usage: node scripts/coverage.mjs <${TIERS.join("|")}> (the measured tiers)`)
  process.exit(2)
}

const files = globSync(`tests/${tier}/**/*.test.ts`).sort()
if (files.length === 0) {
  console.error(`no test files found under tests/${tier}`)
  process.exit(1)
}

mkdirSync("coverage", { recursive: true })
const lcov = `coverage/${tier}.lcov`
const result = spawnSync(
  process.execPath,
  [
    "--no-warnings",
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include=src/**/*.ts",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcov}`,
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    ...files,
  ],
  { stdio: "inherit" },
)
if (result.status !== 0) {
  console.error(`tests failed (exit ${result.status}); coverage not evaluated`)
  process.exit(result.status ?? 1)
}

if (!globSync(lcov).length) {
  console.error(`no coverage report was written to ${lcov}`)
  process.exit(1)
}

const number = (record, key) => {
  const match = record.match(new RegExp(`^${key}:(\\d+)$`, "m"))
  return match ? Number(match[1]) : 0
}

const records = readFileSync(lcov, "utf8").split("end_of_record")
const rows = []
for (const record of records) {
  const match = record.match(/^SF:(.+)$/m)
  if (!match) continue
  rows.push({
    file: match[1].trim(),
    linesHit: number(record, "LH"),
    linesTotal: number(record, "LF"),
    funcsHit: number(record, "FNH"),
    funcsTotal: number(record, "FNF"),
  })
}

if (rows.length === 0) {
  console.error(`coverage report ${lcov} contained no source files`)
  process.exit(1)
}

/**
 * Platform law (AGENTS.md): code for one operating system lives only under
 * src/infrastructure/adapters/outbound/platform/<platform>/ and in src/main/platform/<platform>.ts.
 * The unit tier runs every platform's code with stand-ins and is gated on every file. The e2e tier
 * runs the real system, so it is gated on this platform's files and does not count another
 * platform's — those are gated by the e2e run on their own platform.
 */
const PLATFORMS = ["linux", "win32"]
const foreign = (file) => {
  const path = `/${file.replaceAll("\\", "/")}`
  return PLATFORMS.filter((name) => name !== process.platform).some(
    (name) => path.includes(`/src/infrastructure/adapters/outbound/platform/${name}/`) || path.endsWith(`/src/main/platform/${name}.ts`),
  )
}
const skipped = tier === "e2e" ? rows.filter((row) => foreign(row.file)) : []
if (tier === "e2e" && !PLATFORMS.includes(process.platform)) {
  console.error(`the e2e coverage gate runs on ${PLATFORMS.join(" or ")}, not ${process.platform}`)
  process.exit(1)
}

const failures = []
for (const row of rows.filter((row) => !skipped.includes(row))) {
  if (row.linesTotal === 0) {
    failures.push(`${row.file}: no executable lines were loaded (an unloaded source file escapes the gate)`)
    continue
  }
  if (row.linesHit !== row.linesTotal) failures.push(`${row.file}: lines ${row.linesHit}/${row.linesTotal}`)
  if (row.funcsTotal > 0 && row.funcsHit !== row.funcsTotal) failures.push(`${row.file}: functions ${row.funcsHit}/${row.funcsTotal}`)
}

if (failures.length) {
  console.error(`per-file coverage FAILED (${failures.length}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`per-file coverage OK (${rows.length - skipped.length} source files at 100% lines and functions)`)
if (skipped.length) console.log(`  not gated on ${process.platform} (another platform's code): ${skipped.length} files`)
