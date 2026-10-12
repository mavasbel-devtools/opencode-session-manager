import { existsSync, readFileSync } from "node:fs"
import type { CommandAnswer, ForkAnswer, ServerConnection } from "@session-manager/domain/model/Rebuild"
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
    const answer = await this.post(server, sessionId, "command", { name, text })
    return answer.ok ? { ok: true } : answer
  }

  async fork(server: ServerConnection, sessionId: string, before: string | null): Promise<ForkAnswer> {
    const answer = await this.post(server, sessionId, "fork", before === null ? {} : { before })
    if (!answer.ok) return answer
    const data = (answer.body as { data?: { id?: unknown; title?: unknown; fork?: { boundary?: unknown }; location?: { directory?: unknown } } } | null)?.data
    if (typeof data?.id !== "string") return { ok: false, status: 200, detail: "the answer names no session" }
    const boundary = data.fork?.boundary as { type?: unknown; messageID?: unknown } | undefined
    return {
      ok: true,
      session: {
        id: data.id,
        title: typeof data.title === "string" ? data.title : null,
        boundary:
          (boundary?.type === "through" || boundary?.type === "before") && typeof boundary.messageID === "string"
            ? { type: boundary.type, messageID: boundary.messageID }
            : null,
        directory: typeof data.location?.directory === "string" ? data.location.directory : null,
      },
    }
  }

  /** `POST <url>/api/session/<id>/<route>`; a refusal's detail is the server's message when it gives one. */
  private async post(
    server: ServerConnection,
    sessionId: string,
    route: string,
    payload: unknown,
  ): Promise<{ readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly status: number | null; readonly detail: string }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (server.password !== null) headers["Authorization"] = `Basic ${Buffer.from(`opencode:${server.password}`).toString("base64")}`
    try {
      const response = await fetch(`${server.url.replace(/\/+$/, "")}/api/session/${encodeURIComponent(sessionId)}/${route}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      const body = await response.text()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(body)
      } catch {
        // not JSON (or empty): the text itself
      }
      if (response.ok) return { ok: true, body: parsed }
      const message = (parsed as { message?: unknown } | null)?.message
      return { ok: false, status: response.status, detail: typeof message === "string" ? message : body.trim() || response.statusText }
    } catch (error) {
      return { ok: false, status: null, detail: error instanceof Error ? error.message : String(error) }
    }
  }
}
