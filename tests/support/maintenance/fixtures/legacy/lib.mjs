import { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readSync, openSync, closeSync, renameSync, rmSync, statSync, statfsSync } from "node:fs"
import { basename, dirname, join } from "node:path"

export const SIDECARS = ["", "-wal", "-shm"]

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
}

export function defaultDbPath(env, home) {
  const data = env.XDG_DATA_HOME ? env.XDG_DATA_HOME : join(home, ".local", "share")
  return join(data, "opencode", "opencode.db")
}

export function fileSizes(dbPath) {
  return Object.fromEntries(SIDECARS.map((suffix) => [basename(dbPath) + suffix, existsSync(dbPath + suffix) ? statSync(dbPath + suffix).size : null]))
}

export function freeBytes(directory, statfs = statfsSync) {
  const info = statfs(directory)
  return info.bavail * info.bsize
}

export function parseTasklist(csv) {
  return csv
    .split(/\r?\n/)
    .map((line) => line.match(/^"([^"]*)","(\d+)"/))
    .filter((match) => match !== null)
    .map((match) => ({ image: match[1], pid: Number(match[2]) }))
}

export function listProcesses(image, exec = execFileSync) {
  const csv = exec("tasklist", ["/fo", "csv", "/nh", "/fi", `imagename eq ${image}`], { encoding: "utf8" })
  return parseTasklist(csv).filter((entry) => entry.image.toLowerCase() === image.toLowerCase())
}

/** Renames the file away and back. Windows refuses (EBUSY) while any SQLite connection holds it open. */
export function assertNotHeld(dbPath) {
  const probe = `${dbPath}.lockprobe-${process.pid}`
  try {
    renameSync(dbPath, probe)
  } catch (error) {
    throw new Error(`${dbPath} is held open by another process (${error.code}); close every OpenCode process first`)
  }
  renameSync(probe, dbPath)
}

export function pageStats(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const get = (pragma) => Object.values(db.prepare(`pragma ${pragma}`).get())[0]
    const pageSize = get("page_size")
    return {
      page_size: pageSize,
      page_count: get("page_count"),
      freelist_count: get("freelist_count"),
      logical_bytes: pageSize * get("page_count"),
      free_bytes: pageSize * get("freelist_count"),
      auto_vacuum: get("auto_vacuum"),
    }
  } finally {
    db.close()
  }
}

/** Header bytes 18/19 are 2/2 for WAL and 1/1 for rollback-journal databases. */
export function headerJournalMode(dbPath) {
  const fd = openSync(dbPath, "r")
  try {
    const header = Buffer.alloc(20)
    readSync(fd, header, 0, 20, 0)
    return header[18] === 2 && header[19] === 2 ? "wal" : "delete"
  } finally {
    closeSync(fd)
  }
}

function encodeValue(value) {
  if (value instanceof Uint8Array) return { b: Buffer.from(value).toString("hex") }
  if (typeof value === "bigint") return { i: value.toString() }
  return value
}

function orderColumns(db, table) {
  const columns = db.prepare(`pragma table_info("${table.replaceAll('"', '""')}")`).all()
  const keys = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk)
  return (keys.length ? keys : columns).map((column) => `"${column.name.replaceAll('"', '""')}"`)
}

/** Schema, header values and a SHA-256 over every row of every table, rows ordered by primary key (or all columns). */
export function fingerprint(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const schema = db.prepare("select type, name, tbl_name, sql from sqlite_master order by type, name").all()
    const header = {
      user_version: db.prepare("pragma user_version").get().user_version,
      application_id: db.prepare("pragma application_id").get().application_id,
    }
    const tables = {}
    for (const { name } of schema.filter((entry) => entry.type === "table")) {
      const quoted = `"${name.replaceAll('"', '""')}"`
      const statement = db.prepare(`select * from ${quoted} order by ${orderColumns(db, name).join(", ")}`)
      statement.setReadBigInts(true)
      const hash = createHash("sha256")
      let rows = 0
      for (const row of statement.iterate()) {
        const line = JSON.stringify(Object.entries(row).map(([key, value]) => [key, encodeValue(value)]))
        hash.update(`${line.length}:${line}\n`)
        rows++
      }
      tables[name] = { rows, sha256: hash.digest("hex") }
    }
    return { schema, header, tables }
  } finally {
    db.close()
  }
}

export function compareFingerprints(source, target) {
  const failures = []
  if (JSON.stringify(source.schema) !== JSON.stringify(target.schema)) failures.push("schema differs")
  if (JSON.stringify(source.header) !== JSON.stringify(target.header)) failures.push("user_version/application_id differ")
  const names = [...new Set([...Object.keys(source.tables), ...Object.keys(target.tables)])].sort()
  const tables = names.map((name) => {
    const a = source.tables[name]
    const b = target.tables[name]
    const match = a !== undefined && b !== undefined && a.rows === b.rows && a.sha256 === b.sha256
    if (!match) failures.push(`table ${name} differs`)
    return { name, source_rows: a?.rows ?? null, target_rows: b?.rows ?? null, match }
  })
  return { ok: failures.length === 0, failures, tables }
}

