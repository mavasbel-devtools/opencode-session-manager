import { describe, expect, it } from "bun:test"
import {
  classifyResyncError,
  httpStatus,
  isSessionNotFound,
  RESYNC_BACKOFF,
  RESYNC_TRANSIENT_MESSAGES,
} from "@session-manager/domain/model/ResyncRetry"

// F11 — the pure policy behind the re-sync retry: which rejection is worth
// retrying and how long the waits are. The fixtures below are real captures
// from this machine: the host rejects with `{ name, message, cause }` and with
// `{ name, message, causes: [...] }` — note the plural array — and the status
// sometimes lives only in `cause`.
const TRANSIENT_MESSAGES = [
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "epipe",
  "etimedout",
  "socket hang up",
] as const

/** Real captures from this machine, kept byte-for-byte. */
const CAPTURED_TRANSPORT = [
  '{"name":"ClientError","message":"UnexpectedStatus: 503","cause":{"status":503}}',
  '{"name":"ClientError","message":"Transport: ECONNRESET: Unable to connect. Is the computer able to access the url?","causes":[{"name":"TypeError","message":"ECONNRESET: Unable to connect. Is the computer able to access the url?","code":"ECONNRESET"}]}',
  '{"name":"ClientError","message":"Transport: ECONNRESET: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()","causes":[{"name":"TypeError","message":"ECONNRESET: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()","code":"ECONNRESET"}]}',
  '{"name":"ClientError","message":"Transport: ECONNREFUSED: Unable to connect. Is the computer able to access the url?","causes":[{"name":"TypeError","message":"ECONNREFUSED: Unable to connect. Is the computer able to access the url?","code":"ECONNREFUSED"}]}',
] as const

/** The captured JSON as the host hands it over, parsed into an error shape. */
function captured(json: string): unknown {
  return JSON.parse(json)
}

function statusError(status: number): Error {
  const error = new Error(`UnexpectedStatus: ${status}`)
  error.name = "ClientError"
  ;(error as Error & { cause?: { status: number } }).cause = { status }
  return error
}

describe("RESYNC_BACKOFF", () => {
  it("[UC-RR6N] fixes five waits: six attempts and about 15.5 s in total", () => {
    expect(RESYNC_BACKOFF).toEqual([500, 1000, 2000, 4000, 8000])
    expect(RESYNC_BACKOFF).toHaveLength(5)
    expect(RESYNC_BACKOFF.reduce((total: number, wait: number) => total + wait, 0)).toBe(15500)
  })
})

describe("RESYNC_TRANSIENT_MESSAGES", () => {
  it("[UC-RR2] holds exactly the nine lowercase transport fragments the host emits", () => {
    expect(RESYNC_TRANSIENT_MESSAGES).toEqual([...TRANSIENT_MESSAGES])
  })
})

describe("isSessionNotFound", () => {
  it("[UC-RR3N] reads both tags the host uses", () => {
    expect(isSessionNotFound({ name: "SessionNotFoundError" })).toBe(true)
    expect(isSessionNotFound({ _tag: "SessionNotFoundError" })).toBe(true)
    expect(isSessionNotFound({ name: "SessionNotFoundError", _tag: "SessionNotFoundError" })).toBe(true)
  })

  it("[UC-RR3N] reads any other tag as not a not-found error", () => {
    expect(isSessionNotFound({ name: "ClientError", _tag: "BadRequest" })).toBe(false)
    expect(isSessionNotFound({ name: "SessionNotFound" })).toBe(false)
  })

  it("[UC-RR3N] never throws on a non-object, null or a primitive", () => {
    expect(isSessionNotFound(null)).toBe(false)
    expect(isSessionNotFound(undefined)).toBe(false)
    expect(isSessionNotFound("SessionNotFoundError")).toBe(false)
    expect(isSessionNotFound(503)).toBe(false)
  })
})

describe("httpStatus", () => {
  it("[UC-RR10N] reads error.status", () => {
    expect(httpStatus({ status: 500 })).toBe(500)
  })

  it("[UC-RR1] reads error.cause.status when the error itself has none", () => {
    expect(httpStatus({ message: "boom", cause: { status: 503 } })).toBe(503)
  })

  it("[UC-RR1] reads UnexpectedStatus out of the message", () => {
    expect(httpStatus({ message: "UnexpectedStatus: 503" })).toBe(503)
    expect(httpStatus({ message: "unexpectedstatus: 404" })).toBe(404)
  })

  it("[UC-RR2] prefers status over cause over the message", () => {
    expect(httpStatus({ status: 400, cause: { status: 500 }, message: "UnexpectedStatus: 503" })).toBe(400)
    expect(httpStatus({ cause: { status: 500 }, message: "UnexpectedStatus: 503" })).toBe(500)
  })

  it("[UC-RR2] answers undefined when no status is recoverable", () => {
    expect(httpStatus(new Error("boom"))).toBeUndefined()
    expect(httpStatus(null)).toBeUndefined()
    expect(httpStatus("UnexpectedStatus: 503")).toBeUndefined()
  })
})

