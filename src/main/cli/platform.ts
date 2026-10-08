import { UnsupportedPlatformError } from "@session-manager/domain/errors/UnsupportedPlatformError"
import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"

/** The operating-system-specific half of the tool: who is running, who holds the file, and OpenCode's process name. */
export interface PlatformAdapters {
  readonly processes: ProcessListPort
  readonly holders: DatabaseHoldersPort
  /** The OpenCode process name `processes` matches by default. */
  readonly image: string
}

export type PlatformFactory = (fileSystem: MaintenanceFileSystemPort, pid: number) => PlatformAdapters

/**
 * Each supported `process.platform` value and its wiring, loaded on demand: a platform's code
 * lives only in `src/main/<platform>-container.ts` and
 * `src/infrastructure/adapters/outbound/platform/<platform>/`, and is never loaded on another
 * platform, so the e2e coverage gate measures each platform's files on that platform only.
 */
const LOADERS: Readonly<Record<string, () => Promise<PlatformFactory>>> = {
  linux: async () => (await import("@session-manager/main/linux-container")).linuxAdapters,
  win32: async () => (await import("@session-manager/main/win32-container")).win32Adapters,
}

export const SUPPORTED_PLATFORMS: readonly string[] = Object.keys(LOADERS)

export async function platformAdapters(platform: string, fileSystem: MaintenanceFileSystemPort, pid: number): Promise<PlatformAdapters> {
  const load = Object.hasOwn(LOADERS, platform) ? LOADERS[platform] : undefined
  if (load === undefined) throw new UnsupportedPlatformError(platform, SUPPORTED_PLATFORMS)
  return (await load())(fileSystem, pid)
}
