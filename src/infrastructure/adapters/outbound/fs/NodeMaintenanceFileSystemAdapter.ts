import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, statfsSync } from "node:fs"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"

/** The only place `node:fs` is used. */
export class NodeMaintenanceFileSystemAdapter implements MaintenanceFileSystemPort {
  constructor() {}

  exists(path: string): boolean {
    return existsSync(path)
  }

  size(path: string): number {
    return statSync(path).size
  }

  freeBytes(directory: string): number {
    const info = statfsSync(directory)
    return info.bavail * info.bsize
  }

  rename(from: string, to: string): void {
    renameSync(from, to)
  }

  mkdirp(directory: string): void {
    mkdirSync(directory, { recursive: true })
  }

  remove(path: string): void {
    rmSync(path, { force: true })
  }

  copyFile(from: string, to: string): void {
    copyFileSync(from, to)
  }

  removeTree(directory: string): void {
    rmSync(directory, { recursive: true, force: true })
  }
}
