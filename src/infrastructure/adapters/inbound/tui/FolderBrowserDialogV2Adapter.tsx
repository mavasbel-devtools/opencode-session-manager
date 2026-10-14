import { useTerminalDimensions, type JSX } from "@opentui/solid"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import { fitMiddle, windowStart, type FolderBrowserState, type FolderRow } from "@session-manager/domain/model/FolderBrowser"
import type { BrowseFoldersPort } from "@session-manager/domain/ports/inbound/BrowseFoldersPort"
import type { HostColor, V2ThemeTokens, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/** What the browser is opened over. */
export interface FolderBrowserRequest {
  readonly title: string
  readonly home: string
  /** The known folders, absolute, in display order. */
  readonly roots: readonly string[]
}

/** The rows shown at once; the list scrolls with the highlight. */
export const VISIBLE_ROWS = 12
/** The host's `large` dialog width (packages/tui/src/ui/dialog.tsx `dialogWidth`). */
const DIALOG_WIDTH = 88
const GROUP = "Transfer session"

const SUFFIX: Record<FolderRow["kind"], string> = { folder: "", here: "  · this folder", new: "  · new folder" }

/**
 * The text a row shows in `width` columns: a marker on the highlighted row (readable without
 * colours), its folder with the middle cut when too long, then what it is.
 */
export function rowText(row: FolderRow, active: boolean, width: number): string {
  const marker = active ? "› " : "  "
  const suffix = SUFFIX[row.kind]
  return `${marker}${fitMiddle(row.label, Math.max(1, width - marker.length - suffix.length))}${suffix}`
}

const KEYS_HINT = "↑↓ select   → open folder   ← parent folder   enter move here   esc cancel"
const CONFIRM = "Enter again to create "

/** The line under the list in `width` columns: the keys, or the folder a second Enter creates. */
export function footerText(state: FolderBrowserState, width: number): string {
  const pending = state.rows.find((row) => row.directory === state.pending)
  if (pending === undefined) return KEYS_HINT
  return `${CONFIRM}${fitMiddle(pending.label, Math.max(1, width - CONFIRM.length))}`
}

interface Colors {
  readonly base: HostColor
  readonly muted: HostColor
  readonly activeText: HostColor
  readonly activeBackground: HostColor
}

function colorsOf(theme: V2ThemeTokens): Colors {
  const tokens = theme.surface?.("dialog") ?? theme
  const base = tokens.text.base ?? tokens.text.muted
  return {
    base,
    muted: tokens.text.muted,
    activeText: tokens.text.action?.primary?.focused ?? base,
    activeBackground: tokens.background?.action?.primary?.focused ?? tokens.text.muted,
  }
}

/** The OpenTUI input the path box is (the slice used here). */
interface PathBox {
  value: string
  focus(): void
}

interface ViewProps {
  readonly context: V2TuiContext
  readonly browser: BrowseFoldersPort
  readonly request: FolderBrowserRequest
  readonly onChoose: (directory: string) => void
}

function FolderBrowserView(props: ViewProps): JSX.Element {
  const { browser, context } = props
  const [state, setState] = createSignal(browser.open(props.request.home, props.request.roots))
  const dimensions = useTerminalDimensions()
  const colors = colorsOf(context.theme)
  let box: PathBox | undefined

  /** A step that may change the path box writes it back, so the box always shows the state. */
  const apply = (next: FolderBrowserState) => {
    setState(next)
    if (box !== undefined && box.value !== next.text) box.value = next.text
  }
  const choose = (next: FolderBrowserState) => {
    const choice = browser.choose(next)
    apply(choice.state)
    if (choice.directory !== null) props.onChoose(choice.directory)
  }
  const step = (bind: string, title: string, run: () => void) => ({ bind, title, group: GROUP, run })

  context.keymap.layer(() => ({
    mode: "modal",
    // Above the host's text-input layer, so the arrows browse instead of moving the cursor.
    priority: 1,
    commands: [
      step("up", "Previous folder", () => apply(browser.move(state(), -1))),
      step("down", "Next folder", () => apply(browser.move(state(), 1))),
      step("pageup", "Previous page of folders", () => apply(browser.move(state(), -VISIBLE_ROWS))),
      step("pagedown", "Next page of folders", () => apply(browser.move(state(), VISIBLE_ROWS))),
      step("right", "Open the folder", () => apply(browser.enter(state()))),
      step("left", "Parent folder", () => apply(browser.up(state()))),
      step("return", "Move the session here", () => choose(state())),
    ],
  }))

  onMount(() => {
    context.ui.dialog.set({ size: "large" })
    setTimeout(() => box?.focus(), 1)
  })

  const width = () => Math.max(10, Math.min(DIALOG_WIDTH, dimensions().width - 2) - 6)
  const start = createMemo(() => windowStart(state().highlight, state().rows.length, VISIBLE_ROWS))
  const visible = createMemo(() => state().rows.slice(start(), start() + VISIBLE_ROWS))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.base}>{props.request.title}</text>
        <text fg={colors.muted}>esc</text>
      </box>
      <input
        ref={(element: PathBox) => (box = element)}
        onInput={(value: string) => {
          if (value !== state().text) setState(browser.type(state(), value))
        }}
        placeholder="Type a path (~/…, /…) or filter the known folders"
        placeholderColor={colors.muted}
      />
      <box flexDirection="column">
        <For each={visible()}>
          {(row, index) => {
            const position = () => start() + index()
            const active = () => position() === state().highlight
            return (
              <box
                paddingLeft={1}
                backgroundColor={active() ? colors.activeBackground : "transparent"}
                onMouseUp={() => choose({ ...state(), highlight: position() })}
              >
                <text fg={active() ? colors.activeText : row.kind === "folder" ? colors.base : colors.muted} wrapMode="none">
                  {rowText(row, active(), width())}
                </text>
              </box>
            )
          }}
        </For>
        <Show when={state().rows.length === 0}>
          <text fg={colors.muted}>No known folder matches; type a path starting with ~ or /</text>
        </Show>
      </box>
      <text fg={colors.muted} wrapMode="none">
        {footerText(state(), width())}
      </text>
    </box>
  )
}

/**
 * OpenCode 2 inbound adapter: the folder browser, drawn as the plugin's own dialog
 * (`ui.dialog.show`), so its keys are its own — the host's list dialog gives a plugin no keys.
 * Resolves with the chosen folder, or undefined when the dialog is closed (Esc, a click outside).
 */
export class FolderBrowserDialogV2Adapter {
  constructor(private readonly browser: BrowseFoldersPort) {}

  pick(context: V2TuiContext, request: FolderBrowserRequest): Promise<string | undefined> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (value: string | undefined) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      context.ui.dialog.show(
        () => (
          <FolderBrowserView
            context={context}
            browser={this.browser}
            request={request}
            onChoose={(directory) => {
              settle(directory)
              context.ui.dialog.clear()
            }}
          />
        ),
        () => settle(undefined),
      )
    })
  }
}
