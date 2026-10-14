import {
  absoluteInput,
  folderInput,
  isPathInput,
  joinFolder,
  parentInput,
  splitInput,
  type FolderBrowserState,
  type FolderChoice,
  type FolderRow,
} from "@session-manager/domain/model/FolderBrowser"
import { abbreviateHome, separatorOf } from "@session-manager/domain/model/Paths"
import type { BrowseFoldersPort } from "@session-manager/domain/ports/inbound/BrowseFoldersPort"
import type { DirectoryListingPort } from "@session-manager/domain/ports/outbound/DirectoryListingPort"

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true })

/**
 * The folder browser's steps (see FolderBrowser.ts for the rules). Every step recomputes the
 * rows from the path box, so the list always shows what is on disk now.
 */
export class BrowseFoldersUseCase implements BrowseFoldersPort {
  constructor(private readonly listing: DirectoryListingPort) {}

  open(home: string, roots: readonly string[]): FolderBrowserState {
    return this.type({ home, roots, text: "", rows: [], highlight: 0, pending: null }, "")
  }

  type(state: FolderBrowserState, text: string): FolderBrowserState {
    const { rows, highlight } = isPathInput(text) ? this.pathRows(state.home, text) : this.knownRows(state, text)
    return { ...state, text, rows, highlight, pending: null }
  }

  move(state: FolderBrowserState, delta: number): FolderBrowserState {
    const count = state.rows.length
    if (count === 0) return state
    return { ...state, highlight: (((state.highlight + delta) % count) + count) % count, pending: null }
  }

  enter(state: FolderBrowserState): FolderBrowserState {
    const row = state.rows[state.highlight]
    if (row === undefined || row.kind === "new") return { ...state, pending: null }
    return this.type(state, folderInput(row.directory, state.home))
  }

  up(state: FolderBrowserState): FolderBrowserState {
    if (!isPathInput(state.text)) return { ...state, pending: null }
    return this.type(state, parentInput(state.text, state.home))
  }

  choose(state: FolderBrowserState): FolderChoice {
    const row = state.rows[state.highlight]
    if (row === undefined) return { state, directory: null }
    if (row.kind !== "new" || state.pending === row.directory) return { state: { ...state, pending: null }, directory: row.directory }
    return { state: { ...state, pending: row.directory }, directory: null }
  }

  private knownRows(state: FolderBrowserState, text: string): { rows: FolderRow[]; highlight: number } {
    const query = text.trim().toLowerCase()
    const rows = state.roots
      .map((directory): FolderRow => ({ label: abbreviateHome(directory, state.home), directory, kind: "folder" }))
      .filter((row) => row.label.toLowerCase().includes(query))
    return { rows, highlight: 0 }
  }

  private pathRows(home: string, text: string): { rows: FolderRow[]; highlight: number } {
    const separator = separatorOf(home)
    const { folder, partial } = splitInput(text)
    const parent = absoluteInput(folder, home)
    const target = partial === "" ? parent : joinFolder(parent, partial, separator)
    const prefix = partial.toLowerCase()
    const children = (this.listing.isDirectory(parent) ? this.listing.subdirectories(parent) : [])
      .filter((name) => name.toLowerCase().startsWith(prefix) && (prefix.startsWith(".") || !name.startsWith(".")))
      .sort((left, right) => collator.compare(left, right) || (left < right ? -1 : 1))
      .map((name): FolderRow => {
        const directory = joinFolder(parent, name, separator)
        return { label: abbreviateHome(directory, home), directory, kind: "folder" }
      })
      .filter((row) => row.directory !== target)
    const typed: FolderRow = { label: abbreviateHome(target, home), directory: target, kind: this.listing.isDirectory(target) ? "here" : "new" }
    return { rows: [typed, ...children], highlight: partial !== "" && children.length > 0 ? 1 : 0 }
  }
}
