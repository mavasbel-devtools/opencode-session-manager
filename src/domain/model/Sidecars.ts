import { baseName } from "#domain/model/Paths.ts"

/** The three files SQLite keeps for one database: the database itself and its two sidecars. */
export const SIDECARS = ["", "-wal", "-shm"] as const

export type SidecarSuffix = (typeof SIDECARS)[number]

export interface SidecarPath {
  /** `<database name><suffix>`, the key used in size reports. */
  readonly label: string
  readonly path: string
}

/** The database and sidecar paths for one database path, in the fixed order `db`, `db-wal`, `db-shm`. */
export function sidecarPaths(dbPath: string): readonly SidecarPath[] {
  return SIDECARS.map((suffix) => ({ label: baseName(dbPath) + suffix, path: dbPath + suffix }))
}
