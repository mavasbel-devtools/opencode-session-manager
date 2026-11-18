// Fault proxy for the home-reset fix (plan 2026-11-16-22-17, Step 3.1).
//
// Why it exists: on every event-stream reconnect the session route re-syncs,
// and a thrown re-sync error toasts and navigates home (tabs off) or closes
// the tab (tabs on) — packages/tui/src/routes/session/index.tsx:342-373 on
// base1 f5086ef8a24b18e62d5d61fa55b10563d57d5426 (sync -> !info -> catch ->
// navigate/close; see docs/temp/2026-11-16-22-17-home-reset-fix-evidence/
// upstream-evidence.md). This proxy reproduces that production shape against a
// real TUI: stall the SSE stream so the 45s watchdog in
// packages/client/src/solid/connection.ts:35,85-91,97-115 fires and the client
// reconnects, then fail the re-sync GET once.
//
// Stall design (RCA Step 3.2): the proxy forwards the upstream SSE response,
// relays its headers and the first complete SSE event (`server.connected`),
// then swallows all further bytes (including `: heartbeat`) and holds the
// connection open. A zero-byte stream RSTs Bun fetch clients, so the
// relay-first-event shape is load-bearing, not incidental.
//
// Bun.serve runs with idleTimeout 120: Bun's default 10s kills idle SSE
// connections, which would break the stall before the 45s watchdog fires.
//
// `stall-then-hold` holds the first target GET open forever instead of
// answering it, so a client that gives up — or a proxy that is stopped — sees a
// real transport failure (a reset, an aborted fetch), never an HTTP status.
// The request it records carries status 0, because no response was ever
// written.

export type FaultMode = "pass" | "stall" | "stall-then-fail" | "stall-then-404" | "stall-then-hold";

export interface FaultRequest {
  readonly ts: number;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

export interface FaultProxyOptions {
  readonly upstream: string;
  readonly targetSessionID: string;
  readonly port?: number;
}

export interface FaultProxy {
  readonly url: string;
  setMode(mode: FaultMode): void;
  mode(): FaultMode;
  requests(): ReadonlyArray<FaultRequest>;
  stop(): void;
}

const VALID_MODES: ReadonlyArray<FaultMode> = [
  "pass",
  "stall",
  "stall-then-fail",
  "stall-then-404",
  "stall-then-hold",
];

export function isFaultMode(value: string): value is FaultMode {
  return (VALID_MODES as ReadonlyArray<string>).includes(value);
}

function copyHeaders(source: Headers): Headers {
  const out = new Headers();
  source.forEach((value, key) => {
    out.set(key, value);
  });
  return out;
}

function forwardRequestHeaders(source: Headers): Headers {
  const out = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") return;
    out.set(key, value);
  });
  return out;
}

/** Read upstream until the first complete SSE event (up to and including the
 *  first blank line), then return it. The caller cancels the upstream body. */
async function readFirstSseEvent(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.value !== undefined) text += decoder.decode(next.value, { stream: true });
      if (text.includes("\n\n") || next.done === true) break;
    }
    text += decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Upstream already closed; nothing to cancel.
    }
  }
  const end = text.indexOf("\n\n");
  const first = end >= 0 ? text.slice(0, end + 2) : text;
  return new TextEncoder().encode(first);
}

/** The server's real 404 body shape, recorded in Step 3.2 at
 *  `{E}/spike-404-body.json` (`GET /api/session/ses_doesnotexist000000000000`
 *  against the disposable 2.3.0 service):
 *  `{"_tag":"SessionNotFoundError","sessionID":"...","message":"Session not found: ..."}`.
 *  Returned with the requested sessionID substituted, so `stall-then-404`
 *  reproduces the production not-found payload for the spike target. */
function notFoundBody(sessionID: string): string {
  return JSON.stringify({
    _tag: "SessionNotFoundError",
    sessionID,
    message: `Session not found: ${sessionID}`,
  });
}

