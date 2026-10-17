/**
 * Herdr keeps at most 80 characters of a pane's display values (`title`,
 * `display_agent`) and cuts the rest without a mark (socket API,
 * `pane.report_metadata`). Titles are shortened here instead, so a cut title
 * says so.
 */
export const PANE_TITLE_LIMIT = 80

/** The slice of an OpenCode 2 session the pane title is worked out from. */
export interface SessionLink {
  readonly id: string
  readonly parentID?: string
  readonly title?: string
}

/**
 * A session title as Herdr shows it: control characters and runs of
 * whitespace become one space, the ends are trimmed, and a title longer than
 * the limit ends in `…`. `undefined` when nothing visible is left.
 */
export function paneTitle(title: string | undefined): string | undefined {
  const text = (title ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (text === "") return undefined
  const characters = [...text]
  if (characters.length <= PANE_TITLE_LIMIT) return text
  return `${characters.slice(0, PANE_TITLE_LIMIT - 1).join("").trimEnd()}…`
}

/**
 * The top of a session's parent chain: the session a pane is about. Herdr's own
 * OpenCode integration reports that same root as the pane's session, so a
 * sub-agent session open in the TUI keeps its parent's title. `undefined` when
 * a link is not loaded yet, or when the chain loops.
 */
export function rootSession(
  sessionID: string,
  lookup: (sessionID: string) => SessionLink | undefined,
): SessionLink | undefined {
  const seen = new Set<string>()
  let id = sessionID
  while (!seen.has(id)) {
    seen.add(id)
    const session = lookup(id)
    if (session === undefined) return undefined
    if (!session.parentID) return session
    id = session.parentID
  }
  return undefined
}
