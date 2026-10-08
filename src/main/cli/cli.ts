import { pathToFileURL } from "node:url"
import { buildContainer } from "#main/container.ts"
import type { CliEnvironment } from "#infrastructure/adapters/inbound/cli/CompactCliAdapter.ts"

/** Builds the container and runs one command, converting a thrown error into the `ERROR:` line and exit 1. */
export function bootstrap(argv: readonly string[], environment: CliEnvironment): number {
  try {
    return buildContainer(environment).run(argv)
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

// Only when this file is the process entrypoint; never when a test imports it.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = bootstrap(process.argv.slice(2), process.env)
