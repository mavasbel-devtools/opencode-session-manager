export class ProcessRunningError extends Error {
  constructor(image: string, pids: readonly number[], remedy: string) {
    super(`${image} is running (PIDs ${pids.join(", ")}); ${remedy}`)
    this.name = "ProcessRunningError"
  }
}
