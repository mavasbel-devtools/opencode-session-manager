import { abbreviateHome, expandHome, separatorOf } from "@session-manager/domain/model/Paths"

/**
 * The folder browser of `/transfer-session`: a path box over a list of folders. Pure rules; the
 * filesystem reads go through the use case's listing port.
 *
 * - An empty box, or text that is not a path, lists the known folders (filtered by the text).
 * - A path (`~…`, `/…`, `C:…`) lists the typed folder itself first, then the folders inside its
 *   parent whose names start with the last segment (the completions). Hidden folders are listed
 *   only once the segment starts with a dot.
 */

/** `folder`: a listed folder; `here`: the typed folder, which exists; `new`: the typed folder, which does not. */
export type FolderRowKind = "folder" | "here" | "new"

export interface FolderRow {
  /** The folder as shown: absolute, with the home directory as `~`. */
  readonly label: string
  readonly directory: string
  readonly kind: FolderRowKind
}

export interface FolderBrowserState {
  readonly home: string
  /** The known folders, absolute, in display order. */
  readonly roots: readonly string[]
  /** The path box. */
  readonly text: string
  readonly rows: readonly FolderRow[]
  readonly highlight: number
  /** A folder that does not exist, chosen once: choosing it again creates it. */
  readonly pending: string | null
}

/** The outcome of Enter: the folder to move to, or none yet (`state` says why: nothing listed, or a creation to confirm). */
export interface FolderChoice {
  readonly state: FolderBrowserState
  readonly directory: string | null
}

const SEPARATOR = /[\\/]/

/** Whether the text is a path (`~`, `~/…`, `/…`, `\…`, `C:…`) rather than a filter of the known folders. */
export function isPathInput(text: string): boolean {
  return /^(~($|[\\/])|[\\/]|[A-Za-z]:)/.test(text)
}

/** Splits a path at its last separator: the folder typed so far (with its separator) and the name being typed. */
export function splitInput(text: string): { readonly folder: string; readonly partial: string } {
  if (text === "~") return { folder: "~", partial: "" }
  const index = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"))
  return { folder: text.slice(0, index + 1), partial: text.slice(index + 1) }
}

/** A filesystem root (`/`, `C:\`), which has no parent and is never offered as a known folder. */
export function isFileSystemRoot(directory: string): boolean {
  return /^([A-Za-z]:)?[\\/]+$/.test(directory)
}

/** The path without trailing separators, a root kept as it is. */
export function trimSeparators(directory: string): string {
  if (isFileSystemRoot(directory)) return directory
  return directory.replace(/[\\/]+$/, "")
}

/** A folder inside another one. */
export function joinFolder(parent: string, name: string, separator: string): string {
  return SEPARATOR.test(parent.at(-1) ?? "") ? `${parent}${name}` : `${parent}${separator}${name}`
}

/** The text that lists a folder's contents: the folder as shown, ending with a separator. */
export function folderInput(directory: string, home: string): string {
  const shown = abbreviateHome(directory, home)
  return SEPARATOR.test(shown.at(-1) ?? "") ? shown : `${shown}${separatorOf(home)}`
}

/** The absolute folder a path names (`~` expanded, trailing separators dropped). */
export function absoluteInput(text: string, home: string): string {
  return trimSeparators(expandHome(text, home))
}

/**
 * One level up: the name being typed is dropped first (`~/Dev/re` → `~/Dev/`), then the last
 * folder (`~/Dev/` → `~/`, `~/` → the home's parent). A root stays.
 */
export function parentInput(text: string, home: string): string {
  const { folder, partial } = splitInput(text)
  if (partial !== "") return folder
  const absolute = absoluteInput(folder, home)
  if (isFileSystemRoot(absolute)) return folder
  const index = Math.max(absolute.lastIndexOf("/"), absolute.lastIndexOf("\\"))
  return folderInput(absolute.slice(0, index + 1), home)
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true })

/** Folder order by what is shown: under the home first, then segment by segment, a parent before its children. */
export function compareLabels(left: string, right: string): number {
  const home = (label: string) => (label.startsWith("~") ? 0 : 1)
  if (home(left) !== home(right)) return home(left) - home(right)
  const a = left.split(SEPARATOR)
  const b = right.split(SEPARATOR)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const order = collator.compare(a[index]!, b[index]!)
    if (order !== 0) return order
  }
  return a.length - b.length || (left < right ? -1 : left > right ? 1 : 0)
}

/** Fits a path into `width` columns by cutting its middle, so its start and its distinguishing end stay. */
export function fitMiddle(text: string, width: number): string {
  if (text.length <= width) return text
  if (width < 2) return text.slice(0, Math.max(0, width))
  const head = Math.floor((width - 1) / 3)
  const tail = width - 1 - head
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** The first row to show so that the highlighted one is visible in a window of `size` rows. */
export function windowStart(highlight: number, count: number, size: number): number {
  if (count <= size) return 0
  return Math.min(Math.max(0, highlight - Math.floor(size / 2)), count - size)
}
