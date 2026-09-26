/**
 * OpenCode 2 server entry (bundled to `dist/v2/server.js`).
 *
 * The transfer work is TUI-only, but a v2 directory plugin is admitted through
 * its server entry: `PluginModule.load` (packages/core/src/plugin/module.ts)
 * resolves `<dir>/server` (or `<dir>/index`), requires a default export with
 * an `id` plus a `setup` or `effect` function, and advertises `features.tui`
 * when `<dir>/tui` exists — which is how the TUI gets `dist/v2/tui.js` loaded
 * (packages/tui/src/plugin/context.tsx `serverTuiPlugins`).
 *
 * Kept separate from the v1 server entry on purpose: a v1 host's core layer
 * also adopts `{ id, setup }` default exports, so the v1 bundle must not carry
 * this shape.
 */
export const V2_PLUGIN_ID = "opencode-sessions-transfer"

export async function setup(): Promise<void> {}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