describe("classifyResyncError", () => {
  it("[UC-RR3N] classifies a SessionNotFoundError as missing", () => {
    expect(classifyResyncError({ name: "SessionNotFoundError", message: "Session not found: ses_a" })).toBe("missing")
    expect(classifyResyncError({ _tag: "SessionNotFoundError", message: "Session not found: ses_a" })).toBe("missing")
  })

  it("[UC-RR4N] classifies a 404 as missing", () => {
    expect(classifyResyncError(statusError(404))).toBe("missing")
    expect(classifyResyncError({ message: "UnexpectedStatus: 404" })).toBe("missing")
  })

  it("[UC-RR1] classifies a 503 as transient", () => {
    expect(classifyResyncError(statusError(503))).toBe("transient")
    expect(classifyResyncError({ message: "UnexpectedStatus: 503" })).toBe("transient")
  })

  it("[UC-RR10N] classifies 400, 401 and 500 as other", () => {
    expect(classifyResyncError(statusError(400))).toBe("other")
    expect(classifyResyncError(statusError(401))).toBe("other")
    expect(classifyResyncError(statusError(500))).toBe("other")
  })

  it("[UC-RR10N] classifies an unknown shape as other", () => {
    expect(classifyResyncError(new Error("boom"))).toBe("other")
    expect(classifyResyncError(null)).toBe("other")
    expect(classifyResyncError("ECONNRESET")).toBe("other")
  })

  for (const message of TRANSIENT_MESSAGES) {
    it(`[UC-RR2] classifies "${message}" in the message as transient`, () => {
      expect(classifyResyncError({ message: `Transport: ${message.toUpperCase()}: gone` })).toBe("transient")
    })

    it(`[UC-RR2] classifies "${message}" as a code as transient`, () => {
      expect(classifyResyncError({ message: "boom", code: message.toUpperCase() })).toBe("transient")
    })

    it(`[UC-RR2] classifies "${message}" at cause depth 1 as transient`, () => {
      expect(classifyResyncError({ message: "boom", cause: { message } })).toBe("transient")
    })
  }

  it("[UC-RR2] reads a transient code from the plural causes array when the message carries no fragment", () => {
    expect(classifyResyncError({ name: "Error", message: "Unexpected error", causes: [{ code: "ECONNRESET" }] })).toBe("transient")
  })

  it("[UC-RR2] walks the plural causes array the real host emits", () => {
    expect(classifyResyncError(captured(CAPTURED_TRANSPORT[1]!))).toBe("transient")
    expect(classifyResyncError(captured(CAPTURED_TRANSPORT[2]!))).toBe("transient")
    expect(classifyResyncError(captured(CAPTURED_TRANSPORT[3]!))).toBe("transient")
  })

  it("[UC-RR1] classifies the captured status-503 body as transient", () => {
    expect(httpStatus(captured(CAPTURED_TRANSPORT[0]!))).toBe(503)
    expect(classifyResyncError(captured(CAPTURED_TRANSPORT[0]!))).toBe("transient")
  })

  it("[UC-RR2] stops at cause depth 5: a code at depth 6 is not transient", () => {
    const depthFive = {
      message: "boom",
      cause: {
        message: "cause 1",
        cause: {
          message: "cause 2",
          cause: {
            message: "cause 3",
            cause: { message: "cause 4", cause: { message: "cause 5", code: "ECONNRESET" } },
          },
        },
      },
    }
    expect(classifyResyncError(depthFive)).toBe("transient")

    const depthSix = {
      message: "boom",
      cause: {
        message: "cause 1",
        cause: {
          message: "cause 2",
          cause: {
            message: "cause 3",
            cause: {
              message: "cause 4",
              cause: { message: "cause 5", cause: { message: "cause 6", code: "ECONNRESET" } },
            },
          },
        },
      },
    }
    expect(classifyResyncError(depthSix)).toBe("other")
  })
})
