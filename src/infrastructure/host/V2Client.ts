/**
 * The slice of the OpenCode 2 client (`@opencode/client`, handed to TUI
 * plugins as `context.client`) this adapter uses. Declared structurally so the
 * plugin does not depend on the unpublished `@opencode/*` workspace packages.
 * Shapes verified against packages/client/src/promise/generated/{client,types}.ts
 * (v2.0.14): `session.list` → `GET /api/session` returning `{ data, cursor }`,
 * `session.move` → `POST /api/session/:id/move`, `project.list` →
 * `GET /api/project` returning `Project[]`.
 */
export interface V2Client {
  readonly session: {
    list(input?: { readonly limit?: number; readonly order?: "asc" | "desc" }): Promise<{
      readonly data: ReadonlyArray<V2Session>
    }>
    move(input: { readonly sessionID: string; readonly directory: string }): Promise<unknown>
  }
  readonly project: {
    list(): Promise<ReadonlyArray<V2Project>>
  }
}

export interface V2Session {
  readonly id: string
  readonly parentID?: string
  readonly projectID: string
  readonly title?: string
  readonly subpath?: string
  readonly time: { readonly updated: number }
  readonly location: { readonly directory: string }
}

export interface V2Project {
  readonly id: string
  readonly canonical: string
  readonly sandboxes: ReadonlyArray<string>
}
