import { UnsupportedPlatformError } from "#domain/errors/DomainErrors.ts"
import type { DatabaseHoldersPort } from "#domain/ports/outbound/DatabaseHoldersPort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"
import { linuxAdapters } from "#main/platform/linux.ts"
import { win32Adapters } from "#main/platform/win32.ts"

/** The operating-system-specific half of the tool: who is running, who holds the file, and OpenCode's process name. */
export interface PlatformAdapters {
  readonly processes: ProcessListPort
  readonly holders: DatabaseHoldersPort
  /** The OpenCode process name `processes` matches by default. */
  readonly image: string
}

export type PlatformFactory = (fileSystem: FileSystemPort, pid: number) => PlatformAdapters

/**
 * Each supported `process.platform` value and its wiring. A platform's code lives only in
 * `src/main/platform/<platform>.ts` and `src/infrastructure/adapters/outbound/platform/<platform>/`;
 * the e2e coverage gate measures those folders on their own platform only (see AGENTS.md).
 */
const FACTORIES: Readonly<Record<string, PlatformFactory>> = { linux: linuxAdapters, win32: win32Adapters }

export const SUPPORTED_PLATFORMS: readonly string[] = Object.keys(FACTORIES)

export function platformAdapters(platform: string, fileSystem: FileSystemPort, pid: number): PlatformAdapters {
  const factory = Object.hasOwn(FACTORIES, platform) ? FACTORIES[platform] : undefined
  if (factory === undefined) throw new UnsupportedPlatformError(platform, SUPPORTED_PLATFORMS)
  return factory(fileSystem, pid)
}
