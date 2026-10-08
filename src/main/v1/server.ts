/**
 * OpenCode 1 server entry (bundled to `dist/v1/session-manager.js`). The v1
 * transfer is TUI-only, and v1.18.32 forbids `server` and `tui` in one module,
 * so the server side is an empty hook set in its own file.
 */
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

export default async function plugin(_input: PluginInput): Promise<Hooks> {
  return {}
}
