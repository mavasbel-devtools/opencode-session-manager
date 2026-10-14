import type { FolderBrowserState, FolderChoice } from "@session-manager/domain/model/FolderBrowser"

/** Inbound port: the folder browser of `/transfer-session`, one step per key. */
export interface BrowseFoldersPort {
  /** An empty path box over the known folders (absolute, in display order). */
  open(home: string, roots: readonly string[]): FolderBrowserState
  /** The path box now holds `text`. */
  type(state: FolderBrowserState, text: string): FolderBrowserState
  /** ↑ / ↓ (wrapping). */
  move(state: FolderBrowserState, delta: number): FolderBrowserState
  /** →: into the highlighted folder. */
  enter(state: FolderBrowserState): FolderBrowserState
  /** ←: one level up. */
  up(state: FolderBrowserState): FolderBrowserState
  /** Enter: the highlighted folder; a folder that does not exist needs a second Enter. */
  choose(state: FolderBrowserState): FolderChoice
}
