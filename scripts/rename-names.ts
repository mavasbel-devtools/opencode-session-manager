/**
 * Replaces renamed folders' names in the files of a workspace, with the same whole-name matcher
 * `relocate --rename` uses on the databases (NameRewriter), and undoes it.
 *
 *   bun scripts/rename-names.ts apply --rename <parent>/<old>=<new>... (--root <dir> | --file <path>)...
 *       [--skip <substring>]... --backup <dir> [--dry-run]
 *   bun scripts/rename-names.ts check --rename ... (--root | --file)... [--skip ...]
 *   bun scripts/rename-names.ts undo --backup <dir>
 *
 * apply: every text file (no NUL in its first 8 KiB, valid UTF-8) under the roots whose text names
 * an old name is rewritten (temporary file + rename, mode kept) after its original is copied into
 * <backup>/files/; then every file or folder whose own name holds an old name is renamed, deepest
 * first; then OpenCode's snapshot stores (`--snapshots <dir>`: `<project>/<sha1(worktree)>`) and Magic
 * Context's project identities (`--identities <dir>`: `<sha256(directory)>.json`) are rewritten and
 * re-keyed to their new paths.
 * Skipped: .git, .venv*, node_modules, __pycache__, SQLite files, binary and non-UTF-8 files (listed
 * when they hold an old name), unreadable paths (listed). <backup>/manifest.json records every
 * change; undo replays it backwards. check: counts the files that still name an old name.
 */
import { createHash } from "node:crypto"
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { NameRewriter } from "@session-manager/domain/services/NameRewriter"
import { renamesFromRules } from "@session-manager/domain/services/RenameRules"
import { parseMapRule } from "@session-manager/domain/services/MapRules"

interface Manifest {
  files: { path: string; backup: string; before: string; after: string }[]
  moves: { from: string; to: string }[]
}

const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__"])
const SKIP_FILE = /\.(db|db-wal|db-shm|db-journal|sqlite|sqlite3|vscdb)$/

const argv = process.argv.slice(2)
const mode = argv.shift()
const many = (name: string) => argv.flatMap((value, index) => (argv[index - 1] === name ? [value] : []))
const one = (name: string) => many(name).at(-1)
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex")
const sha1 = (data: string) => createHash("sha1").update(data).digest("hex")

function fail(message: string): never {
  process.stderr.write(`rename-names: ${message}\n`)
  process.exit(2)
}

if (mode === "undo") {
  const backup = one("--backup") ?? fail("undo needs --backup <dir>")
  const manifest = JSON.parse(readFileSync(join(backup, "manifest.json"), "utf8")) as Manifest
  for (const move of [...manifest.moves].reverse()) {
    if (existsSync(move.from)) fail(`cannot move ${move.to} back: ${move.from} exists`)
    renameSync(move.to, move.from)
  }
  for (const file of [...manifest.files].reverse()) {
    const mode = statSync(file.path).mode
    const temporary = `${file.path}.rename-names-undo`
    copyFileSync(file.backup, temporary)
    chmodSync(temporary, mode)
    renameSync(temporary, file.path)
  }
  process.stdout.write(`undone: ${manifest.files.length} files restored, ${manifest.moves.length} names moved back\n`)
  process.exit(0)
}
if (mode !== "apply" && mode !== "check") fail("usage: apply | check | undo (see the header of scripts/rename-names.ts)")

const { renames } = renamesFromRules(many("--rename").map(parseMapRule))
if (renames.length === 0) fail("no --rename rule")
const rewriter = new NameRewriter(renames)
const needles = renames.map((rename) => Buffer.from(rename.from))
const skips = many("--skip")
const dryRun = argv.includes("--dry-run")
const backup = mode === "apply" ? (one("--backup") ?? fail("apply needs --backup <dir>")) : ""
if (mode === "apply" && !dryRun && existsSync(join(backup, "manifest.json"))) fail(`${backup} already holds a run`)

const manifest: Manifest = { files: [], moves: [] }
const report = { changedFiles: 0, replacements: 0, renamed: [] as string[], binary: [] as string[], nonUtf8: [] as string[], unreadable: [] as string[], refused: [] as string[], residual: [] as string[] }
const entries: string[] = []

