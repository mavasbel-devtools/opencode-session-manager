import { test } from "bun:test"
import assert from "node:assert/strict"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { LsofHoldersAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter"
import { PsProcessListAdapter } from "@session-manager/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

// The unit tier runs every platform's adapters on any platform: `ps` and `lsof` are real
// executables standing in for their macOS selves, written as node scripts the way the tasklist
// stand-in is.

/** A stand-in that prints `output` to stdout and exits with `code`. */
function psStub(directory: string, name: string, output: string, code = 0): string {
  const stub = join(directory, name)
  writeFileSync(
    stub,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)})\nprocess.exit(${code})\n`,
  )
  chmodSync(stub, 0o755)
  return stub
}

/** A stand-in `lsof -F pc` that prints `output`, exits with `code`, and records its arguments. */
function lsofStub(directory: string, name: string, output: string, code = 0): { stub: string; argv: string } {
  const stub = join(directory, name)
  const argv = join(directory, `${name}.argv.json`)
  writeFileSync(
    stub,
    `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(argv)}, JSON.stringify(process.argv.slice(2)))\n` +
      `process.stdout.write(${JSON.stringify(output)})\nprocess.exit(${code})\n`,
  )
  chmodSync(stub, 0o755)
  return { stub, argv }
}

test("PsProcessListAdapter lists the one process whose comm basename matches the image", async () => {
  const directory = temporaryWorkspace("oc-db-ps-")
  try {
    const stub = psStub(
      directory,
      "ps",
      "  42 /opt/homebrew/Cellar/opencode/2.3.0/bin/opencode\n" +
        "   7 /usr/bin/opencode-helper\n" +
        "  13 /usr/bin/other\n",
    )
    assert.deepEqual(new PsProcessListAdapter(stub).list("opencode"), [{ image: "opencode", pid: 42 }])
    assert.deepEqual(new PsProcessListAdapter(stub).list("no-such-image"), [])
  } finally {
    removeTemporary(directory)
  }
})

test("PsProcessListAdapter and LsofHoldersAdapter report nothing when nothing holds", async () => {
  const directory = temporaryWorkspace("oc-db-darwin-none-")
  try {
    const ps = psStub(directory, "ps", "   7 /usr/bin/other\n")
    assert.deepEqual(new PsProcessListAdapter(ps).list("opencode"), [])

    // Exit 1 with empty output means no holder, the way `lsof` reports it.
    const empty = lsofStub(directory, "lsof-empty", "")
    const db = join(directory, "opencode.db")
    writeFileSync(db, "db")
    assert.equal(new LsofHoldersAdapter(empty.stub).heldBy(db), null)

    // Output with no holder rows is nothing held either.
    const garbage = lsofStub(directory, "lsof-garbage", "f19\nn/Users/test/opencode.db\n")
    assert.equal(new LsofHoldersAdapter(garbage.stub).heldBy(db), null)
  } finally {
    removeTemporary(directory)
  }
})

test("PsProcessListAdapter ignores malformed lines", async () => {
  const directory = temporaryWorkspace("oc-db-ps-malformed-")
  try {
    const stub = psStub(directory, "ps", "not a ps line\n   notapid opencode\n\n   7 opencode\n")
    assert.deepEqual(new PsProcessListAdapter(stub).list("opencode"), [{ image: "opencode", pid: 7 }])
  } finally {
    removeTemporary(directory)
  }
})

test("PsProcessListAdapter treats a failing ps as no processes", async () => {
  const directory = temporaryWorkspace("oc-db-ps-failing-")
  try {
    // A `ps` that fails prints nothing usable (its usage goes to stderr); there is nothing to list.
    const stub = psStub(directory, "ps", "", 3)
    assert.deepEqual(new PsProcessListAdapter(stub).list("opencode"), [])
  } finally {
    removeTemporary(directory)
  }
})

test("the darwin adapters throw when their executable is missing", async () => {
  const directory = temporaryWorkspace("oc-db-darwin-missing-")
  try {
    const db = join(directory, "opencode.db")
    writeFileSync(db, "db")
    assert.throws(() => new PsProcessListAdapter(join(directory, "no-such-ps")).list("opencode"))
    assert.throws(() => new LsofHoldersAdapter(join(directory, "no-such-lsof")).heldBy(db))
  } finally {
    removeTemporary(directory)
  }
})

test("LsofHoldersAdapter names the holders of the database and its sidecars, skipping missing ones", async () => {
  const directory = temporaryWorkspace("oc-db-lsof-sidecar-")
  try {
    const db = join(directory, "opencode.db")
    writeFileSync(db, "db")
    writeFileSync(`${db}-wal`, "wal")
    const { stub, argv } = lsofStub(
      directory,
      "lsof",
      `p11\ncopencode\nf19\np12\nchelper\ncorphan\np13\ncopencode\nf20\n`,
    )
    assert.equal(new LsofHoldersAdapter(stub).heldBy(db), "opencode 11, helper 12, opencode 13")
    // Only the files that exist are asked about: `-shm` and `-journal` are missing, and a `c`
    // row without its own preceding `p` row (the orphan) names nothing.
    const args = JSON.parse(readFileSync(argv, "utf8")) as readonly string[]
    assert.deepEqual(args.slice(0, 4), ["-nP", "-F", "pc", "--"])
    assert.deepEqual(args.slice(4), [db, `${db}-wal`])
    // A database with no file on disk has no holders.
    assert.equal(new LsofHoldersAdapter(stub).heldBy(join(directory, "absent.db")), null)
  } finally {
    removeTemporary(directory)
  }
})

test("LsofHoldersAdapter names this test process itself when it holds the file", async () => {
  const directory = temporaryWorkspace("oc-db-lsof-self-")
  try {
    const db = join(directory, "opencode.db")
    writeFileSync(db, "db")
    const { stub } = lsofStub(directory, "lsof", `p${process.pid}\ncbun-test-process\nf19\n`)
    assert.equal(new LsofHoldersAdapter(stub).heldBy(db), `bun-test-process ${process.pid}`)
  } finally {
    removeTemporary(directory)
  }
})
