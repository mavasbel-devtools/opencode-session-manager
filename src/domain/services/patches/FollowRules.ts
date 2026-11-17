import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

/** Magic Context logs every setting it rejects as `config reload failed …` (0.47.0 … 0.49.19). */
export const CONFIG_REJECTION = /config reload failed/

/** The folder a plugin source belongs to: `local` sources are reported as `<root>/index.js` (OpenCode 2.1.1) or as `<root>` (2.2.5). */
export const loadsFrom = (source: string | null, root: string): boolean =>
  source !== null && (source === root || source.startsWith(`${root}/`))

/** Whether a location's Magic Context comes from an entry: a folder entry by path, an npm entry by spec. */
export const loadsEntry = (source: string | null, entry: string): boolean =>
  entry.startsWith("/") ? loadsFrom(source, entry) : source === entry

/** Where the package sits inside an install folder, as Arborist lays it out. */
export const packageRoot = (folder: string) => `${folder}/node_modules/${MAGIC_CONTEXT_PACKAGE}`

/** The entry opencode.jsonc had before the last adoption (or rollback): what `follow --rollback` puts back. */
export const PREVIOUS_ENTRY = "follow-previous-entry"
export const LAST_FOLLOW_NOTIFICATION = "last-follow-notification"
export const FOLLOW_TITLE = "Magic Context follow"
