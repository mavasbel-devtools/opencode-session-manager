import { homedir, tmpdir } from "node:os"
import { mkdirSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  buildAndVerify,
  checkIntegrity,
  defaultDbPath,
  fileSizes,
  freeBytes,
  guard,
  listProcesses,
  pageStats,
  removeIfExists,
  rollback,
  stamp,
  swap,
} from "./lib.mjs"

const USAGE = "usage: node compact.mjs <preflight|rehearse|run|rollback <backupDir>> [--db <path>] [--keep]"

function parseArgs(argv) {
  const args = { mode: argv[0], positional: [], db: undefined, keep: false }
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--db") args.db = argv[++i]
    else if (argv[i] === "--keep") args.keep = true
    else args.positional.push(argv[i])
  }
  return args
}

function writeReport(file, report) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(report, null, 2))
}

function printChecks(result) {
  for (const [name, passed] of Object.entries(result.checks)) console.log(`${passed ? "PASS" : "FAIL"} ${name}`)
  for (const table of result.comparison.tables.filter((entry) => !entry.match))
    console.log(`  differs: ${table.name} source_rows=${table.source_rows} target_rows=${table.target_rows}`)
}

export function main(argv, env, overrides = {}) {
  const deps = { buildAndVerify, checkIntegrity, ...overrides }
  const args = parseArgs(argv)
  const dbPath = args.db ?? defaultDbPath(env, homedir())
  const image = env.OPENCODE_DB_COMPACT_IMAGE ?? "opencode.exe"
  const when = stamp()
  console.log(`database: ${dbPath}`)

  if (args.mode === "preflight") {
    const report = {
      files: fileSizes(dbPath),
      pages: pageStats(dbPath),
      free_disk_bytes: freeBytes(dirname(dbPath)),
      running: listProcesses(image),
    }
    console.log(JSON.stringify(report, null, 2))
    return 0
  }

  if (args.mode === "rehearse") {
    const directory = env.OPENCODE_DB_COMPACT_REHEARSAL_DIR ?? join(tmpdir(), "opencode", "compact-rehearsal")
    mkdirSync(directory, { recursive: true })
    const target = join(directory, `opencode.db.compact-${when}`)
    const before = { files: fileSizes(dbPath), pages: pageStats(dbPath) }
    const result = deps.buildAndVerify({ source: dbPath, target, strict: false })
    printChecks(result)
    writeReport(join(directory, `report-${when}.json`), { mode: "rehearse", database: dbPath, before, result })
    if (!args.keep) removeIfExists(target)
    console.log(`${result.ok ? "REHEARSAL OK" : "REHEARSAL FAILED"} vacuum_ms=${result.vacuum_ms} total_ms=${result.total_ms} target_bytes=${result.target_bytes}`)
    console.log(`report: ${join(directory, `report-${when}.json`)}`)
    return result.ok ? 0 : 1
  }

  if (args.mode === "run") {
    const pages = pageStats(dbPath)
    const files = fileSizes(dbPath)
    const requiredBytes = 2 * (pages.logical_bytes - pages.free_bytes) + (files[`${basename(dbPath)}-wal`] ?? 0)
    const preGuard = guard({ dbPath, image, requiredBytes })
    const target = `${dbPath}.compact-${when}`
    const result = deps.buildAndVerify({ source: dbPath, target, strict: true })
    printChecks(result)
    if (!result.ok) {
      writeReport(`${target}.report.json`, { mode: "run", database: dbPath, before: { files, pages }, result, swapped: false })
      console.log(`ABORTED: originals untouched; failed copy kept at ${target}`)
      return 1
    }
    guard({ dbPath, image, requiredBytes: 0 })
    const backupDir = join(dirname(dbPath), `db-backup-${when}`)
    const moved = swap({ dbPath, compacted: target, backupDir })
    const after = { integrity: deps.checkIntegrity(dbPath), files: fileSizes(dbPath) }
    writeReport(join(backupDir, "report.json"), { mode: "run", database: dbPath, before: { files, pages }, pre_guard: preGuard, result, moved, after, swapped: true })
    console.log(`SWAPPED backup=${backupDir} before_bytes=${files[basename(dbPath)]} after_bytes=${after.files[basename(dbPath)]} post_integrity_ok=${after.integrity.integrity_ok}`)
    return after.integrity.integrity_ok ? 0 : 1
  }

  if (args.mode === "rollback" && args.positional[0]) {
    const outcome = rollback({ dbPath, backupDir: args.positional[0], image, when })
    console.log(`ROLLED BACK restored=${outcome.restored.join(",")} parked=${outcome.parked}`)
    return 0
  }

  console.log(USAGE)
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2), process.env)
  } catch (error) {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  }
}
