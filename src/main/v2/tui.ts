/**
 * OpenCode 2 TUI entry (bundled to `dist/v2/tui.js`), plugin shape
 * `{ id, setup }` (packages/plugin/src/tui/plugin.ts). The host resolves the
 * subpath `tui` in the same plugin directory as the server entry.
 *
 * Registers the session ID line at the top of the sidebar and the
 * `/transfer-session` command, and inside a Herdr pane keeps the pane showing
 * the open session's agent and its root's title; the returned cleanup removes
 * them all.
 */
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { createTuiContainer } from "@session-manager/main/tui-container"
import { V2_PLUGIN_ID } from "@session-manager/main/plugin-id"

export function setup(context: V2TuiContext): () => void {
  return setupWith(context, process.env, process.platform)
}

/** `setup` with the environment and platform given, so a test decides whether it runs inside Herdr. */
export function setupWith(
  context: V2TuiContext,
  environment: Readonly<Record<string, string | undefined>>,
  platform: string,
): () => void {
  const container = createTuiContainer(context.client, environment, platform)
  const disposers = [container.sidebar.register(context), container.transfer.register(context), container.repair.register(context)]
  if (container.paneTitle) disposers.push(container.paneTitle.register(context))
  return () => {
    for (const dispose of disposers) dispose()
  }
}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
