import { describe, it, expect } from "bun:test"
import os from "node:os"
import path from "node:path"
import { BuildDirectoryOptionsUseCase } from "@transfer/application/BuildDirectoryOptionsUseCase"
import { FakeSessionDbAdapter, FakeFileSystemAdapter } from "@test/fakes/ports"

function seed(db: FakeSessionDbAdapter, id: string, directory: string) {
  db.sessions.set(id, {
    id,
    title: id,
    directory,
    projectId: "p",
    path: "",
    timeUpdated: 1,
  })
}

describe("BuildDirectoryOptionsUseCase", () => {
  const home = os.homedir()

  it("puts the custom-path sentinel first", async () => {
    const db = new FakeSessionDbAdapter()
    const fs = new FakeFileSystemAdapter()
    const options = await new BuildDirectoryOptionsUseCase(db, fs).execute(home)

    expect(options[0]?.custom).toBe(true)
    expect(options[0]?.category).toBe("Directories")
  })

  it("lists known session directories sorted alphabetically and deduplicated", async () => {
    const db = new FakeSessionDbAdapter()
    const fs = new FakeFileSystemAdapter()
    seed(db, "s1", path.join(home, "zeta"))
    seed(db, "s2", path.join(home, "alpha"))
    seed(db, "s3", path.join(home, "zeta"))

    const options = await new BuildDirectoryOptionsUseCase(db, fs).execute(home)
    const dirs = options.filter((o) => !o.custom)

    expect(dirs.length).toBe(2)
    expect(dirs[0]?.directory).toBe(path.join(home, "alpha"))
    expect(dirs[1]?.directory).toBe(path.join(home, "zeta"))
    expect(dirs.every((o) => o.category === "Directories")).toBe(true)
  })

  it("skips blank directories", async () => {
    const db = new FakeSessionDbAdapter()
    const fs = new FakeFileSystemAdapter()
    seed(db, "s1", "   ")
    seed(db, "s2", path.join(home, "real"))

    const options = await new BuildDirectoryOptionsUseCase(db, fs).execute(home)
    expect(options.filter((o) => !o.custom).length).toBe(1)
  })
})
