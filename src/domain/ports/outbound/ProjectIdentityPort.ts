import type { ProjectIdentity } from "@session-manager/domain/model/Migration"

/** Derives the project OpenCode would assign a folder on this machine, the way OpenCode does. */
export interface ProjectIdentityPort {
  /** `null` when the folder does not exist here. */
  resolve(directory: string): ProjectIdentity | null
}
