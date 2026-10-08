import type { OpenedProfile } from "@session-manager/domain/model/Browser"
import { profileAt } from "@session-manager/domain/model/Profile"
import type { CatalogedSession, MagicContextSessionStats } from "@session-manager/domain/model/SessionCatalog"

export interface SessionInput {
  readonly id: string
  readonly directory: string
  readonly updated: number
  readonly title?: string | null
  readonly context?: Partial<MagicContextSessionStats> | null
  readonly parent?: string | null
  readonly fork?: string | null
  readonly archived?: number | null
}

export function session(input: SessionInput): CatalogedSession {
  return {
    id: input.id,
    generation: "v2",
    projectId: "proj",
    parentId: input.parent ?? null,
    forkOf: input.fork ?? null,
    title: input.title === undefined ? `title ${input.id}` : input.title,
    directory: input.directory,
    timeCreated: 0,
    timeUpdated: input.updated,
    timeArchived: input.archived ?? null,
    entries: 3,
    magicContext:
      input.context === null || input.context === undefined
        ? null
        : { compartments: 1, tags: 2, lastTag: 2, notes: 0, memoriesOriginated: 0, project: "dir:abc", ...input.context },
  }
}

/** An opened profile whose sessions are listed newest first, as the catalog lists them. */
export function opened(name: string, sessions: readonly CatalogedSession[], options: { snapshot?: string; context?: boolean } = {}): OpenedProfile {
  return {
    catalog: {
      profile: profileAt(name, `/data/${name}`),
      sessions: [...sessions].sort((a, b) => b.timeUpdated - a.timeUpdated),
      magicContext: options.context === false ? { available: false, schemaVersion: null } : { available: true, schemaVersion: 94 },
    },
    snapshot: options.snapshot ?? null,
  }
}