function save() {
  if (mode !== "apply" || dryRun) return
  mkdirSync(backup, { recursive: true })
  writeFileSync(join(backup, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`)
}

function writeText(path: string, text: string, original: Buffer) {
  if (dryRun) return
  const stored = join(backup, "files", sha256(original))
  mkdirSync(dirname(stored), { recursive: true })
  if (!existsSync(stored)) writeFileSync(stored, original)
  const temporary = join(dirname(path), `.${basename(path)}.rename-names-${process.pid}`)
  writeFileSync(temporary, text)
  chmodSync(temporary, statSync(path).mode)
  renameSync(temporary, path)
  manifest.files.push({ path, backup: stored, before: sha256(original), after: sha256(text) })
  save()
}

function visitFile(path: string) {
  if (skips.some((skip) => path.includes(skip))) return
  let data: Buffer
  try {
    data = readFileSync(path)
  } catch {
    report.unreadable.push(path)
    return
  }
  const named = needles.some((needle) => data.includes(needle))
  if (!named) return
  if (SKIP_FILE.test(path) || data.subarray(0, 8192).includes(0)) {
    report.binary.push(path)
    return
  }
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    report.nonUtf8.push(path)
    return
  }
  const rewritten = rewriter.rewrite(text)
  if (mode === "check") {
    if (rewriter.residual(text)) report.residual.push(path)
    return
  }
  if (rewritten === text) return
  report.changedFiles++
  report.replacements += text.length === 0 ? 0 : countDifferences(text)
  writeText(path, rewritten, data)
}

function countDifferences(text: string): number {
  let count = 0
  for (const rename of renames) count += text.split(rename.from).length - 1
  return count
}

function walk(path: string) {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    report.unreadable.push(path)
    return
  }
  entries.push(path)
  if (stat.isSymbolicLink()) return
  if (stat.isFile()) return visitFile(path)
  if (!stat.isDirectory()) return
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    report.unreadable.push(path)
    return
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name) || name.startsWith(".venv")) continue
    walk(join(path, name))
  }
}

function move(from: string, to: string) {
  if (from === to) return
  if (existsSync(to)) {
    report.refused.push(`${from} -> ${to} (exists)`)
    return
  }
  report.renamed.push(`${from} -> ${to}`)
  if (dryRun || mode === "check") return
  renameSync(from, to)
  manifest.moves.push({ from, to })
  save()
}

const roots = many("--root")
for (const root of roots) walk(root)
for (const file of many("--file")) if (existsSync(file)) visitFile(file)

// Own names, deepest first, so a parent's rename never invalidates a child's path.
if (mode === "apply")
  for (const entry of [...entries].sort((a, b) => b.split("/").length - a.split("/").length)) {
    if (roots.includes(entry)) continue
    const renamed = rewriter.rewrite(basename(entry))
    if (renamed !== basename(entry)) move(entry, join(dirname(entry), renamed))
  }

// OpenCode snapshot stores and Magic Context identities are keyed by a hash of the folder path.
for (const root of many("--snapshots")) {
  if (!existsSync(root)) continue
  for (const project of readdirSync(root))
    for (const store of readdirSync(join(root, project))) {
      const config = join(root, project, store, "config")
      if (!existsSync(config)) continue
      const worktree = /^\s*worktree = (.*)$/m.exec(readFileSync(config, "utf8"))?.[1]
      if (worktree === undefined || rewriter.rewrite(worktree) === worktree) continue
      if (store !== sha1(worktree)) {
        report.refused.push(`${join(root, project, store)} (not sha1 of ${worktree})`)
        continue
      }
      visitFile(config)
      visitFile(join(root, project, store, "objects", "info", "alternates"))
      if (mode === "apply") move(join(root, project, store), join(root, project, sha1(rewriter.rewrite(worktree))))
    }
}
for (const root of many("--identities")) {
  if (!existsSync(root)) continue
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const directory = (JSON.parse(readFileSync(path, "utf8")) as { directory?: string }).directory
    if (directory === undefined || rewriter.rewrite(directory) === directory) continue
    if (name !== `${sha256(directory)}.json`) {
      report.refused.push(`${path} (not sha256 of ${directory})`)
      continue
    }
    visitFile(path)
    if (mode === "apply") move(path, join(root, `${sha256(rewriter.rewrite(directory))}.json`))
  }
}

save()
const out = { mode, dryRun, ...report, backup: mode === "apply" && !dryRun ? backup : null }
const reportPath = one("--report")
if (reportPath !== undefined) writeFileSync(reportPath, `${JSON.stringify(out, null, 1)}\n`)
process.stdout.write(
  `${mode}${dryRun ? " (dry run)" : ""}: ${report.changedFiles} files rewritten (${report.replacements} occurrences), ${report.renamed.length} renamed, ` +
    `${report.binary.length} binary + ${report.nonUtf8.length} non-UTF-8 left, ${report.unreadable.length} unreadable, ${report.refused.length} refused` +
    (mode === "check" ? `, residual ${report.residual.length}` : "") +
    "\n",
)
process.exit(report.refused.length === 0 && (mode !== "check" || report.residual.length === 0) ? 0 : 1)
