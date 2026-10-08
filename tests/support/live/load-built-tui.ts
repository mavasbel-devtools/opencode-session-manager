// Loads a built tui.js the way OpenCode 2.0.14 does, in a fresh process:
// packages/tui/src/plugin/runtime-plugin-support.bun.ts registers the OpenTUI
// runtime modules (and the Solid transform with runtime-id rewriting) before any
// plugin is imported; packages/tui/src/plugin/context.tsx then imports the
// module and accepts it only when `default` is `{ id: non-empty string, setup: function }`.
import { pathToFileURL } from "node:url"
import { Plugin, PluginContextProvider, usePlugin } from "@opencode/plugin/tui"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"

ensureRuntimePluginSupport({
  additional: {
    "@opencode/plugin/tui": { Plugin, PluginContextProvider, usePlugin },
  },
})

const { testRender } = await import("@opentui/solid")
const { RGBA } = await import("@opentui/core")

const [file, sessionID] = process.argv.slice(2) as [string, string]
const mod = (await import(pathToFileURL(file).href)) as { default?: { id?: unknown; setup?: unknown } }
const value = mod.default
const isPlugin =
  typeof value === "object" && value !== null && typeof value.id === "string" && value.id.length > 0 && typeof value.setup === "function"

const claims: Array<{ prepend?: string; render: (input: { sessionID: string }) => unknown }> = []
let disposed = 0
const context = {
  theme: { text: { muted: RGBA.fromHex("#808080") } },
  ui: {
    slot(claim: (typeof claims)[number]) {
      claims.push(claim)
      return () => {
        disposed++
      }
    },
  },
}
const cleanup = (value!.setup as (ctx: typeof context) => () => void)(context)
const setup = await testRender(() => claims[0]!.render({ sessionID }) as never, { width: 37, height: 3 })
await setup.renderOnce()
const span = setup.captureSpans().lines[0]!.spans.find((entry) => entry.text.includes(sessionID))
const fg = span ? `#${span.fg.toInts().slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("")}` : null
const line = setup.captureCharFrame().split("\n")[0]!.trimEnd()
setup.renderer.destroy()
cleanup()
console.log(JSON.stringify({ isPlugin, id: value?.id, claims: claims.map((claim) => Object.keys(claim).sort()), prepend: claims[0]?.prepend, line, fg, disposed }))
process.exit(0)
