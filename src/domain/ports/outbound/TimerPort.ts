/** Outbound port: waiting. */
export interface TimerPort {
  sleep(milliseconds: number): Promise<void>
}
