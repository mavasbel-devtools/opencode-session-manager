import { and, asc, count, eq, gte, max } from "drizzle-orm"
import type { RebuildSnapshot } from "@session-manager/domain/model/Rebuild"
import type { MagicContextProgressPort } from "@session-manager/domain/ports/outbound/MagicContextProgressPort"
import type { MagicContextSyncStorePort } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import { withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { compartments, compartmentStateLease, historianRuns, recompCompartments } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/magic-context"

const number = (value: unknown) => (value === null || value === undefined ? null : Number(value))

/**
 * A session's Magic Context progress, read-only through the generated schema: its summaries and
 * how far they reach (the OpenCode 2 label's, else the older one's), its wrapup marker (from the
 * sync store's vitals), an unexpired history lease, summaries a recomp has staged, and the
 * historian runs recorded since a moment.
 */
export class BunMagicContextProgressAdapter implements MagicContextProgressPort {
  private readonly vitals: Pick<MagicContextSyncStorePort, "vitals">

  constructor(vitals: Pick<MagicContextSyncStorePort, "vitals">) {
    this.vitals = vitals
  }

  snapshot(contextDb: string, sessionId: string, since: number, now: number): RebuildSnapshot {
    const { wrapup } = this.vitals.vitals(contextDb, sessionId, now)
    return withStore(contextDb, "read", (store) => {
      const labels = store.has(compartments, ["session_id", "harness", "end_message"])
        ? store.orm
            .select({ harness: compartments.harness, summaries: count(), reach: max(compartments.end_message) })
            .from(compartments)
            .where(eq(compartments.session_id, sessionId))
            .groupBy(compartments.harness)
            .all()
        : []
      const label = labels.find((row) => row.harness === "opencode2") ?? labels[0]
      const lease = store.has(compartmentStateLease, ["session_id", "expires_at"])
        ? store.orm.select({ until: max(compartmentStateLease.expires_at) }).from(compartmentStateLease).where(eq(compartmentStateLease.session_id, sessionId)).get()
        : undefined
      const staged = store.has(recompCompartments, ["session_id"])
        ? store.orm.select({ rows: count() }).from(recompCompartments).where(eq(recompCompartments.session_id, sessionId)).get()
        : undefined
      const runColumns = ["session_id", "run_kind", "status", "failure_reason", "chunk_start_ordinal", "chunk_end_ordinal", "compartments_produced", "created_at"]
      const runs = store.has(historianRuns, runColumns)
        ? store.orm
            .select({
              kind: historianRuns.run_kind,
              status: historianRuns.status,
              failure: historianRuns.failure_reason,
              start: historianRuns.chunk_start_ordinal,
              end: historianRuns.chunk_end_ordinal,
              produced: historianRuns.compartments_produced,
              at: historianRuns.created_at,
            })
            .from(historianRuns)
            .where(and(eq(historianRuns.session_id, sessionId), gte(historianRuns.created_at, BigInt(since))))
            .orderBy(asc(historianRuns.created_at), asc(historianRuns.id))
            .all()
        : []
      return {
        summaries: label === undefined ? 0 : Number(label.summaries),
        reach: label === undefined ? null : number(label.reach),
        wrapup,
        leased: (number(lease?.until) ?? 0) > now,
        staged: Number(staged?.rows ?? 0),
        runs: runs.map((run) => ({
          kind: run.kind ?? "",
          status: run.status ?? "",
          failure: run.failure ?? null,
          chunk_start: number(run.start),
          chunk_end: number(run.end),
          compartments: number(run.produced) ?? 0,
          at: Number(run.at),
        })),
      }
    })
  }
}
