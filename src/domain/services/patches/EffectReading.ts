/**
 * What Magic Context's own log says about `execute_threshold_percentage`.
 *
 * Magic Context 0.47.0 (dist/v2/context-14v1hr8b.js) logs, on every turn below its proactive
 * compartment trigger, "compartment trigger: not firing at X% — below proactive floor (F%)" or
 * "… (below proactive floor F%) …", where F = threshold − PROACTIVE_TRIGGER_OFFSET_PERCENTAGE (2,
 * same file). Magic Context 0.49.0 also logs, on every transform, "transform threshold: … threshold=T%
 * proactiveFloor=F%", and writes the "below proactive floor" lines only on some paths, so after a restart
 * the newest floor may come from that line alone. When the configuration is rejected it logs
 * `config reload failed … "execute_threshold_percentage": invalid value …, using default 65.`
 */
export const PROACTIVE_TRIGGER_OFFSET_PERCENTAGE = 2

/** The Magic Context setting this tool checks (moved from EffectUseCase, so application files never share values). */
export const THRESHOLD_SETTING = "execute_threshold_percentage"

const LINE = /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\] (.*)$/
const FLOOR = /(?:below proactive floor \(?|proactiveFloor=)(\d+(?:\.\d+)?)%/
const REJECTION = /config reload failed .*"execute_threshold_percentage": invalid value/

/** The log lines stamped at or after `sinceMs`, without their stamp. */
export function linesSince(lines: readonly string[], sinceMs: number): string[] {
  return lines.flatMap((line) => {
    const stamped = LINE.exec(line)
    return stamped !== null && Date.parse(stamped[1]!) >= sinceMs ? [stamped[2]!] : []
  })
}

export interface EffectSummary {
  readonly linesRead: number
  readonly rejections: number
  readonly lastRejection: string | null
  /** Each proactive floor seen, with how many lines reported it. */
  readonly floors: Readonly<Record<string, number>>
  /** The threshold the newest floor line implies, or null when none was logged. */
  readonly effectiveThreshold: number | null
}

/** Summarises the log lines stamped at or after `sinceMs` (every stamped line when null). */
export function summarizeEffect(lines: readonly string[], sinceMs: number | null): EffectSummary {
  let linesRead = 0
  let rejections = 0
  let lastRejection: string | null = null
  let lastFloor: number | null = null
  const floors: Record<string, number> = {}
  for (const line of lines) {
    const stamped = LINE.exec(line)
    if (stamped === null) continue
    if (sinceMs !== null && Date.parse(stamped[1]!) < sinceMs) continue
    linesRead += 1
    const text = stamped[2]!
    if (REJECTION.test(text)) {
      rejections += 1
      lastRejection = line
    }
    const floor = FLOOR.exec(text)
    if (floor !== null) {
      floors[floor[1]!] = (floors[floor[1]!] ?? 0) + 1
      lastFloor = Number(floor[1])
    }
  }
  const effectiveThreshold = lastFloor === null ? null : lastFloor + PROACTIVE_TRIGGER_OFFSET_PERCENTAGE
  return { linesRead, rejections, lastRejection, floors, effectiveThreshold }
}

export type EffectVerdict = "respected" | "rejected" | "differs" | "no-data"

/** Whether the configured threshold is the one Magic Context runs with. */
export function effectVerdict(summary: EffectSummary, configured: number | null): EffectVerdict {
  if (summary.rejections > 0) return "rejected"
  if (summary.effectiveThreshold === null || configured === null) return "no-data"
  return summary.effectiveThreshold === configured ? "respected" : "differs"
}
