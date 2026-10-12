import { existsSync, readFileSync } from "node:fs"
import type { CommandAnswer, ServerConnection } from "@session-manager/domain/model/Rebuild"
import type { OpencodeServerPort } from "@session-manager/domain/ports/outbound/OpencodeServerPort"

/**
 * The OpenCode server over HTTP: the one this machine's service recorded in `service.json`
 * (`url`, `password`; OpenCode's state folder), and its command endpoint
 * (`POST <url>/api/session/<id>/command`, body `{ name, text }`, HTTP Basic user `opencode`).
 */
export class HttpOpencodeServerAdapter implements OpencodeServerPort {
  private readonly serviceFile: string
  private readonly timeoutMs: number

  constructor(serviceFile: string, timeoutMs: number) {
    this.serviceFile = serviceFile
    this.timeoutMs = timeoutMs
  }

  searched(): string {
    return this.serviceFile
  }

  recorded(): ServerConnection | null {
    if (!existsSync(this.serviceFile)) return null
    try {
      const service = JSON.parse(readFileSync(this.serviceFile, "utf8")) as { url?: unknown; password?: unknown }
      if (typeof service.url !== "string" || service.url === "") return null
      return { url: service.url, password: typeof service.password === "string" && service.password !== "" ? service.password : null }
    } catch {
      return null
    }
  }

  async command(server: ServerConnection, sessionId: string, name: string, text: string): Promise<CommandAnswer> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (server.password !== null) headers["Authorization"] = `Basic ${Buffer.from(`opencode:${server.password}`).toString("base64")}`
    try {
      const response = await fetch(`${server.url.replace(/\/+$/, "")}/api/session/${encodeURIComponent(sessionId)}/command`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (response.ok) return { ok: true }
      const body = await response.text()
      let detail = body.trim() || response.statusText
      try {
        const message = (JSON.parse(body) as { message?: unknown }).message
        if (typeof message === "string") detail = message
      } catch {
        // not JSON: the text itself
      }
      return { ok: false, status: response.status, detail }
    } catch (error) {
      return { ok: false, status: null, detail: error instanceof Error ? error.message : String(error) }
    }
  }
}
