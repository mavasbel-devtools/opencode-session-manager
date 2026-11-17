import { describe, expect, it } from "bun:test"
import { effectVerdict, PROACTIVE_TRIGGER_OFFSET_PERCENTAGE, summarizeEffect } from "@session-manager/domain/services/patches/EffectReading"

// Lines in the exact formats Magic Context 0.47.0 writes (taken from /tmp/opencode2/magic-context/magic-context.log).
const REJECT =
  '[2026-10-11T04:31:24.440Z] [config] config reload failed ~/.config/cortexkit/magic-context.jsonc: invalid configuration: [user config] "execute_threshold_percentage": invalid value (number 13), using default 65.'
const NOT_FIRING = "[2026-10-12T01:38:41.919Z] [magic-context][ses_x] compartment trigger: not firing at 27.9% — below proactive floor (63%)"
const CHEAP_SKIP =
  "[2026-10-12T02:00:00.000Z] [magic-context][ses_x] compartment trigger: cheap-skip at 5.0% (below proactive floor 11%) — live-tail upper bound 1 < triggerBudget 2; no size trigger possible, skipped full raw read"

describe("summarizeEffect", () => {
  it("counts rejections and floors, and derives the threshold from the newest floor", () => {
    const summary = summarizeEffect([REJECT, "not a log line", NOT_FIRING, CHEAP_SKIP, ""], null)
    expect(summary).toEqual({
      linesRead: 3,
      rejections: 1,
      lastRejection: REJECT,
      floors: { "63": 1, "11": 1 },
      effectiveThreshold: 11 + PROACTIVE_TRIGGER_OFFSET_PERCENTAGE,
    })
  })

  it("ignores lines before the given time", () => {
    const summary = summarizeEffect([REJECT, NOT_FIRING, CHEAP_SKIP], Date.parse("2026-10-12T01:00:00Z"))
    expect([summary.linesRead, summary.rejections, summary.effectiveThreshold]).toEqual([2, 0, 13])
  })

  it("reads the floor from the 0.49.0 transform threshold line", () => {
    // Exact format Magic Context 0.49.0 writes (from /tmp/opencode2/magic-context/magic-context.log, 2026-10-14).
    const TRANSFORM =
      "[2026-10-14T05:14:34.371Z] [magic-context][ses_x] transform threshold: model=claude-plugin/claude-opus-5-5 matchedModel=scalar mode=percentage threshold=13% proactiveFloor=11%"
    const summary = summarizeEffect([REJECT, NOT_FIRING, TRANSFORM], Date.parse("2026-10-14T05:12:59Z"))
    expect(summary).toEqual({ linesRead: 1, rejections: 0, lastRejection: null, floors: { "11": 1 }, effectiveThreshold: 13 })
    expect(effectVerdict(summary, 13)).toBe("respected")
  })

  it("reports nothing known on an empty log", () => {
    expect(summarizeEffect([], null)).toEqual({ linesRead: 0, rejections: 0, lastRejection: null, floors: {}, effectiveThreshold: null })
  })
})

describe("effectVerdict", () => {
  const summary = (rejections: number, effectiveThreshold: number | null) => ({
    linesRead: 1,
    rejections,
    lastRejection: null,
    floors: {},
    effectiveThreshold,
  })

  it("names each outcome", () => {
    expect(effectVerdict(summary(1, 13), 13)).toBe("rejected")
    expect(effectVerdict(summary(0, null), 13)).toBe("no-data")
    expect(effectVerdict(summary(0, 13), null)).toBe("no-data")
    expect(effectVerdict(summary(0, 13), 13)).toBe("respected")
    expect(effectVerdict(summary(0, 65), 13)).toBe("differs")
  })
})
