import { describe, it, expect } from "bun:test"
import { BuildDirectoryOptionsUseCase } from "@session-manager/application/BuildDirectoryOptionsUseCase"
import { FakeDirectoryListingAdapter, FakeFileSystemAdapter, FakeSessionDbAdapter } from "@test/support/fakes/transfer-ports"

const HOME = "/home/user"

function seed(db: FakeSessionDbAdapter, id: string, directory: string) {
  db.sessions.set(id, { id, title: id, directory, projectId: "p", path: "", timeUpdated: 1 })
}

function build(directories: string[], existing: string[]) {
  const db = new FakeSessionDbAdapter()
  directories.forEach((directory, index) => seed(db, `s${index}`, directory))
  return new BuildDirectoryOptionsUseCase(db, new FakeFileSystemAdapter(), new FakeDirectoryListingAdapter(existing)).execute(HOME)
}

describe("BuildDirectoryOptionsUseCase", () => {
  it("puts the custom-path sentinel first", async () => {
    const options = await build([], [])
    expect(options).toEqual([{ title: "Enter custom path…", directory: "", category: "Directories", custom: true }])
  })

  it("lists each known folder once, by what is shown: under the home first, a parent before its children", async () => {
    const options = await build(
      ["/tmp/opencode", "/home/user/zeta", "/home/user/Dev/AIML", "/home/user/alpha", "/home/user/zeta", "/home/user/Dev", "/home/user"],
      ["/tmp/opencode", "/home/user/zeta", "/home/user/Dev/AIML", "/home/user/alpha"],
    )
    expect(options.slice(1)).toEqual([
      { title: "~", directory: "/home/user", category: "Directories" },
      { title: "~/alpha", directory: "/home/user/alpha", category: "Directories" },
      { title: "~/Dev", directory: "/home/user/Dev", category: "Directories" },
      { title: "~/Dev/AIML", directory: "/home/user/Dev/AIML", category: "Directories" },
      { title: "~/zeta", directory: "/home/user/zeta", category: "Directories" },
      { title: "/tmp/opencode", directory: "/tmp/opencode", category: "Directories" },
    ])
  })

  it("leaves out blank folders, folders that no longer exist, and the filesystem root", async () => {
    const options = await build(["   ", "/home/user/real", "/home/user/gone", "/"], ["/home/user/real"])
    expect(options.slice(1).map((option) => option.directory)).toEqual(["/home/user/real"])
  })
})
