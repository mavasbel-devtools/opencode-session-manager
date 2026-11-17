/** Clock ticks per second for /proc start times (`getconf CLK_TCK`; 100 on Linux when it cannot be asked). */
export function clockTicks(): number {
  const run = Bun.spawnSync(["getconf", "CLK_TCK"], { stdout: "pipe", stderr: "ignore" })
  const ticks = Number(run.stdout.toString().trim())
  return run.exitCode === 0 && ticks > 0 ? ticks : 100
}
