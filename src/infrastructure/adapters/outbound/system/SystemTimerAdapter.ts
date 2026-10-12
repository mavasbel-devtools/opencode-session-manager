import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"

export class SystemTimerAdapter implements TimerPort {
  constructor() {}

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}
