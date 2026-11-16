/**
 * D29: the only test file allowed to read `process.platform`.
 *
 * Common tests stay where they are; tests of a `src/infrastructure/adapters/outbound/platform/<p>/`
 * adapter live in `tests/unit/platform/<p>/`, mirroring `src`. Every other test file reaches the
 * platform only through this module, so no test branches on the platform inline: rule I12
 * (`tests/unit/architecture/imports.test.ts`) fails any other test file that reads `process.platform`.
 *
 * - `onlyOn(platform)` skips a test everywhere but that platform.
 * - `requires(present, reason)` skips a test whose external precondition is missing.
 *   Both return the `describe.skipIf`/`it.skipIf`/`test.skipIf` condition; the call site prints the
 *   reason in the test name (a skip carries no message, so the name is where it shows).
 * - `currentPlatform()` is how common code reads the platform it adapts to or fakes.
 */
export function currentPlatform(): NodeJS.Platform {
  return process.platform
}

/** Skip condition for a test that can only run on `platform`; name the test `"… (<platform> only)"`. */
export function onlyOn(platform: NodeJS.Platform): boolean {
  return currentPlatform() !== platform
}

/**
 * Skip condition for a test that needs something outside the repository (a helper executable, a
 * running server, a live profile); name the test `"… (requires <reason>)"`.
 */
export function requires(present: boolean, reason: string): boolean {
  // The reason is not returned: a skip carries no message, so the call site prints `reason` in
  // the test name. The parameter exists so the reason is declared next to the condition.
  void reason;
  return !present
}
