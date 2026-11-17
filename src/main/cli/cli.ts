import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"

/** Builds the container and runs one command, converting a thrown error into the `ERROR:` line and exit 1. */
export async function bootstrap(argv: readonly string[], environment: CliEnvironment): Promise<number> {
  try {
    return await (await buildContainer(environment)).run(argv)
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

// Only when this file is the process entrypoint; never when a test imports it. The process exits at
// once with the code: Arborist keeps idle registry connections for about two minutes otherwise.
if (import.meta.main) process.exit(await bootstrap(process.argv.slice(2), process.env as CliEnvironment))
