import { describe, expect, it } from "bun:test"
import {
  absoluteInput,
  compareLabels,
  fitMiddle,
  folderInput,
  isFileSystemRoot,
  isPathInput,
  joinFolder,
  parentInput,
  splitInput,
  trimSeparators,
  windowStart,
} from "@session-manager/domain/model/FolderBrowser"

const HOME = "/home/user"

describe("FolderBrowser rules", () => {
  it("tells a path from a filter of the known folders", () => {
    expect(["~", "~/Dev", "~\\Dev", "/", "/tmp", "\\server", "C:", "c:\\x"].map(isPathInput)).toEqual(Array(8).fill(true))
    expect(["", "Dev", "~Dev", "ITAM/x", " /tmp"].map(isPathInput)).toEqual(Array(5).fill(false))
  })

  it("splits a path into the folder typed so far and the name being typed", () => {
    expect(splitInput("~/Dev/re")).toEqual({ folder: "~/Dev/", partial: "re" })
    expect(splitInput("~/Dev/")).toEqual({ folder: "~/Dev/", partial: "" })
    expect(splitInput("C:\\Users\\Ma")).toEqual({ folder: "C:\\Users\\", partial: "Ma" })
    expect(splitInput("~")).toEqual({ folder: "~", partial: "" })
    expect(splitInput("/")).toEqual({ folder: "/", partial: "" })
  })

  it("knows filesystem roots and drops trailing separators elsewhere", () => {
    expect(["/", "//", "C:\\", "C:/", "\\"].map(isFileSystemRoot)).toEqual(Array(5).fill(true))
    expect(["/tmp", "C:\\x", "", "C:"].map(isFileSystemRoot)).toEqual(Array(4).fill(false))
    expect([trimSeparators("/tmp/"), trimSeparators("/"), trimSeparators("C:\\x\\\\")]).toEqual(["/tmp", "/", "C:\\x"])
  })

  it("joins a folder and a name, adding a separator only when needed", () => {
    expect([joinFolder("/", "tmp", "/"), joinFolder("/tmp", "x", "/"), joinFolder("C:\\", "x", "\\"), joinFolder("C:\\a", "x", "\\")]).toEqual([
      "/tmp",
      "/tmp/x",
      "C:\\x",
      "C:\\a\\x",
    ])
  })

  it("writes the text that lists a folder, and reads the folder a text names", () => {
    expect([folderInput("/home/user/Dev", HOME), folderInput(HOME, HOME), folderInput("/", HOME), folderInput("/tmp", HOME)]).toEqual(["~/Dev/", "~/", "/", "/tmp/"])
    expect(folderInput("C:\\Users\\Me\\Dev", "C:\\Users\\Me")).toBe("~\\Dev\\")
    expect([absoluteInput("~/Dev/", HOME), absoluteInput("~", HOME), absoluteInput("/", HOME)]).toEqual(["/home/user/Dev", HOME, "/"])
  })

  it("goes up a level: the name being typed first, then folder by folder, up to the root", () => {
    expect(parentInput("~/Dev/re", HOME)).toBe("~/Dev/")
    expect(parentInput("~/Dev/", HOME)).toBe("~/")
    expect(parentInput("~/", HOME)).toBe("/home/")
    expect(parentInput("~", HOME)).toBe("/home/")
    expect(parentInput("/home/", HOME)).toBe("/")
    expect(parentInput("/", HOME)).toBe("/")
    expect(parentInput("C:\\Users\\", "C:\\Users\\Me")).toBe("C:\\")
  })

  it("orders folders as shown: under the home first, segment by segment, a parent before its children, ignoring case", () => {
    const labels = ["/tmp/b", "~/Dev/repos", "~", "/tmp", "~/dev-x", "~/Dev", "~/apps", "~/Dev/AIML", "/opt", "~/Dev/item10", "~/Dev/item9"]
    expect([...labels].sort(compareLabels)).toEqual(["~", "~/apps", "~/Dev", "~/Dev/AIML", "~/Dev/item9", "~/Dev/item10", "~/Dev/repos", "~/dev-x", "/opt", "/tmp", "/tmp/b"])
    expect(["~/a", "~/A"].sort(compareLabels)).toEqual(["~/A", "~/a"])
    expect(compareLabels("~/x", "~/x")).toBe(0)
  })

  it("fits a long path by cutting its middle, keeping its end", () => {
    expect(fitMiddle("~/short", 20)).toBe("~/short")
    expect(fitMiddle("~/AppData/Local/Temp/claude/scratchpad/v2-host", 25)).toBe("~/AppDat…ratchpad/v2-host")
    expect(fitMiddle("~/AppData/Local/Temp/claude/scratchpad/v2-host", 25).length).toBe(25)
    expect([fitMiddle("abcdef", 1), fitMiddle("abcdef", 0)]).toEqual(["a", ""])
  })

  it("scrolls the window of rows with the highlight", () => {
    expect([windowStart(5, 8, 12), windowStart(0, 30, 12), windowStart(10, 30, 12), windowStart(29, 30, 12)]).toEqual([0, 0, 4, 18])
  })
})
