// The feature F1 component suite: the plugin wired by the real composition
// root createTuiContainer, the stand-in TUI context fakeTuiContext(), and the
// fake Herdr socket startFakeHerdr(). It uses no OpenCode and no Herdr process.
import { describe, expect, it } from "bun:test"
import { createTuiContainer } from "@session-manager/main/tui-container"
import { fakeTuiContext } from "@test/support/fakes/hosts"
import { startFakeHerdr, type FakeHerdr, type HerdrRequest } from "@test/support/fakes/herdr-socket"

function fields(r: HerdrRequest) {
  return {
    title: r.params["title"],
    display_agent: r.params["display_agent"],
    clear: r.params["clear_title"] === true && r.params["clear_display_agent"] === true,
  }
}

async function waitFor(herdr: FakeHerdr, count: number, timeoutMilliseconds = 5000): Promise<void> {
  const started = Date.now()
  while (herdr.requests.length < count) {
    if (Date.now() - started > timeoutMilliseconds) throw new Error(`timed out waiting for ${count} requests`)
    await Bun.sleep(10)
  }
}

const environmentOf = (herdr: FakeHerdr) => ({
  HERDR_ENV: "1",
  HERDR_SOCKET_PATH: herdr.socketPath,
  HERDR_PANE_ID: "w5:p1",
})

describe("herdr pane presentation", () => {
  it("[UC-1] a root session: its agent and its title", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: "Update magic-context", display_agent: "plan", clear: false })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-1N] a session not loaded yet: nothing until it loads", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await Bun.sleep(600)
        expect(herdr.requests.length).toBe(0)
        context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "plan" })
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: "T", display_agent: "plan", clear: false })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-2] a sub-agent session: its own agent, its root's title", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "plan" })
      context.sessions.set("ses_c", { id: "ses_c", parentID: "ses_r", title: "child", agent: "explore" })
      context.route = { type: "session", sessionID: "ses_c" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: "T", display_agent: "explore", clear: false })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-2N] a parent chain that loops: nothing", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("a", { id: "a", parentID: "b" })
      context.sessions.set("b", { id: "b", parentID: "a" })
      context.route = { type: "session", sessionID: "a" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await Bun.sleep(600)
        expect(herdr.requests.length).toBe(0)
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-3] the session's agent changes: one new report", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "build" })
        await waitFor(herdr, 2)
        expect(fields(herdr.requests[1]!)).toEqual({ title: "Update magic-context", display_agent: "build", clear: false })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-3N] nothing changes: nothing is resent within a read cycle", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        await Bun.sleep(1000)
        expect(herdr.requests.length).toBe(1)
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-4] the root is renamed: one new report, same agent", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        context.sessions.set("ses_r", { id: "ses_r", title: "Renamed", agent: "plan" })
        await waitFor(herdr, 2)
        expect(fields(herdr.requests[1]!)).toEqual({ title: "Renamed", display_agent: "plan", clear: false })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-4N] the title becomes only whitespace: title left out, agent kept", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        context.sessions.set("ses_r", { id: "ses_r", title: " \u0007 ", agent: "plan" })
        await waitFor(herdr, 2)
        const params = herdr.requests[1]!.params
        expect(params["display_agent"]).toBe("plan")
        expect("title" in params).toBe(false)
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-5] no agent yet: title only", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "T" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: "T", display_agent: undefined, clear: false })
        expect("display_agent" in herdr.requests[0]!.params).toBe(false)
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-5N] neither agent nor title: clear", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: undefined, display_agent: undefined, clear: true })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-6] home screen: clear", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.route = { type: "home" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: undefined, display_agent: undefined, clear: true })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-6N] a session route without an id: clear", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.route = { type: "session" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        expect(fields(herdr.requests[0]!)).toEqual({ title: undefined, display_agent: undefined, clear: true })
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-7] a report Herdr refused is sent again on the next read", async () => {
    const herdr = await startFakeHerdr()
    try {
      herdr.answer = "error"
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      try {
        await waitFor(herdr, 1)
        herdr.answer = "ok"
        await waitFor(herdr, 2)
        expect(herdr.requests.length).toBeGreaterThanOrEqual(2)
        expect(herdr.requests[0]!.params["title"]).toBe(herdr.requests[1]!.params["title"])
        expect(herdr.requests[0]!.params["display_agent"]).toBe(herdr.requests[1]!.params["display_agent"])
      } finally {
        cleanup()
      }
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-7N] garbage, a hang-up and silence never throw and are retried", async () => {
    let unhandled = 0
    const onUnhandled = () => unhandled++
    process.on("unhandledRejection", onUnhandled)
    try {
      for (const answer of ["garbage", "close", "silent"] as const) {
        const herdr = await startFakeHerdr()
        try {
          herdr.answer = answer
          const context = fakeTuiContext()
          context.sessions.set("ses_r", { id: "ses_r", title: "T", agent: "plan" })
          context.route = { type: "session", sessionID: "ses_r" }
          const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
          try {
            await waitFor(herdr, 2)
            expect(herdr.requests.length).toBeGreaterThanOrEqual(2)
          } finally {
            cleanup()
          }
        } finally {
          await herdr.stop()
        }
      }
      expect(unhandled).toBe(0)
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })

  it("[UC-8] exit clears both values once", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.sessions.set("ses_r", { id: "ses_r", title: "Update magic-context", agent: "plan" })
      context.route = { type: "session", sessionID: "ses_r" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      await waitFor(herdr, 1)
      cleanup()
      await waitFor(herdr, 2)
      expect(fields(herdr.requests.at(-1)!)).toEqual({ title: undefined, display_agent: undefined, clear: true })
      expect(herdr.requests).toHaveLength(2)
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-8N] exit when the pane shows its defaults sends nothing more", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      context.route = { type: "home" }
      const cleanup = createTuiContainer(context.client, environmentOf(herdr), "linux").paneTitle!.register(context)
      await waitFor(herdr, 1)
      cleanup()
      await Bun.sleep(300)
      expect(herdr.requests).toHaveLength(1)
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-9] outside Herdr: not wired", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      expect(createTuiContainer(context.client, {}, "linux").paneTitle).toBeUndefined()
      expect(herdr.requests.length).toBe(0)
    } finally {
      await herdr.stop()
    }
  })

  it("[UC-9N] HERDR_ENV without a socket or a pane: not wired", async () => {
    const herdr = await startFakeHerdr()
    try {
      const context = fakeTuiContext()
      expect(createTuiContainer(context.client, { HERDR_ENV: "1" }, "linux").paneTitle).toBeUndefined()
      expect(herdr.requests.length).toBe(0)
    } finally {
      await herdr.stop()
    }
  })
})
