import { BrowseFoldersUseCase } from "@session-manager/application/BrowseFoldersUseCase"
import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { RenderSidebarEntryUseCase } from "@session-manager/application/RenderSidebarEntryUseCase"
import { ReportPaneTitleUseCase } from "@session-manager/application/ReportPaneTitleUseCase"
import { herdrPane } from "@session-manager/domain/model/HerdrPane"
import { SessionIdSidebarSlotV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionIdSidebarSlotV2Adapter"
import { HerdrPaneTitleV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/HerdrPaneTitleV2Adapter"
import { FolderBrowserDialogV2Adapter } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"
import { SessionTransferV2TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionTransferV2TuiAdapter"
import { HerdrSocketPaneMetadataAdapter } from "@session-manager/infrastructure/adapters/outbound/herdr/HerdrSocketPaneMetadataAdapter"
import { NodeDirectoryListingAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeDirectoryListingAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { OpenCode2HostAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"
import { HostThemePaletteV2Adapter } from "@session-manager/infrastructure/adapters/outbound/tui/HostThemePaletteV2Adapter"
import { SystemHomeDirectoryAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemHomeDirectoryAdapter"
import { OpenTuiSidebarViewAdapter } from "@session-manager/infrastructure/adapters/outbound/tui/OpenTuiSidebarViewAdapter"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"

export interface TuiContainer {
  readonly sidebar: SessionIdSidebarSlotV2Adapter
  readonly transfer: SessionTransferV2TuiAdapter
  /** Only inside a Herdr pane (`HERDR_ENV=1` with a socket and a pane). */
  readonly paneTitle?: HerdrPaneTitleV2Adapter
}

/** The open session's title is read four times a second and resent every ten seconds; Herdr answers within a second. */
const PANE_TITLE_SCHEDULE = { pollMilliseconds: 250, refreshEvery: 40 }
const PANE_TITLE_TIMEOUT_MILLISECONDS = 1000

/**
 * Composition root of the OpenCode 2 TUI runtime: the only place that wires
 * concrete adapters for the sidebar line and the transfer command.
 *
 * The sidebar renderer is wired as a factory because the theme only exists on
 * the context at registration time. The transfer side has no SQLite access:
 * the v2 server owns the session store, so every read and the move itself go
 * through the host client. The pane title exists only inside Herdr; the
 * environment and platform are passed in so tests never reach a real Herdr.
 */
export function createTuiContainer(
  client: V2Client,
  environment: Readonly<Record<string, string | undefined>>,
  platform: string,
): TuiContainer {
  const pane = herdrPane(environment)
  const host = new OpenCode2HostAdapter(client)
  const fs = new NodeFileSystemAdapter()
  const listing = new NodeDirectoryListingAdapter()
  return {
    sidebar: new SessionIdSidebarSlotV2Adapter(
      (context) => new RenderSidebarEntryUseCase(new HostThemePaletteV2Adapter(context), new OpenTuiSidebarViewAdapter()),
    ),
    transfer: new SessionTransferV2TuiAdapter({
      host,
      home: new SystemHomeDirectoryAdapter(),
      moveSession: new MoveSessionUseCase(host, fs),
      buildDirectoryOptions: new BuildDirectoryOptionsUseCase(host, fs, listing),
      folders: new FolderBrowserDialogV2Adapter(new BrowseFoldersUseCase(listing)),
    }),
    ...(pane && {
      paneTitle: new HerdrPaneTitleV2Adapter(
        new ReportPaneTitleUseCase(new HerdrSocketPaneMetadataAdapter(pane, platform, PANE_TITLE_TIMEOUT_MILLISECONDS)),
        PANE_TITLE_SCHEDULE,
      ),
    }),
  }
}
