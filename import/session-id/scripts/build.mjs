// Builds dist/v2/server.js and dist/v2/tui.js for the OpenCode 2.0.14 host.
//
// The TUI bundle must bind the host's single Solid/OpenTUI runtime: the host
// registers `opentui:runtime-module:*` virtual modules process-wide
// (packages/tui/src/plugin/runtime-plugin-support.bun.ts), and a second bundled
// copy of solid-js would not share reactive ownership with the host tree. So
// .tsx is compiled with the official OpenTUI Solid transform pointed at those
// runtime ids, and every runtime id stays external.
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import { isCoreRuntimeModuleSpecifier, runtimeModuleIdForSpecifier } from "@opentui/core/runtime-plugin"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outdir = path.join(project, "dist", "v2")

// The specifiers @opentui/solid 0.5.10 `ensureRuntimePluginSupport` registers by
// default, plus the one OpenCode 2.0.14 adds (`additional`).
export const HOST_RUNTIME_SPECIFIERS = new Set([
  "@opentui/solid",
  "@opentui/solid/components",
  "@opentui/solid/jsx-runtime",
  "@opentui/solid/jsx-dev-runtime",
  "solid-js",
  "solid-js/store",
  "@opencode/plugin/tui",
])

const hostRuntimeSpecifier = (specifier) => isCoreRuntimeModuleSpecifier(specifier) || HOST_RUNTIME_SPECIFIERS.has(specifier)

const runtimeIds = {
  name: "opentui-runtime-modules",
  setup(build) {
    build.onResolve({ filter: /^opentui:runtime-module:/ }, (args) => ({ path: args.path, external: true }))
    build.onResolve({ filter: /.*/ }, (args) =>
      hostRuntimeSpecifier(args.path) ? { path: runtimeModuleIdForSpecifier(args.path), external: true } : undefined,
    )
  },
}

async function bundle(entry, file, plugins) {
  const result = await Bun.build({
    entrypoints: [path.join(project, "src", "main", entry)],
    outdir,
    naming: file,
    target: "bun",
    format: "esm",
    plugins,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`build failed: ${entry}`)
  }
}

/**
 * Every named import the bundle takes from a runtime module must exist on the
 * real module the host maps it to; otherwise the host fails the import at load
 * and silently drops the sidebar. Checked against the pinned packages.
 */
export async function assertRuntimeImports(file) {
  const code = await Bun.file(file).text()
  const pattern = /import\s*\{([^}]*)\}\s*from\s*"(opentui:runtime-module:[^"]+)"/g
  const problems = []
  const seen = []
  for (const [, names, id] of code.matchAll(pattern)) {
    const specifier = decodeURIComponent(id.slice("opentui:runtime-module:".length))
    const exported = new Set(Object.keys(await import(specifier)))
    for (const raw of names.split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0]
      if (!name) continue
      seen.push(`${specifier}#${name}`)
      if (!exported.has(name)) problems.push(`${specifier} has no export '${name}'`)
    }
  }
  if (/from\s*"(solid-js|@opentui\/[^"]+)"/.test(code)) problems.push("bundle imports solid-js/@opentui by package name")
  if (/createRenderEffect|sharedConfig/.test(code) && !seen.length) problems.push("bundle appears to inline a Solid runtime copy")
  if (problems.length) throw new Error(`${path.basename(file)}: ${problems.join("; ")}`)
  return seen
}

if (import.meta.main) {
  await rm(outdir, { recursive: true, force: true })
  await bundle(path.join("v2", "server.ts"), "server.js", [])
  await bundle(path.join("v2", "tui.ts"), "tui.js", [
    runtimeIds,
    createSolidTransformPlugin({
      moduleName: runtimeModuleIdForSpecifier("@opentui/solid"),
      resolvePath: (specifier) => (hostRuntimeSpecifier(specifier) ? runtimeModuleIdForSpecifier(specifier) : null),
    }),
  ])
  const imports = await assertRuntimeImports(path.join(outdir, "tui.js"))
  console.log(JSON.stringify({ outdir, runtimeImports: imports }, null, 2))
}
