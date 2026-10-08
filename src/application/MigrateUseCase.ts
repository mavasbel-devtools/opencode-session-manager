import type { DatabaseSizesService } from "#application/DatabaseSizesService.ts"
import type { GuardService } from "#application/GuardService.ts"
import type { MigrationVerifier } from "#application/MigrationVerifier.ts"
import type { RekeyService } from "#application/RekeyService.ts"
import type { RewriteService } from "#application/RewriteService.ts"
import type { SwapService } from "#application/SwapService.ts"
import { DatabaseNotFoundError } from "#domain/errors/DomainErrors.ts"
import type { MergeReport, MigrationVerification, RekeyReport } from "#domain/model/Migration.ts"
import { baseName, dirName, joinPath } from "#domain/model/Paths.ts"
import { SIDECARS } from "#domain/model/Sidecars.ts"
import type { MigrateInput, MigrateOutcome, MigratePort } from "#domain/ports/inbound/MigratePort.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { MigrationStorePort } from "#domain/ports/outbound/MigrationStorePort.ts"
import type { ReportSinkPort } from "#domain/ports/outbound/ReportSinkPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"
import { PathRewriter } from "#domain/services/PathRewriter.ts"
import type { RequiredSpacePolicy } from "#domain/services/RequiredSpacePolicy.ts"

export interface MigrateCollaborators {
  readonly guard: GuardService
  readonly swapper: SwapService
  readonly sizes: DatabaseSizesService
  readonly space: RequiredSpacePolicy
  readonly rewriteService: RewriteService
  readonly rekeyService: RekeyService
  readonly verifier: MigrationVerifier
  readonly store: MigrationStorePort
  readonly sqlite: SqlitePort
  readonly fileSystem: FileSystemPort
  readonly reports: ReportSinkPort
  readonly runtime: RuntimePort
}

/**
 * Moves sessions from another machine into this one. Every input is copied with `VACUUM INTO`
 * from a read-only connection; the paths in each copy are rewritten; the sources are merged into
 * the live database's copy (rows already there win); every session gets the project OpenCode
 * derives here; the result is compacted, verified, and — in a run, only if every gate passed —
 * swapped in by renames, with the originals kept in `db-backup-<stamp>/` for `rollback`.
 */
export class MigrateUseCase implements MigratePort {
  private readonly c: MigrateCollaborators

  constructor(collaborators: MigrateCollaborators) {
    this.c = collaborators
  }

  execute(input: MigrateInput): MigrateOutcome {
    const { c } = this
    const when = c.runtime.stamp()
    const inputs = [input.dbPath, ...input.sources]
    for (const path of inputs) if (!c.fileSystem.exists(path)) throw new DatabaseNotFoundError(path)
    if (input.mode === "run") c.guard.checkEnvironment({ dbPath: input.dbPath, image: input.image })

    const before = inputs.map((path) => ({ path, files: c.sizes.sizes(path), pages: c.sqlite.pageStats(path) }))
    const work = joinPath(input.directory, `opencode.db.migrate-${when}`)
    c.fileSystem.mkdirp(work)
    const requiredBytes = c.space.migrationBytes(
      before.map((entry) => ({ pages: entry.pages, walBytes: entry.files[`${baseName(entry.path)}-wal`] ?? 0 })),
    )
    const preGuard = c.guard.checkSpace({ dbPath: joinPath(work, "opencode.db"), requiredBytes })

    const copies = inputs.map((path, index) => joinPath(work, index === 0 ? "base.db" : `source-${index}.db`))
    inputs.forEach((path, index) => c.sqlite.vacuumInto(path, copies[index] as string))

    const rewriter = new PathRewriter(input.mapping)
    const rewrites = copies.map((copy, index) =>
      this.withDatabase(copy, (db) => c.rewriteService.rewrite(db, rewriter, inputs[index] as string)),
    )
    const [base, ...sources] = copies as [string, ...string[]]
    const { merges, rekey } = this.withDatabase(base, (db) => {
      const merged: MergeReport[] = sources.map((copy, index) => ({
        source: input.sources[index] as string,
        tables: db.merge(copy),
      }))
      const rekeyed: RekeyReport = c.rekeyService.rekey(db)
      return { merges: merged, rekey: rekeyed }
    })

    const migrated = joinPath(work, "opencode.db")
    c.sqlite.vacuumInto(base, migrated)
    c.sqlite.setWal(migrated)
    const verification: MigrationVerification = this.withDatabase(migrated, (db) =>
      c.verifier.verify({ db, dbPath: migrated, inputs: copies, rewrites, rewriter }),
    )
    for (const copy of copies) this.removeDatabase(copy)

    const report = {
      mode: `migrate-${input.mode}`,
      database: input.dbPath,
      sources: input.sources,
      mapping: input.mapping,
      before,
      pre_guard: preGuard,
      rewrites,
      merges,
      rekey,
      verification,
    }
    const result = { ok: verification.ok, rewrites, merges, rekey, verification }

    if (input.mode === "rehearse" || !verification.ok) {
      const reportPath = joinPath(work, "report.json")
      c.reports.write(reportPath, { ...report, swapped: false })
      const keep = input.keep || input.mode === "run"
      if (!keep) this.removeDatabase(migrated)
      return { ...result, swapped: false, reportPath, migrated: keep ? migrated : null, backupDir: null, postIntegrityOk: false }
    }

    c.guard.checkEnvironment({ dbPath: input.dbPath, image: input.image })
    const backupDir = joinPath(dirName(input.dbPath), `db-backup-${when}`)
    const moved = c.swapper.swap({ dbPath: input.dbPath, compacted: migrated, backupDir })
    c.fileSystem.removeDirectory(work)
    const after = { integrity: c.sqlite.integrity(input.dbPath), files: c.sizes.sizes(input.dbPath) }
    const reportPath = joinPath(backupDir, "report.json")
    c.reports.write(reportPath, { ...report, moved, after, swapped: true })
    return {
      ...result,
      swapped: true,
      reportPath,
      migrated: null,
      backupDir,
      postIntegrityOk: after.integrity.integrity_ok,
    }
  }

  private withDatabase<T>(path: string, work: (db: ReturnType<MigrationStorePort["open"]>) => T): T {
    const db = this.c.store.open(path)
    try {
      return work(db)
    } finally {
      db.close()
    }
  }

  private removeDatabase(path: string): void {
    for (const suffix of SIDECARS) this.c.fileSystem.remove(path + suffix)
  }
}
