import { createCliRenderer, type CliRenderer, type CliRendererConfig, type MouseEvent } from "@opentui/core"
import { render, useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, Index, onMount, Show } from "solid-js"
import {
  queueWindowStart,
  reduce,
  rowsOf,
  selectedRow,
  type BrowserAction,
  type BrowserState,
  type ListId,
  type ListPosition,
  type RebuildRequest,
} from "@session-manager/domain/model/Browser"
import {
  detailLines,
  detailTitle,
  fit,
  footerText,
  headerText,
  pairedTitle,
  paneTitle,
  queueText,
  queueTitle,
  rowSeverity,
  rowText,
} from "@session-manager/infrastructure/adapters/inbound/manager-tui/format"
import type { BrowserControls } from "@session-manager/infrastructure/adapters/inbound/manager-tui/controls"
import { commandFor } from "@session-manager/infrastructure/adapters/inbound/manager-tui/keys"

/** Rows the layout spends outside the lists: the header, the detail panel (with its border) and the footer. */
export const DETAIL_HEIGHT = 9
const HEADER_HEIGHT = 1
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
  marked: "#9ece6a",
} as const

export function listHeightFor(terminalHeight: number): number {
  return Math.max(1, terminalHeight - HEADER_HEIGHT - DETAIL_HEIGHT - FOOTER_HEIGHT - PANE_BORDER)
}

export interface BrowserViewProps {
  readonly initial: BrowserState
  readonly onQuit: () => void
  readonly controls: BrowserControls
}

/** Long enough for the renderer to paint the notice before the work blocks the event loop. */
const PAINT_BEFORE_WORK_MS = 50

export function BrowserView(props: BrowserViewProps) {
  const [state, setState] = createSignal(props.initial)
  const dispatch = (action: BrowserAction) => setState((current) => reduce(current, action))
  const dimensions = useTerminalDimensions()

  createEffect(() => dispatch({ type: "resize", listHeight: listHeightFor(dimensions().height) }))
  onMount(() => {
    void props.controls.release().then((release) => dispatch({ type: "release", release }))
  })

  let busy = false
  const apply = async (dryRun: boolean) => {
    if (busy) return
    busy = true
    dispatch({ type: "notice", text: dryRun ? "Checking the queue on copies…" : "Applying the queue…" })
    await new Promise((resolve) => setTimeout(resolve, PAINT_BEFORE_WORK_MS))
    const outcome = props.controls.apply(state().queue, dryRun, state().scope)
    const { left, right } = outcome
    dispatch({
      type: "applied",
      result: outcome.result,
      changed: outcome.changed,
      planned: outcome.planned,
      ...(left === undefined ? {} : { left }),
      ...(right === undefined ? {} : { right }),
    })
    busy = false
  }

  const rebuild = async (request: RebuildRequest) => {
    if (busy) return
    busy = true
    dispatch({ type: "notice", text: `${request.command === "fork" ? "fork" : `/ctx-${request.command}`} on ${request.ids.length} sessions: starting…` })
    const outcome = await props.controls.rebuild(request, (text) => dispatch({ type: "notice", text }))
    const { left, right } = outcome
    dispatch({ type: "applied", result: outcome.result, changed: false, ...(left === undefined ? {} : { left }), ...(right === undefined ? {} : { right }) })
    busy = false
  }

  useKeyboard((key) => {
    const command = commandFor(key, state())
    if (command === null) return
    if (command.type === "quit") props.onQuit()
    else if (command.type === "apply") void apply(command.dryRun)
    else if (command.type === "rebuild") void rebuild(command.request)
    else dispatch(command)
  })

  const panes = () => (state().right === null || state().layout === "paired" || state().view === "queue" ? 1 : 2)
  const listWidth = () => Math.floor(dimensions().width / panes()) - PANE_BORDER

  return (
    <box flexDirection="column" width="100%" height="100%">
      <text fg={state().release?.newer === true ? COLORS.folder : COLORS.muted}>{fit(headerText(state()), dimensions().width)}</text>
      <box flexDirection="row" flexGrow={1}>
        <Show when={state().view === "list"} fallback={<Queue state={state()} width={listWidth()} />}>
          <Show
            when={state().layout === "panes"}
            fallback={<List list="paired" title={pairedTitle(state())} state={state()} width={listWidth()} dispatch={dispatch} />}
          >
            <List list="left" title={paneTitle(state().left)} state={state()} width={listWidth()} dispatch={dispatch} />
            <Show when={state().right !== null}>
              <List list="right" title={paneTitle(state().right!)} state={state()} width={listWidth()} dispatch={dispatch} />
            </Show>
          </Show>
        </Show>
      </box>
      <box border borderColor={COLORS.muted} title={detailTitle(state())} height={DETAIL_HEIGHT} flexDirection="column" paddingLeft={1}>
        <Index each={detailLines(state(), selectedRow(state()))}>
          {(line) => <text fg={COLORS.text}>{fit(line(), dimensions().width - 4)}</text>}
        </Index>
      </box>
      <text fg={state().notice === null ? COLORS.muted : COLORS.accent}>{fit(footerText(state()), dimensions().width)}</text>
    </box>
  )
}