export function checkIntegrity(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const integrity = db.prepare("pragma integrity_check").all().map((row) => row.integrity_check)
    const foreignKeys = db.prepare("pragma foreign_key_check").all()
    return {
      integrity_ok: integrity.length === 1 && integrity[0] === "ok",
      integrity,
      foreign_key_violations: foreignKeys.length,
    }
  } finally {
    db.close()
  }
}

/** VACUUM INTO from a read-only connection: the source file is never written. */
export function vacuumInto(source, target) {
  if (existsSync(target)) throw new Error(`refusing to overwrite existing ${target}`)
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    db.prepare("vacuum into ?").run(target)
  } finally {
    db.close()
  }
}

export function setWal(dbPath) {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec("pragma journal_mode = wal")
  } finally {
    db.close()
  }
}

/**
 * Builds the compacted copy and proves it. Returns the evidence; `ok` is false when any check fails.
 * `strict` (offline run) requires exact per-table parity; otherwise drift from a live source is reported only.
 */
export function buildAndVerify({ source, target, strict, now = () => Date.now(), afterVacuum = () => {} }) {
  const started = now()
  vacuumInto(source, target)
  const vacuumMs = now() - started
  afterVacuum(target)
  const integrity = checkIntegrity(target)
  const pages = pageStats(target)
  const comparison = compareFingerprints(fingerprint(source), fingerprint(target))
  setWal(target)
  const leftovers = ["-wal", "-shm"].filter((suffix) => existsSync(target + suffix))
  const checks = {
    integrity_ok: integrity.integrity_ok,
    foreign_keys_ok: integrity.foreign_key_violations === 0,
    freelist_zero: pages.freelist_count === 0,
    parity_ok: comparison.ok,
    journal_wal: headerJournalMode(target) === "wal",
    no_target_sidecars: leftovers.length === 0,
  }
  const required = strict ? Object.values(checks) : Object.entries(checks).filter(([key]) => key !== "parity_ok").map(([, value]) => value)
  return {
    ok: required.every(Boolean),
    checks,
    vacuum_ms: vacuumMs,
    total_ms: now() - started,
    target_bytes: statSync(target).size,
    target_pages: pages,
    integrity,
    comparison,
  }
}

export function guard({ dbPath, image, processes = listProcesses, statfs = statfsSync, requiredBytes }) {
  const running = processes(image)
  if (running.length) throw new Error(`${image} is running (PIDs ${running.map((entry) => entry.pid).join(", ")}); close it and run "opencode service stop"`)
  if (!existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`)
  assertNotHeld(dbPath)
  const free = freeBytes(dirname(dbPath), statfs)
  if (free < requiredBytes) throw new Error(`not enough free disk space: ${free} B free, ${requiredBytes} B required`)
  return { free_bytes: free }
}

/** Moves the database and its sidecars into `backupDir`, then moves `compacted` into place. Restores on failure. */
export function swap({ dbPath, compacted, backupDir, rename = renameSync }) {
  mkdirSync(backupDir, { recursive: true })
  const moved = []
  try {
    for (const suffix of SIDECARS) {
      if (!existsSync(dbPath + suffix)) continue
      rename(dbPath + suffix, join(backupDir, basename(dbPath) + suffix))
      moved.push(suffix)
    }
    rename(compacted, dbPath)
  } catch (error) {
    for (const suffix of moved) renameSync(join(backupDir, basename(dbPath) + suffix), dbPath + suffix)
    throw new Error(`swap failed and the original files were restored: ${error.message}`)
  }
  return moved.map((suffix) => basename(dbPath) + suffix)
}

export function rollback({ dbPath, backupDir, image, processes = listProcesses, when = stamp() }) {
  const original = join(backupDir, basename(dbPath))
  if (!existsSync(original)) throw new Error(`no original database in ${backupDir}`)
  const running = processes(image)
  if (running.length) throw new Error(`${image} is running (PIDs ${running.map((entry) => entry.pid).join(", ")}); close it first`)
  const parked = join(backupDir, `rolled-back-${when}`)
  mkdirSync(parked, { recursive: true })
  if (existsSync(dbPath)) assertNotHeld(dbPath)
  for (const suffix of SIDECARS) if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, join(parked, basename(dbPath) + suffix))
  const restored = []
  for (const suffix of SIDECARS) {
    const file = join(backupDir, basename(dbPath) + suffix)
    if (!existsSync(file)) continue
    renameSync(file, dbPath + suffix)
    restored.push(basename(dbPath) + suffix)
  }
  return { restored, parked }
}

export function removeIfExists(file) {
  rmSync(file, { force: true })
}
