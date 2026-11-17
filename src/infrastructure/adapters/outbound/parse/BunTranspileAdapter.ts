import type { TranspilePort } from "@session-manager/domain/ports/outbound/TranspilePort"

/** Bun's own JavaScript parser: a patched bundle must still parse before it is installed. */
export class BunTranspileAdapter implements TranspilePort {
  constructor() {}

  error(code: string): string | null {
    try {
      new Bun.Transpiler({ loader: "js" }).transformSync(code)
      return null
    } catch (error) {
      return (error as Error).message
    }
  }
}
