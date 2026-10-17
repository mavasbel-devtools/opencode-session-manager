// A stand-in for Herdr's API socket (herdr.dev/docs/socket-api): newline-delimited
// JSON, one response line per request line. It records every request and answers
// the way it is told to, so the adapter's handling of each kind of answer is
// observable without the user's Herdr. The real Herdr is used in tests/live.
import { mkdtemp } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { removeTemporary } from "@test/support/live/process"

/**
 * `ok`: `{ result }` as Herdr accepts a report; `error`: `{ error }`; `garbage`: a
 * line that is not JSON; `split`: `ok` sent in two pieces; `silent`: no answer;
 * `close`: hangs up without answering.
 */
export type HerdrAnswer = "ok" | "error" | "garbage" | "split" | "silent" | "close"

export interface HerdrRequest {
  readonly id: string
  readonly method: string
  readonly params: Record<string, unknown>
}

export interface FakeHerdr {
  readonly socketPath: string
  readonly requests: HerdrRequest[]
  answer: HerdrAnswer
  stop(): Promise<void>
}

export async function startFakeHerdr(): Promise<FakeHerdr> {
  // Unix socket paths are limited to ~108 bytes, so the folder name stays short.
  const folder = await mkdtemp(path.join(os.tmpdir(), "osm-herdr-"))
  const socketPath = path.join(folder, "herdr.sock")
  const sockets = new Set<net.Socket>()
  const fake: FakeHerdr = {
    socketPath,
    requests: [],
    answer: "ok",
    async stop() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await removeTemporary(folder)
    },
  }
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8")
      let end = buffer.indexOf("\n")
      while (end !== -1) {
        const request = JSON.parse(buffer.slice(0, end)) as HerdrRequest
        buffer = buffer.slice(end + 1)
        fake.requests.push(request)
        respond(socket, request, fake.answer)
        end = buffer.indexOf("\n")
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  return fake
}

function respond(socket: net.Socket, request: HerdrRequest, answer: HerdrAnswer) {
  const ok = JSON.stringify({ id: request.id, result: { type: "ok" } })
  if (answer === "ok") socket.write(`${ok}\n`)
  if (answer === "error") socket.write(`${JSON.stringify({ id: request.id, error: { code: "not_found", message: "pane not found" } })}\n`)
  if (answer === "garbage") socket.write("not json\n")
  if (answer === "split") {
    socket.write(ok.slice(0, 10))
    setTimeout(() => socket.write(`${ok.slice(10)}\n`), 20)
  }
  if (answer === "close") socket.end()
}