export function startFaultProxy(options: FaultProxyOptions): FaultProxy {
  const base = options.upstream.replace(/\/+$/, "");
  const target = options.targetSessionID;
  let current: FaultMode = "pass";
  let failedOnce = false;
  let stalledOnce = false;
  const log: Array<FaultRequest> = [];

  function record(method: string, path: string, status: number): void {
    log.push({ ts: Date.now(), method, path, status });
    const requestLog = process.env["REQUEST_LOG"];
    if (requestLog !== undefined && requestLog !== "") {
      try {
        require("node:fs").appendFileSync(
          requestLog,
          `${JSON.stringify({ ts: Date.now(), method, path, status, mode: current })}\n`,
        );
      } catch {
        // request logging must never break the proxy
      }
    }
  }

  // One-shot semantics (Step 3.2 spike finding): the mode file poll calls
  // setMode only on change, so after the single failure fires the proxy must
  // NOT re-arm from the still-armed file — otherwise the probe's own verify
  // sync (milliseconds after the TUI's re-sync) eats a second 503 and every
  // later target GET fails too. Firing therefore sets failedOnce and lets
  // later event streams pass, without touching current; re-arming is an
  // explicit mode edge (e.g. write "stall" then "stall-then-fail").
  // Likewise only the first stalled stream per arm actually stalls
  // (stalledOnce): the reconnect that the watchdog fires would otherwise
  // stall its own replacement stream and schedule a second watchdog
  // reconnect 45 s later. setMode resets both flags on every call, and the
  // CLI only calls it when
  // the file content differs from the current mode.
  const server = Bun.serve({
    port: options.port ?? 0,
    idleTimeout: 120,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const path = `${url.pathname}${url.search}`;
      const method = req.method.toUpperCase();

      const isTargetGet =
        method === "GET" && url.pathname === `/api/session/${target}` && url.search === "";
      if (
        isTargetGet &&
        (current === "stall-then-fail" || current === "stall-then-404" || current === "stall-then-hold") &&
        failedOnce === false
      ) {
        failedOnce = true;
        if (current === "stall-then-hold") {
          record(method, path, 0);
          // Never settle: the client waits until it gives up or the proxy stops.
          return new Promise<Response>(() => {});
        }
        if (current === "stall-then-fail") {
          record(method, path, 503);
          return new Response("", { status: 503 });
        }
        record(method, path, 404);
        return new Response(notFoundBody(target), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      const isEventStream = method === "GET" && url.pathname.startsWith("/api/event");
      if (isEventStream && current !== "pass" && stalledOnce === false) {
        stalledOnce = true;
        const upstreamRes = await fetch(`${base}${path}`, {
          method,
          headers: forwardRequestHeaders(req.headers),
        });
        if (upstreamRes.body === null) {
          record(method, path, upstreamRes.status);
          return new Response("", { status: upstreamRes.status });
        }
        const first = await readFirstSseEvent(upstreamRes.body);
        const headers = copyHeaders(upstreamRes.headers);
        headers.set("content-type", "text/event-stream");
        headers.set("cache-control", "no-cache");
        headers.delete("content-length");
        // Bun's fetch already decompressed the upstream body; forwarding the
        // original content-encoding would make the TUI decompress twice
        // (BrotliDecompressionError in the 2.3.0 TUI through the proxy).
        headers.delete("content-encoding");
        record(method, path, upstreamRes.status);
        // Enqueue the first event, then never enqueue or close: the client
        // sees server.connected, then silence until its watchdog fires.
        const stalled = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(first);
          },
        });
        return new Response(stalled, { status: upstreamRes.status, headers });
      }

      let body: ArrayBuffer | undefined;
      if (method !== "GET" && method !== "HEAD") body = await req.arrayBuffer();
      let upstreamRes: Response;
      if (body === undefined) {
        upstreamRes = await fetch(`${base}${path}`, {
          method,
          headers: forwardRequestHeaders(req.headers),
        });
      } else {
        upstreamRes = await fetch(`${base}${path}`, {
          method,
          headers: forwardRequestHeaders(req.headers),
          body,
        });
      }
      // Stream the body through untouched: buffering here would hang forever
      // on the never--ending /api/event stream in pass mode. Bun's fetch
      // already decompressed it, so drop content-encoding/length (see above).
      record(method, path, upstreamRes.status);
      const passthrough = copyHeaders(upstreamRes.headers);
      passthrough.delete("content-encoding");
      passthrough.delete("content-length");
      return new Response(upstreamRes.body, { status: upstreamRes.status, headers: passthrough });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    setMode(next: FaultMode): void {
      current = next;
      failedOnce = false;
      stalledOnce = false;
    },
    mode(): FaultMode {
      return current;
    },
    requests(): ReadonlyArray<FaultRequest> {
      return log;
    },
    stop(): void {
      server.stop(true);
    },
  };
}

// CLI entry: UPSTREAM, TARGET_SID, PORT (optional), MODE_FILE (optional path
// holding the mode name, polled every 200ms so a spike run can flip modes
// without restarting the proxy).
if (import.meta.main) {
  const upstream = process.env["UPSTREAM"];
  const targetSid = process.env["TARGET_SID"];
  if (upstream === undefined || upstream === "") {
    console.error("fault-proxy: UPSTREAM is required");
    process.exit(1);
  }
  if (targetSid === undefined || targetSid === "") {
    console.error("fault-proxy: TARGET_SID is required");
    process.exit(1);
  }
  const portRaw = process.env["PORT"];
  const port = portRaw === undefined || portRaw === "" ? undefined : Number(portRaw);
  if (port !== undefined && Number.isNaN(port)) {
    console.error(`fault-proxy: PORT is not a number: ${portRaw}`);
    process.exit(1);
  }
  const proxy =
    port === undefined
      ? startFaultProxy({ upstream, targetSessionID: targetSid })
      : startFaultProxy({ upstream, targetSessionID: targetSid, port });
  const modeFile = process.env["MODE_FILE"];
  async function pollModeFile(): Promise<void> {
    if (modeFile === undefined || modeFile === "") return;
    try {
      const raw = (await Bun.file(modeFile).text()).trim();
      if (raw !== "" && isFaultMode(raw) && raw !== proxy.mode()) {
        proxy.setMode(raw);
        console.log(`fault-proxy: mode -> ${raw}`);
      }
    } catch {
      // Mode file absent or unreadable; keep the current mode.
    }
  }
  await pollModeFile();
  const timer = setInterval(() => {
    void pollModeFile();
  }, 200);
  const shutdown = (): void => {
    clearInterval(timer);
    proxy.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`fault-proxy: ${proxy.url} -> ${upstream} (target ${targetSid})`);
}
