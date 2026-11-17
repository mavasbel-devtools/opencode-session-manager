import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import { FIXTURES, write } from "@test/support/patches/sandbox"

export interface Tarball {
  readonly version: string
  readonly bytes: Uint8Array
  readonly integrity: string
}

/**
 * An npm tarball of a reviewed fixture (its four upstream files and reduced package.json), with
 * `edit` applied to its files first: `package/` prefix, gzip, sha512 integrity, as `npm pack` makes them.
 */
export function tarball(work: string, fixture: string, version = fixture, edit: (root: string) => void = () => {}): Tarball {
  const folder = path.join(work, `pack-${version}-${Math.random().toString(36).slice(2)}`)
  const root = path.join(folder, "package")
  mkdirSync(folder, { recursive: true })
  cpSync(path.join(FIXTURES, `magic-context-${fixture}`), root, { recursive: true })
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, unknown>
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ ...manifest, version, main: "index.js" }))
  write(path.join(root, "index.js"), "export default {}\n")
  edit(root)
  const file = path.join(folder, "package.tgz")
  const run = Bun.spawnSync(["tar", "-czf", file, "-C", folder, "package"])
  if (run.exitCode !== 0) throw new Error(run.stderr.toString())
  const bytes = new Uint8Array(readFileSync(file))
  return { version, bytes, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` }
}

/** A local npm registry serving Magic Context's abbreviated packument and tarballs; `latest` is settable. */
export class LocalRegistry {
  readonly requests: string[] = []
  latest: string | null
  /** Every request fails (503). */
  failures = false
  /** Only tarball downloads fail (404), so the packument still answers. */
  tarballFailures = false
  private readonly server: ReturnType<typeof Bun.serve>

  constructor(private readonly tarballs: readonly Tarball[], latest: string | null = tarballs.at(-1)?.version ?? null) {
    this.latest = latest
    this.server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => this.answer(request) })
  }

  get url(): string {
    return `http://127.0.0.1:${this.server.port}`
  }

  private answer(request: Request): Response {
    const { pathname } = new URL(request.url)
    this.requests.push(pathname)
    if (this.failures) return new Response("down", { status: 503 })
    if (decodeURIComponent(pathname) === `/${MAGIC_CONTEXT_PACKAGE}`) {
      const versions = Object.fromEntries(
        this.tarballs.map((t) => [t.version, { name: MAGIC_CONTEXT_PACKAGE, version: t.version, dist: { tarball: `${this.url}/tarballs/${t.version}.tgz`, integrity: t.integrity } }]),
      )
      return Response.json({ name: MAGIC_CONTEXT_PACKAGE, "dist-tags": this.latest === null ? {} : { latest: this.latest }, versions })
    }
    const tarball = this.tarballFailures ? undefined : this.tarballs.find((t) => pathname === `/tarballs/${t.version}.tgz`)
    return tarball === undefined ? new Response("not found", { status: 404 }) : new Response(new Blob([tarball.bytes as Uint8Array<ArrayBuffer>]))
  }

  stop(): void {
    this.server.stop(true)
  }
}
