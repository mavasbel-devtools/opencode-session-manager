import { joinPath } from "@session-manager/domain/model/DatabasePaths"

/**
 * One OpenCode installation, as seen from this machine: its session store and its Magic Context
 * store, both under one XDG data home (`~/.local/share` on Linux, and also on Windows, where
 * OpenCode keeps the same layout under the user profile).
 */
export interface Profile {
  readonly name: string
  readonly dataHome: string
  readonly opencodeDb: string
  /** Present only when Magic Context is installed; a profile without it has sessions but no context. */
  readonly contextDb: string
}

export interface DataHomeEnvironment {
  readonly XDG_DATA_HOME?: string | undefined
}

/** The profile whose stores live under `dataHome`. */
export function profileAt(name: string, dataHome: string): Profile {
  const root = dataHome.length > 1 ? dataHome.replace(/[\\/]+$/, "") : dataHome
  return {
    name,
    dataHome: root,
    opencodeDb: joinPath(root, "opencode", "opencode.db"),
    contextDb: joinPath(root, "cortexkit", "magic-context", "context.db"),
  }
}

/**
 * A profile named by its store files rather than a data home: any `opencode.db`, with a Magic
 * Context store beside it or none ("" never exists). `dataHome` is the session store's folder.
 */
export function profileOfFiles(name: string, opencodeDb: string, contextDb: string | undefined): Profile {
  const cut = Math.max(opencodeDb.lastIndexOf("/"), opencodeDb.lastIndexOf("\\"))
  return { name, dataHome: cut <= 0 ? opencodeDb.slice(0, cut + 1) || "." : opencodeDb.slice(0, cut), opencodeDb, contextDb: contextDb ?? "" }
}

/** `$XDG_DATA_HOME`, or `<home>/.local/share` when unset or empty. */
export function defaultDataHome(env: DataHomeEnvironment, home: string): string {
  return env.XDG_DATA_HOME ? env.XDG_DATA_HOME : joinPath(home, ".local", "share")
}
