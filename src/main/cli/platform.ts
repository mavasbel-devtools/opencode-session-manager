import { UnsupportedPlatformError } from "@session-manager/domain/errors/UnsupportedPlatformError"
import type { DatabaseHoldersPort } from "@session-manager/domain/ports/outbound/DatabaseHoldersPort"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"
import type { ProcessLivenessPort } from "@session-manager/domain/ports/outbound/ProcessLivenessPort"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"

/** The operating-system-specific half of the tool: who is running, who holds the file, and OpenCode's process name. */
export interface PlatformAdapters {
  readonly processes: ProcessListPort
  readonly holders: DatabaseHoldersPort
  /** The OpenCode process name `processes` matches by default. */
  readonly image: string
}

export type PlatformFactory = (fileSystem: MaintenanceFileSystemPort, pid: number) => PlatformAdapters

/** The patches half of the platform: the running server's start, lock-owner liveness, notifications. */
export interface PatchesPlatformAdapters {
  readonly service: ServicePort
  readonly liveness: ProcessLivenessPort
  readonly notifier: NotifierPort
}

/** What the patches half reads from the environment: the `/proc` root and the notifier executable override (each platform falls back to its own default). */
export interface PatchesPlatformSettings {
  readonly proc: string
  readonly notifyCommand: string | undefined
}

export type PatchesPlatformFactory = (settings: PatchesPlatformSettings) => PatchesPlatformAdapters

/**
 * Each supported `process.platform` value and its wiring, loaded on demand: a platform's code
 * lives only in `src/main/<platform>-container.ts` and
 * `src/infrastructure/adapters/outbound/platform/<platform>/`, and is never loaded on another
 * platform, so the e2e coverage gate measures each platform's files on that platform only.
 */
const LOADERS: Readonly<Record<string, () => Promise<PlatformFactory>>> = {
  linux: async () => (await import("@session-manager/main/linux-container")).linuxAdapters,
  win32: async () => (await import("@session-manager/main/win32-container")).win32Adapters,
  darwin: async () => (await import("@session-manager/main/darwin-container")).darwinAdapters,
}

export const SUPPORTED_PLATFORMS: readonly string[] = Object.keys(LOADERS)

export async function platformAdapters(platform: string, fileSystem: MaintenanceFileSystemPort, pid: number): Promise<PlatformAdapters> {
  const load = Object.hasOwn(LOADERS, platform) ? LOADERS[platform] : undefined
  if (load === undefined) throw new UnsupportedPlatformError(platform, SUPPORTED_PLATFORMS)
  return (await load())(fileSystem, pid)
}

/** The patches half loads the same way, from the same containers' `…PatchesAdapters` factories. */
const PATCH_LOADERS: Readonly<Record<string, () => Promise<PatchesPlatformFactory>>> = {
  linux: async () => (await import("@session-manager/main/linux-container")).linuxPatchesAdapters,
  win32: async () => (await import("@session-manager/main/win32-container")).win32PatchesAdapters,
  darwin: async () => (await import("@session-manager/main/darwin-container")).darwinPatchesAdapters,
}

export async function patchesPlatformAdapters(platform: string, settings: PatchesPlatformSettings): Promise<PatchesPlatformAdapters> {
  const load = Object.hasOwn(PATCH_LOADERS, platform) ? PATCH_LOADERS[platform] : undefined
  if (load === undefined) throw new UnsupportedPlatformError(platform, SUPPORTED_PLATFORMS)
  return (await load())(settings)
}
