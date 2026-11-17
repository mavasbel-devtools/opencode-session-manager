import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { magicContextEntry } from "@session-manager/domain/services/Jsonc"
import { removeTemporarySync } from "@test/support/live/process"

export const FIXTURES = path.resolve(import.meta.dir, "fixtures")
// Inside the OS temporary directory (resolved: `/tmp` is a symlink on macOS), so the test
// teardown guard accepts the removal.
const TEMP_ROOT = path.join(realpathSync(tmpdir()), "opencode")

/** A fresh temporary directory under /tmp/opencode; remove it with `cleanup`. */
export function tempDir(label = "mc-patches-test"): string {
  mkdirSync(TEMP_ROOT, { recursive: true })
  return mkdtempSync(path.join(TEMP_ROOT, `${label}-`))
}

export function cleanup(directory: string): void {
  // A test may leave read-only folders behind; make them writable so they can be removed.
  Bun.spawnSync(["chmod", "-R", "u+rwx", directory])
  removeTemporarySync(directory)
}

export function write(file: string, text: string): string {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return file
}

/**
 * A home with XDG folders, laid out the way OpenCode 2.0.24 and Magic Context lay them out, so the
 * whole program can run against it with only the environment changed.
 */
export class Sandbox {
  readonly home = tempDir("mc-patches-home")
  readonly cache = path.join(this.home, ".cache")
  readonly config = path.join(this.home, ".config")
  readonly data = path.join(this.home, ".local", "share")
  readonly state = path.join(this.home, ".local", "state")
  readonly tmp = path.join(this.home, "tmp")
  readonly installations = path.join(this.cache, "opencode", "npm", "@cortexkit")

  /** Copies a fixture package as OpenCode installs it (`@<spec>/<stamp>/node_modules/...`); returns its root. */
  install(version: string, spec = version, stamp = "1791693075785"): string {
    const root = path.join(this.installations, `opencode-magic-context@${spec}`, stamp, "node_modules", "@cortexkit", "opencode-magic-context")
    mkdirSync(path.dirname(root), { recursive: true })
    cpSync(path.join(FIXTURES, `magic-context-${version}`), root, { recursive: true })
    return root
  }

  pin(spec: string): void {
    // Shaped like a real opencode.jsonc: line and block comments, escaped quotes, trailing commas.
    write(
      path.join(this.config, "opencode", "opencode.jsonc"),
      `{\n  "$schema": "https://opencode.ai/config.json",\n  /* plugins: "@cortexkit/opencode-magic-context@0.1.0" */\n  "note": "a \\"quoted\\" // not a comment",\n  // pinned\n  "plugins": [\n    "@cortexkit/opencode-magic-context@${spec}",\n  ],\n}\n`,
    )
  }

  threshold(value: number): void {
    write(path.join(this.config, "cortexkit", "magic-context.jsonc"), `{\n  "execute_threshold_percentage": ${value},\n}\n`)
  }

  log(lines: readonly string[]): string {
    return write(path.join(this.tmp, "opencode2", "magic-context", "magic-context.log"), `${lines.join("\n")}\n`)
  }

  /** A /proc with one running `opencode serve`, started `secondsAfterBoot` after a boot at `bootSeconds`. */
  proc(bootSeconds: number, secondsAfterBoot: number): string {
    const proc = path.join(this.home, "proc")
    write(path.join(proc, "stat"), `cpu  1 2 3\nbtime ${bootSeconds}\n`)
    write(path.join(proc, "42", "cmdline"), ["/home/u/.opencode/bin/opencode", "serve", "--service", ""].join("\0"))
    const fields = Array.from({ length: 50 }, (_, i) => String(i))
    fields[19] = String(secondsAfterBoot * 100)
    write(path.join(proc, "42", "stat"), `42 (opencode) ${fields.join(" ")}`)
    return proc
  }

  /** A notify-send stand-in that records its arguments, one call per line. */
  notifier(exitCode = 0): { command: string; calls: string } {
    const calls = path.join(this.home, "notify-calls.txt")
    const command = write(path.join(this.home, "bin", "notify-send"), `#!/bin/sh\nprintf '%s|' "$@" >> '${calls}'\necho >> '${calls}'\nexit ${exitCode}\n`)
    chmodSync(command, 0o755)
    return { command, calls }
  }

  /** A wrapper that runs tests/support/fake-opencode.ts with `mode`, usable as OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN. */
  opencodeStandIn(mode: string): string {
    const script = path.join(import.meta.dir, "fake-opencode.ts")
    const command = write(path.join(this.home, "bin", `opencode-${mode}`), `#!/bin/sh\nexec '${process.execPath}' '${script}' ${mode} "$@"\n`)
    chmodSync(command, 0o755)
    return command
  }

  /**
   * A running OpenCode service, as `service.json` describes it: `locations` locations, each loading
   * whatever this home's opencode.jsonc names (folder entries as `<folder>/index.js`), unless `answer`
   * says otherwise. Returns the server; stop it with `stop(true)`.
   */
  liveServer(locations = 2, answer: ((entry: string | null, pathname: string) => Response | null) | null = null): ReturnType<typeof Bun.serve> {
    const config = path.join(this.config, "opencode", "opencode.jsonc")
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (request.headers.get("authorization") !== `Basic ${btoa("opencode:pw")}`) return new Response("", { status: 401 })
        const url = new URL(request.url)
        const entry = magicContextEntry(readFileSync(config, "utf8"))
        const custom = answer?.(entry, url.pathname) ?? null
        if (custom !== null) return custom
        if (url.pathname === "/api/debug/location") return Response.json(Array.from({ length: locations }, (_, i) => ({ directory: `/work/${i}` })))
        const source = entry === null ? null : entry.startsWith("/") ? { type: "local", path: `${entry}/index.js` } : { type: "package", target: entry }
        const data = source === null ? [] : [{ id: "opencode-magic-context", source, state: { status: "active" } }]
        return Response.json({ location: { directory: url.searchParams.get("directory") }, data })
      },
    })
    write(path.join(this.state, "opencode", "service.json"), JSON.stringify({ url: `http://127.0.0.1:${server.port}`, password: "pw" }))
    return server
  }

  env(extra: Record<string, string> = {}): Record<string, string> {
    return {
      HOME: this.home,
      XDG_CACHE_HOME: this.cache,
      XDG_CONFIG_HOME: this.config,
      XDG_DATA_HOME: this.data,
      XDG_STATE_HOME: this.state,
      TMPDIR: this.tmp,
      ...extra,
    }
  }

  dispose(): void {
    cleanup(this.home)
  }
}

/** Collects what a CLI run prints. */
export function capture() {
  const out: string[] = []
  const err: string[] = []
  return { out, err, output: { out: (text: string) => out.push(text), err: (text: string) => err.push(text) } }
}
