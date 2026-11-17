export interface ClockPort {
  /** Milliseconds since the epoch. */
  now(): number
  /** Resolves after `ms` milliseconds. */
  sleep(ms: number): Promise<void>
}
