#!/usr/bin/env bun
/**
 * Docs consistency linter (opencode-claude-auth contract, extended to .tsx/.mjs paths):
 *  1. every markdown code fence is balanced
 *  2. mermaid blocks carry no malformed arrows or table rows
 *  3. every repo-relative path referenced in docs (src/…, tests/…, scripts/…, docs/…) exists, except in
 *     docs/reference/, which holds frozen snapshots of the predecessors' docs and their old paths
 *  4. every package.json script named in README.md/AGENTS.md as `bun run <name>` exists
 *  5. README.md and AGENTS.md together name every package.json script as `bun run <name>`, every
 *     environment variable the code reads (OPENCODE_*, XDG_*, MAGIC_CONTEXT_*), and AGENTS.md names
 *     every file under src/ and tests/support/ (by its path below the layer or support folder, or by
 *     its file name when that is unique, or through a mentioned folder written as `dir/` or `dir/*`)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { basename, dirname, join, relative } from "node:path"

const ROOT = join(import.meta.dir, "..")
const failures = []

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git", "coverage"].includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(md|mdx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const docs = walk(ROOT)
const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts))
// Repo-relative only: a path that continues another path (packages/tui/src/…) is an upstream reference.
const pathRef = /(?<![\w./-])(?:src|tests?|scripts|docs)\/[A-Za-z0-9_\-./]+\.(?:tsx|ts|mjs|md|json|js)\b/g

for (const doc of docs) {
  const rel = relative(ROOT, doc)
  const text = readFileSync(doc, "utf8")

  const fences = text.split("\n").filter((line) => line.trimStart().startsWith("```"))
  if (fences.length % 2 !== 0) failures.push(`${rel}: unbalanced code fences (${fences.length})`)

  for (const block of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const body = block[1]
    if (body.includes("->--")) failures.push(`${rel}: malformed arrow '->--' in mermaid block`)
    for (const line of body.split("\n")) if (line.includes("-->") && line.trimStart().startsWith("|")) failures.push(`${rel}: table row inside mermaid block`)
  }

  const frozen = rel.split(/[\\/]/).slice(0, 2).join("/") === "docs/reference"
  for (const match of frozen ? [] : text.matchAll(pathRef)) if (!existsSync(join(ROOT, match[0]))) failures.push(`${rel}: referenced path does not exist: ${match[0]}`)

  if (/^(README|AGENTS)\.md$/.test(rel)) {
    for (const match of text.matchAll(/bun run ([a-z0-9:_-]+)/g)) if (!scripts.has(match[1])) failures.push(`${rel}: unknown script 'bun run ${match[1]}'`)
  }
}

// 5. Nothing the code has goes unmentioned.
const readme = readFileSync(join(ROOT, "README.md"), "utf8")
const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8")
const both = `${readme}\n${agents}`
for (const script of scripts) if (!both.includes(`bun run ${script}`)) failures.push(`README.md/AGENTS.md: script '${script}' is never named as 'bun run ${script}'`)

const tracked = (folder) =>
  spawnSync("git", ["ls-files", folder], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter((line) => line.length > 0)
const variables = new Set()
for (const file of [...tracked("src"), ...tracked("tests"), ...tracked("scripts")]) {
  if (!/\.(tsx?|mjs|js)$/.test(file)) continue
  for (const match of readFileSync(join(ROOT, file), "utf8").matchAll(/\b(?:OPENCODE|XDG|MAGIC_CONTEXT)_[A-Z0-9_]+\b/g)) variables.add(match[0])
}
for (const variable of [...variables].sort()) if (!both.includes(variable)) failures.push(`README.md/AGENTS.md: environment variable ${variable} is never named`)

function unmentioned(folder) {
  const files = tracked(folder).map((file) => relative(join(ROOT, folder), join(ROOT, file)))
  const names = new Map()
  for (const file of files) names.set(basename(file), (names.get(basename(file)) ?? 0) + 1)
  return files.filter((file) => {
    if (agents.includes(file)) return false
    const name = basename(file)
    if (names.get(name) === 1 && agents.includes(name)) return false
    for (let dir = dirname(file); dir !== "."; dir = dirname(dir)) if (agents.includes(`${dir}/\``) || agents.includes(`${dir}/*`)) return false
    return true
  })
}
for (const file of unmentioned("src")) failures.push(`AGENTS.md: src/${file} is missing from the source map`)
for (const file of unmentioned("tests/support")) failures.push(`AGENTS.md: tests/support/${file} is missing from the test support table`)

if (failures.length) {
  console.error(`docs lint FAILED (${failures.length}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`docs lint OK (${docs.length} documents)`)
