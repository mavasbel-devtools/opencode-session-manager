import { createCliRenderer, type CliRenderer, type CliRendererConfig, type MouseEvent } from "@opentui/core"
import { render, useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, Index, Show } from "solid-js"
import {
  reduce,
  rowsOf,
  selectedRow,
  type BrowserAction,
  type BrowserState,
  type Side,
} from "@session-manager/domain/model/Browser"
import { detailLines, fit, footerText, paneTitle, rowText } from "@session-manager/infrastructure/adapters/inbound/manager-tui/format"
import { commandFor } from "@session-manager/infrastructure/adapters/inbound/manager-tui/keys"

/** Rows the layout spends outside the lists: the detail panel (with its border) and the footer. */
export const DETAIL_HEIGHT = 7
const FOOTER_HEIGHT = 1
const PANE_BORDER = 2
const SCROLL_STEP = 3

const COLORS = {
  accent: "#7aa2f7",
  muted: "#565f89",
  text: "#c0caf5",
  folder: "#e0af68",
  cursor: "#283457",
  cursorBlurred: "#1f2335",
} as const

export function listHeightFor(terminalHeight: number): number {
  return Math.max(1, terminalHeight - DETAIL_HEIGHT - FOOTER_HEIGHT - PANE_BORDER)
}

export interface BrowserViewProps {
  readonly initial: BrowserState
  readonly onQuit: () => void
}

export function BrowserView(props: BrowserViewProps) {
  const [state, setState] = createSignal(props.initial)
  const dispatch = (action: BrowserAction) => setState((current) => reduce(current, action))
  const dimensions = useTerminalDimensions()

  createEffect(() => dispatch({ type: "resize", listHeight: listHeightFor(dimensions().height) }))

  useKeyboard((key) => {
    const command = commandFor(key, state())
    if (command === null) return
    if (command.type === "quit") props.onQuit()
    else dispatch(command)
  })

  const paneWidth = () => Math.floor(dimensions().width / (state().right === null ? 1 : 2)) - PANE_BORDER

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1}>
        <Pane side="left" state={state()} width={paneWidth()} dispatch={dispatch} />
        <Show when={state().right !== null}>
          <Pane side="right" state={state()} width={paneWidth()} dispatch={dispatch} />
        </Show>
      </box>
      <box border borderColor={COLORS.muted} title=" Details " height={DETAIL_HEIGHT} flexDirection="column" paddingLeft={1}>
        <Index each={detailLines(selectedRow(state(), state().focus))}>
          {(line) => <text fg={COLORS.text}>{fit(line(), dimensions().width - 4)}</text>}
        </Index>
      </box>
      <text fg={COLORS.muted}>{fit(footerText(state()), dimensions().width)}</text>
    </box>
  )
}

interface PaneProps {
  readonly side: Side
  readonly state: BrowserState
  readonly width: number
  readonly dispatch: (action: BrowserAction) => void
}

function Pane(props: PaneProps) {
  const pane = () => (props.side === "left" ? props.state.left : props.state.right!)
  const focused = () => props.state.focus === props.side
  const rows = createMemo(() => rowsOf(props.state, props.side))
  const visible = () => rows().slice(pane().offset, pane().offset + props.state.listHeight)
  const onScroll = (event: MouseEvent) =>
    props.dispatch({ type: "scroll", side: props.side, delta: event.scroll?.direction === "up" ? -SCROLL_STEP : SCROLL_STEP })

  return (
    <box
      border
      borderColor={focused() ? COLORS.accent : COLORS.muted}
      title={fit(paneTitle(pane()), props.width - 2).trimEnd()}
      flexGrow={1}
      flexBasis={0}
      flexDirection="column"
      onMouseScroll={onScroll}
    >
      <Index each={visible()}>
        {(row, index) => {
          const selected = () => pane().offset + index === pane().cursor
          return (
            <box
              height={1}
              backgroundColor={selected() ? (focused() ? COLORS.cursor : COLORS.cursorBlurred) : "transparent"}
              onMouseDown={() => props.dispatch({ type: "select", side: props.side, index })}
            >
              <text fg={row().kind === "group" ? COLORS.folder : COLORS.text}>{rowText(row(), props.width)}</text>
            </box>
          )
        }}
      </Index>
    </box>
  )
}

/** A renderer for the real terminal: full screen, mouse on, Ctrl+C handled by the browser. */
export function terminalRenderer(config: CliRendererConfig = {}): Promise<CliRenderer> {
  return createCliRenderer({ exitOnCtrlC: false, useMouse: true, ...config })
}

/** Shows the browser on a renderer and resolves when the user quits; the renderer is destroyed then. */
export function showBrowser(createRenderer: () => Promise<CliRenderer>) {
  return async (initial: BrowserState): Promise<void> => {
    const renderer = await createRenderer()
    let quit!: () => void
    const done = new Promise<void>((resolve) => {
      quit = resolve
    })
    try {
      await render(() => <BrowserView initial={initial} onQuit={() => quit()} />, renderer)
      await done
    } finally {
      renderer.destroy()
    }
  }
}
