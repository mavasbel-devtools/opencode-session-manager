import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { RenderSidebarEntryUseCase } from "@session-manager/application/RenderSidebarEntryUseCase"
import { SessionIdSidebarSlotV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionIdSidebarSlotV2Adapter"
import { SessionTransferV2TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV2TuiAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { OpenCode2HostAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"
import { HostThemePaletteV2Adapter } from "@session-manager/infrastructure/adapters/outbound/tui/HostThemePaletteV2Adapter"
import { OpenTuiSidebarViewAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/OpenTuiSidebarViewAdapter"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"

export interface TuiContainer {
  readonly sidebar: SessionIdSidebarSlotV2Adapter
  readonly transfer: SessionTransferV2TuiAdapter
}

/**
 * Composition root of the OpenCode 2 TUI runtime: the only place that wires
 * concrete adapters for the sidebar line and the transfer command.
 *
 * The sidebar renderer is wired as a factory because the theme only exists on
 * the context at registration time. The transfer side has no SQLite access:
 * the v2 server owns the session store, so every read and the move itself go
 * through the host client.
 */
export function createTuiContainer(client: V2Client): TuiContainer {
  const host = new OpenCode2HostAdapter(client)
  const fs = new NodeFileSystemAdapter()
  return {
    sidebar: new SessionIdSidebarSlotV2Adapter(
      (context) => new RenderSidebarEntryUseCase(new HostThemePaletteV2Adapter(context), new OpenTuiSidebarViewAdapter()),
    ),
    transfer: new SessionTransferV2TuiAdapter({
      host,
      fs,
      moveSession: new MoveSessionUseCase(host, fs),
      buildDirectoryOptions: new BuildDirectoryOptionsUseCase(host, fs),
    }),
  }
}
