import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { NodeDirectoryListingAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeDirectoryListingAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let root = ""
beforeEach(() => {
  root = temporaryWorkspace("oc-listing-")
})
afterEach(() => {
  removeTemporary(root)
})

describe("NodeDirectoryListingAdapter", () => {
  it("lists folders and links to folders, never files or broken links", () => {
    for (const name of ["b", "a", ".hidden"]) fs.mkdirSync(path.join(root, name))
    fs.writeFileSync(path.join(root, "file.txt"), "x")
    fs.symlinkSync(path.join(root, "a"), path.join(root, "link-to-a"))
    fs.symlinkSync(path.join(root, "file.txt"), path.join(root, "link-to-file"))
    fs.symlinkSync(path.join(root, "missing"), path.join(root, "broken"))
    const listing = new NodeDirectoryListingAdapter()
    expect(listing.subdirectories(root).sort()).toEqual([".hidden", "a", "b", "link-to-a"])
    expect([listing.isDirectory(root), listing.isDirectory(path.join(root, "link-to-a")), listing.isDirectory(path.join(root, "file.txt")), listing.isDirectory(path.join(root, "missing"))]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it("lists nothing in a folder it cannot read", () => {
    const listing = new NodeDirectoryListingAdapter()
    expect(listing.subdirectories(path.join(root, "missing"))).toEqual([])
    fs.writeFileSync(path.join(root, "file.txt"), "x")
    expect(listing.subdirectories(path.join(root, "file.txt"))).toEqual([])
  })
})
