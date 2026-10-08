import { existsSync, mkdirSync, renameSync, rmdirSync, rmSync, statSync, statfsSync } from "node:fs"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"

/** The only place `node:fs` is used. */
export class NodeFileSystemAdapter implements FileSystemPort {
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

  removeDirectory(directory: string): void {
    rmdirSync(directory)
  }
}
