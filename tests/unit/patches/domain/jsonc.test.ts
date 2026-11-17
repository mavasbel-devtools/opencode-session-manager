import { describe, expect, it } from "bun:test"
import {
  isMagicContextEntry,
  magicContextEntry,
  numericSetting,
  pinnedMagicContext,
  replaceMagicContextEntry,
  stringLiterals,
  stripComments,
} from "@session-manager/domain/services/Jsonc"

describe("stripComments", () => {
  it("removes line and block comments but keeps strings intact", () => {
    const text = '{ "url": "http://x//y", // tail\n /* block */ "q": "a\\"//b" }'
    expect(stripComments(text)).toBe('{ "url": "http://x//y", \n  "q": "a\\"//b" }')
  })

  it("drops an unterminated block comment to the end", () => {
    expect(stripComments('{"a": 1} /* open')).toBe('{"a": 1} ')
  })
})

describe("pinnedMagicContext", () => {
  it("reads a pinned version", () => {
    expect(pinnedMagicContext('{ "plugins": ["@cortexkit/opencode-magic-context@0.47.0", {"package": "x"}], }')).toBe("0.47.0")
  })

  it("reads a bare package name as latest, ignoring commented-out entries", () => {
    const text = '{\n  // "@cortexkit/opencode-magic-context@0.45.0",\n  "plugins": ["@cortexkit/opencode-magic-context"]\n}'
    expect(pinnedMagicContext(text)).toBe("latest")
  })

  it("is null when Magic Context is not configured", () => {
    expect(pinnedMagicContext('{ "plugins": ["other"] }')).toBeNull()
  })
})

describe("numericSetting", () => {
  it("reads integers, decimals and negatives, not commented values", () => {
    expect(numericSetting('{ /* "x": 1, */ "x": 13, }', "x")).toBe(13)
    expect(numericSetting('{ "x": -2.5 }', "x")).toBe(-2.5)
    expect(numericSetting('{ // "x": 13\n }', "x")).toBeNull()
    expect(numericSetting('{ "x": { "default": 40 } }', "x")).toBeNull()
  })
})

describe("the Magic Context entry", () => {
  const FOLDER = "/home/u/.local/share/opencode-magic-context-patches/installs/1.0.0/node_modules/@cortexkit/opencode-magic-context"
  const config = (entry: string) => `{\n  // "@cortexkit/opencode-magic-context@0.1.0"\n  /* "${FOLDER}" */\n  "url": "a \\"q\\" // x",\n  "plugins": [\n    "${entry}", // pinned\n    { "package": "./plugins/other" },\n  ],\n}\n`

  it("finds string literals outside comments, with their positions, and stops at an unterminated one", () => {
    const text = '{ "a": "b\\"c" /* "x" */ } "open'
    expect(stringLiterals(text)).toEqual([
      { value: "a", start: 2, end: 5 },
      { value: 'b"c', start: 7, end: 13 },
    ])
    expect(stringLiterals('// "x"\n/* unterminated "y"')).toEqual([])
  })

  it("recognises the npm package, a pinned version and a folder holding it", () => {
    expect(["@cortexkit/opencode-magic-context", "@cortexkit/opencode-magic-context@1.0.0", FOLDER].map(isMagicContextEntry)).toEqual([true, true, true])
    expect(["@cortexkit/opencode-magic-contextual", "./node_modules/@cortexkit/opencode-magic-context", "/x/other"].map(isMagicContextEntry)).toEqual([false, false, false])
  })

  it("reads a folder entry as its absolute path", () => {
    expect(pinnedMagicContext(config(FOLDER))).toBe(FOLDER)
    expect(magicContextEntry(config(FOLDER))).toBe(FOLDER)
    expect(magicContextEntry("{}")).toBeNull()
  })

  it("replaces only the entry, keeping every other byte", () => {
    const before = config("@cortexkit/opencode-magic-context@0.49.19")
    expect(replaceMagicContextEntry(before, FOLDER)).toBe(config(FOLDER))
    expect(replaceMagicContextEntry(config(FOLDER), "@cortexkit/opencode-magic-context@0.49.19")).toBe(before)
  })

  it("refuses unless there is exactly one entry", () => {
    expect(replaceMagicContextEntry("{}", FOLDER)).toBeNull()
    expect(replaceMagicContextEntry('["@cortexkit/opencode-magic-context", "@cortexkit/opencode-magic-context@1"]', FOLDER)).toBeNull()
  })
})
