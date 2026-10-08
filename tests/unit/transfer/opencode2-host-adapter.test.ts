import { describe, it, expect } from "bun:test"
import { OpenCode2HostAdapter, SESSION_LIMIT } from "@session-manager/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"
import type { V2Client } from "@session-manager/infrastructure/host/V2Client"

function makeClient() {
  const listCalls: unknown[] = []
  const moves: unknown[] = []
  const client: V2Client = {
    session: {
      list: async (input) => {
        listCalls.push(input)
        return {
          data: [
            {
              id: "ses_root",
              projectID: "proj_a",
              title: "Root",
              subpath: "packages/app",
              time: { updated: 20 },
              location: { directory: "C:\\repo-a\\packages\\app" },
            },
            {
              id: "ses_untitled",
              projectID: "global",
              time: { updated: 10 },
              location: { directory: "C:\\scratch" },
            },
            {
              id: "ses_child",
              parentID: "ses_root",
              projectID: "proj_a",
              time: { updated: 30 },
              location: { directory: "C:\\repo-a" },
            },
          ],
        }
      },
      move: async (input) => {
        moves.push(input)
      },
    },
    project: {
      list: async () => [
        { id: "proj_a", canonical: "C:\\repo-a", sandboxes: ["C:\\repo-a-wt\\feature"] },
        { id: "proj_b", canonical: "C:\\repo-b", sandboxes: [] },
      ],
    },
  }
  return { client, listCalls, moves }
}

describe("OpenCode2HostAdapter", () => {
  it("lists newest root sessions across all projects, mapped to summaries", async () => {
    const { client, listCalls } = makeClient()
    const sessions = await new OpenCode2HostAdapter(client).listSessions()

    expect(listCalls).toEqual([{ limit: SESSION_LIMIT, order: "desc" }])
    expect(sessions).toEqual([
      {
        id: "ses_root",
        title: "Root",
        directory: "C:\\repo-a\\packages\\app",
        projectId: "proj_a",
        path: "packages/app",
        timeUpdated: 20,
      },
      { id: "ses_untitled", title: "", directory: "C:\\scratch", projectId: "global", path: "", timeUpdated: 10 },
    ])
  })

  it("surfaces every registered project root, worktree and session directory", async () => {
    const { client } = makeClient()
    const directories = await new OpenCode2HostAdapter(client).listRecentDirectories()

    expect(directories).toEqual([
      "C:\\repo-a",
      "C:\\repo-a-wt\\feature",
      "C:\\repo-b",
      "C:\\repo-a\\packages\\app",
      "C:\\scratch",
    ])
  })

  it("moves through the host session.move API", async () => {
    const { client, moves } = makeClient()
    await new OpenCode2HostAdapter(client).moveSession("ses_root", "C:\\repo-b")
    expect(moves).toEqual([{ sessionID: "ses_root", directory: "C:\\repo-b" }])
  })
})
