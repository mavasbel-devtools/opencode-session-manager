/**
 * OpenCode 2 TUI entry (bundled to `dist/v2/tui.js`), plugin shape
 * `{ id, setup }` (packages/plugin/src/tui/plugin.ts). The host resolves the
 * subpath `tui` in the same plugin directory as the server entry.
 *
 * Registers the session ID line at the top of the sidebar and the
 * `/transfer-session` command; the returned cleanup removes both.
 */
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { createTuiContainer } from "@session-manager/main/tui-container"
import { V2_PLUGIN_ID } from "@session-manager/main/plugin-id"

export function setup(context: V2TuiContext): () => void {
  const container = createTuiContainer(context.client)
  const disposers = [container.sidebar.register(context), container.transfer.register(context)]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
