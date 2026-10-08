/**
 * OpenCode 2 TUI entry (bundled to `dist/v2/tui.js`), plugin shape
 * `{ id, setup }` (packages/plugin/src/tui/plugin.ts). The host resolves the
 * subpath `tui` in the same plugin directory as the server entry.
 */
import type { V2TuiContext } from "@session-id/infrastructure/host/V2TuiContext"
import { createTuiContainer } from "@session-id/main/tui-container"
import { V2_PLUGIN_ID } from "@session-id/main/plugin-id"

export function setup(context: V2TuiContext): () => void {
  return createTuiContainer().sidebar.register(context)
}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
