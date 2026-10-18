/**
 * A folder renamed in place: `<parent>/<from>` became `<parent>/<to>`. Its name is replaced
 * wherever it stands as a whole name — in paths, relative paths, ids and prose — not only below the
 * folder's absolute path.
 */
export interface NameRename {
  /** The absolute folder that holds the renamed folder, without a trailing slash. */
  readonly parent: string
  readonly from: string
  readonly to: string
}