interface ListProps {
  readonly list: ListId
  readonly title: string
  readonly state: BrowserState
  readonly width: number
  readonly dispatch: (action: BrowserAction) => void
}

function List(props: ListProps) {
  const position = (): ListPosition => (props.list === "paired" ? props.state.paired : props.list === "left" ? props.state.left : props.state.right!)
  const focused = () => props.list === "paired" || props.state.focus === props.list
  const rows = createMemo(() => rowsOf(props.state, props.list))
  const visible = () => rows().slice(position().offset, position().offset + props.state.listHeight)
  const onScroll = (event: MouseEvent) =>
    props.dispatch({ type: "scroll", list: props.list, delta: event.scroll?.direction === "up" ? -SCROLL_STEP : SCROLL_STEP })

  return (
    <box
      border
      borderColor={focused() ? COLORS.accent : COLORS.muted}
      title={fit(props.title, props.width - 2).trimEnd()}
      flexGrow={1}
      flexBasis={0}
      flexDirection="column"
      onMouseScroll={onScroll}
    >
      <Index each={visible()}>
        {(row, index) => {
          const selected = () => position().offset + index === position().cursor
          return (
            <box
              height={1}
              backgroundColor={selected() ? (focused() ? COLORS.cursor : COLORS.cursorBlurred) : "transparent"}
              onMouseDown={() => props.dispatch({ type: "select", list: props.list, index })}
            >
              <text fg={row().kind === "group" ? COLORS.folder : row().marked === true ? COLORS.marked : COLORS.text}>{rowText(row(), props.width, rowSeverity(props.state, props.list, row()))}</text>
            </box>
          )
        }}
      </Index>
    </box>
  )
}

function Queue(props: { readonly state: BrowserState; readonly width: number }) {
  const start = () => queueWindowStart(props.state)
  const visible = () => props.state.queue.slice(start(), start() + props.state.listHeight)
  return (
    <box border borderColor={COLORS.accent} title={fit(queueTitle(props.state), props.width - 2).trimEnd()} flexGrow={1} flexDirection="column">
      <Index each={visible()}>
        {(entry, index) => (
          <box height={1} backgroundColor={start() + index === props.state.queueCursor ? COLORS.cursor : "transparent"}>
            <text fg={entry().planned?.action === "skip" ? COLORS.folder : COLORS.text}>{queueText(entry(), props.width)}</text>
          </box>
        )}
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
  return async (initial: BrowserState, controls: BrowserControls): Promise<void> => {
    const renderer = await createRenderer()
    let quit!: () => void
    const done = new Promise<void>((resolve) => {
      quit = resolve
    })
    try {
      await render(() => <BrowserView initial={initial} onQuit={() => quit()} controls={controls} />, renderer)
      await done
    } finally {
      renderer.destroy()
    }
  }
}
