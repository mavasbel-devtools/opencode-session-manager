/**
 * OpenCode 2 forks, as OpenCode 2.0.26 writes them (`SessionProjector.projectFork`): a new session
 * pointing at its parent (`fork_session_id`) and the last message it took (`fork_boundary`), with
 * copies of the parent's settled messages up to there under new ids `<message base>_<seq>`, the
 * same `seq`, type, times and body; the parent's title with ` (fork #n)`; no cost or tokens; its
 * event sequence reserved at the last copied `seq`. Magic Context (0.47 on) gives a fork its
 * parent's state itself, the first time a prompt is sent in it. Report keys are snake_case.
 */

/** `through`: the message is the last one copied; `before`: the copy stops just before it. */
export interface ForkBoundary {
  readonly type: "through" | "before"
  readonly messageID: string
}

/** The fork's title: ` (fork #1)` appended, or the number after an existing one raised by one. */
export function forkTitle(title: string | null): string | null {
  if (title === null) return null
  const match = title.match(/^(.+) \(fork #(\d+)\)$/)
  if (match !== null) return `${match[1]} (fork #${Number.parseInt(match[2]!, 10) + 1})`
  return `${title} (fork #1)`
}

/**
 * Whether OpenCode copies a message into a fork: not an assistant reply still streaming (no
 * `time.completed`), nor a shell command or compaction still running.
 */
export function isSettled(type: string, data: string): boolean {
  if (type !== "assistant" && type !== "shell" && type !== "compaction") return true
  let body: { time?: { completed?: unknown }; status?: unknown }
  try {
    body = JSON.parse(data) as typeof body
  } catch {
    return true
  }
  if (type === "assistant") return body.time?.completed !== undefined && body.time.completed !== null
  return body.status !== "running"
}

/** OpenCode's session slug words (`Slug.create`: an adjective and a noun). */
export const SLUG_ADJECTIVES = [
  "brave", "calm", "clever", "cosmic", "crisp", "curious", "eager", "gentle", "glowing", "happy", "hidden", "jolly", "kind", "lucky", "mighty",
  "misty", "neon", "nimble", "playful", "proud", "quick", "quiet", "shiny", "silent", "stellar", "sunny", "swift", "tidy", "witty",
] as const
export const SLUG_NOUNS = [
  "cabin", "cactus", "canyon", "circuit", "comet", "eagle", "engine", "falcon", "forest", "garden", "harbor", "island", "knight", "lagoon", "meadow",
  "moon", "mountain", "nebula", "orchid", "otter", "panda", "pixel", "planet", "river", "rocket", "sailor", "squid", "star", "tiger", "wizard", "wolf",
] as const

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
/** OpenCode ids are 26 characters after the prefix: 12 hex of time and counter, 14 random. */
const ID_LENGTH = 26

/**
 * An OpenCode id (`<prefix>_` + 12 hex digits of `time * 4096 + counter`, bit-inverted for
 * descending ids such as sessions', + 14 base-62 characters from `random`).
 */
export function opencodeId(prefix: string, time: number, counter: number, descending: boolean, random: Uint8Array): string {
  const value = BigInt(time) * 0x1000n + BigInt(counter)
  const ordered = descending ? ~value : value
  const hex = Array.from({ length: 6 }, (_, index) => Number((ordered >> BigInt(40 - 8 * index)) & 0xffn).toString(16).padStart(2, "0")).join("")
  const tail = Array.from(random.slice(0, ID_LENGTH - 12), (byte) => BASE62[byte % 62]).join("")
  return `${prefix}_${hex}${tail}`
}

/** What a fork through the OpenCode server made. */
export interface ForkReport {
  readonly server: string
  readonly parent_id: string
  readonly fork_id: string
  readonly title: string | null
  readonly boundary: ForkBoundary | null
  readonly directory: string | null
}

export function forkLines(report: ForkReport): string[] {
  const boundary = report.boundary === null ? "" : ` (${report.boundary.type} ${report.boundary.messageID})`
  return [
    `Forked ${report.parent_id} → ${report.fork_id}${boundary} through ${report.server}`,
    `"${report.title ?? "(untitled)"}"${report.directory === null ? "" : ` in ${report.directory}`}`,
    "Magic Context gives the fork its parent's state when the first prompt is sent in it.",
  ]
}
