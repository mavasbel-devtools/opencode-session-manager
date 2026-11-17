import { describe, expect, it } from "bun:test"
import { RestoreAfterReconnectUseCase } from "@session-manager/application/RestoreAfterReconnectUseCase"
import { VERIFY_BACKOFF, WINDOW } from "@session-manager/domain/model/ReconnectRestore"
import type { RestoreAfterReconnectPort } from "@session-manager/domain/ports/inbound/RestoreAfterReconnectPort"
import type {
  RestoreNotice,
  SessionNavigatorPort,
  VerifyResult,
} from "@session-manager/domain/ports/outbound/SessionNavigatorPort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"

type Script = VerifyResult | Promise<VerifyResult>

/** Outbound stand-in: scripted verify outcomes, recording opens and notices. */
class FakeNavigator implements SessionNavigatorPort {
  readonly verifies: string[] = []
  readonly opens: string[] = []
  readonly notices: RestoreNotice[] = []

  constructor(private readonly script: Script[] = ["exists"]) {}

  async verify(sessionID: string): Promise<VerifyResult> {
    this.verifies.push(sessionID)
    return (this.script.shift() ?? "failed") as VerifyResult
  }

  open(sessionID: string): void {
    this.opens.push(sessionID)
  }

  notify(notice: RestoreNotice): void {
    this.notices.push(notice)
  }
}

/** Timer stand-in: records every delay and never waits. */
class FakeTimer implements TimerPort {
  readonly sleeps: number[] = []

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds)
  }
}

const flush = () => Bun.sleep(20)

function setup(script?: Script[]) {
  const navigator = new FakeNavigator(script)
  const timer = new FakeTimer()
  const useCase: RestoreAfterReconnectPort = new RestoreAfterReconnectUseCase(navigator, timer)
  return { navigator, timer, useCase }
}

async function restoreOnce(useCase: RestoreAfterReconnectPort, sessionID: string) {
  useCase.observeRoute({ type: "session", sessionID })
  useCase.observeConnected(Date.now())
  useCase.observeRoute({ type: "home" })
  await flush()
}

describe("RestoreAfterReconnectUseCase", () => {
  it("[UC-R1] restores the session left for home right after a reconnect", async () => {
    const { navigator, timer, useCase } = setup()
    await restoreOnce(useCase, "ses_a")
    // One sleep before the first attempt: the TUI's own re-sync (S2) gets a
    // head start, and the five sleeps add up to the ≈15.5 s of VERIFY_BACKOFF.
    expect(timer.sleeps).toEqual([VERIFY_BACKOFF[0]])
    expect(navigator.verifies).toEqual(["ses_a"])
    expect(navigator.opens).toEqual(["ses_a"])
    expect(navigator.notices).toHaveLength(1)
    expect(navigator.notices[0]!.variant).toBe("success")
    expect(navigator.notices[0]!.message).toContain("ses_a")
  })

  it("[UC-R1] restores when the reconnect lands just after home", async () => {
    const { navigator, useCase } = setup()
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual([])
    useCase.observeConnected(Date.now())
    await flush()
    expect(navigator.verifies).toEqual(["ses_a"])
    expect(navigator.opens).toEqual(["ses_a"])
  })

  it("[UC-R2N] does nothing when home has no recent reconnect", async () => {
    const { navigator, timer, useCase } = setup()
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual([])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
    expect(timer.sleeps).toEqual([])
  })

  it("[UC-R2N] does nothing when the reconnect is older than WINDOW", async () => {
    const { navigator, useCase } = setup()
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeConnected(Date.now() - WINDOW - 60000)
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual([])
    expect(navigator.opens).toEqual([])
  })

  it("[UC-R3N] does nothing for a deleted session", async () => {
    const { navigator, useCase } = setup()
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeDeleted("ses_a")
    useCase.observeConnected(Date.now())
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual([])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
  })

  it("[UC-R3N] does nothing when verify reports the session missing", async () => {
    const { navigator, useCase } = setup(["missing"])
    await restoreOnce(useCase, "ses_a")
    expect(navigator.verifies).toEqual(["ses_a"])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
  })

  it("[UC-R4N] gives up after VERIFY_BACKOFF with one info notice", async () => {
    const { navigator, timer, useCase } = setup(["failed", "failed", "failed", "failed", "failed"])
    await restoreOnce(useCase, "ses_a")
    // Five sleeps then five attempts: the ≈15.5 s the plan budgets.
    for (let round = 0; round < 4; round++) await flush()
    expect(navigator.verifies).toEqual(["ses_a", "ses_a", "ses_a", "ses_a", "ses_a"])
    expect(timer.sleeps).toEqual([...VERIFY_BACKOFF])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toHaveLength(1)
    expect(navigator.notices[0]!.variant).toBe("info")
  })

  it("[UC-R5N] aborts when the route leaves home during verify", async () => {
    let release: (result: VerifyResult) => void = () => undefined
    const gate = new Promise<VerifyResult>((resolve) => {
      release = resolve
    })
    const { navigator, useCase } = setup([gate])
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeConnected(Date.now())
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual(["ses_a"])
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    release("exists")
    await flush()
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
    expect(navigator.verifies).toEqual(["ses_a"])
  })

  it("[UC-R6N] refuses another restore once RESTORE_LIMIT is reached", async () => {
    const { navigator, useCase } = setup(["exists", "exists", "exists"])
    await restoreOnce(useCase, "ses_a")
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    await restoreOnce(useCase, "ses_a")
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    await restoreOnce(useCase, "ses_a")
    expect(navigator.opens).toEqual(["ses_a", "ses_a", "ses_a"])
    await restoreOnce(useCase, "ses_a")
    expect(navigator.verifies).toEqual(["ses_a", "ses_a", "ses_a"])
    expect(navigator.opens).toEqual(["ses_a", "ses_a", "ses_a"])
  })

  it("[UC-R8] dispose aborts a pending verify without navigating", async () => {
    let release: (result: VerifyResult) => void = () => undefined
    const gate = new Promise<VerifyResult>((resolve) => {
      release = resolve
    })
    const { navigator, useCase } = setup([gate])
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeConnected(Date.now())
    useCase.observeRoute({ type: "home" })
    await flush()
    expect(navigator.verifies).toEqual(["ses_a"])
    useCase.dispose()
    release("exists")
    await flush()
    expect(navigator.verifies).toEqual(["ses_a"])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
  })

  it("[UC-R7N] ignores a session-to-session route change", async () => {
    const { navigator, timer, useCase } = setup()
    useCase.observeRoute({ type: "session", sessionID: "ses_a" })
    useCase.observeConnected(Date.now())
    useCase.observeRoute({ type: "session", sessionID: "ses_b" })
    await flush()
    expect(navigator.verifies).toEqual([])
    expect(navigator.opens).toEqual([])
    expect(navigator.notices).toEqual([])
    expect(timer.sleeps).toEqual([])
  })
})
