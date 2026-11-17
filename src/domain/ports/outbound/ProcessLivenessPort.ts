/** Whether a process is alive, so the follow lock can tell a live owner from a stale one without OS code. */
export interface ProcessLivenessPort {
  isAlive(pid: number): Promise<boolean>
}
