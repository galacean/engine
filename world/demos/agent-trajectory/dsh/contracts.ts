// Generated public contracts from pinned DSH sources. Do not hand-edit.
import type { HTMLAttributes } from 'react';
import type { TrajectoryTranslate, NS } from './locales';
import type { TranslateNS, AttachmentId, PropsRenderSlots, MessageImageLoader, ToolSchema } from '../platform-types';

export type TrajectoryCellKind =
  | 'system'
  | 'user'
  | 'context'
  | 'compacted'
  | 'message'
  | 'tool'
  | 'subtool'

export interface AssistantMetricDetail {
  timingRecorded: boolean
  stepStartTime: number | null
  firstTokenTime: number | null
  completedTime: number | null
  usageProvided: boolean
  outputTokens: number | null
}

export interface TrajectorySourceBlock {
  type: string
  content: string
  attachment?: ImageAttachmentRef
  /** Ordinary file metadata; never passed to the image loader. */
  file?: FileAttachmentRef
  callId?: string
  toolName?: string
}

export interface TrajectoryCellProps extends HTMLAttributes<HTMLDivElement> {
  /** 1-based record index shown as `#N`. */
  index: number
  /** Projection-stable identity when no single source event owns the record lifecycle. */
  recordId?: string
  kind: TrajectoryCellKind
  /** Non-Markdown summary or prefix; CSS ellipsis when it overflows. */
  text: string
  /** Raw Markdown source converted into the single-line summary at its consumer. */
  previewMarkdown?: string
  /** Whether this user record opens a new model turn. */
  opensTurn?: boolean
  /** Source session-event seq for cross-record navigation. */
  sourceSeq?: number
  /** Producer role and name from a user-role message or context injection. */
  messageSource?: unknown
  /** Producer-owned model-hidden metadata carried beside the message source. */
  /** A separator-only anchor for an auxiliary request with no visible record. */
  requestOnly?: boolean
  /** Full request/message content for the details panel. */
  inputDetail?: string
  /** Complete system-prompt/tool-catalog state introduced by a SYSTEM record. */
  promptDetail?: ConversationPromptSnapshot
  /** Known prompt text without a loaded request config or tool catalog. */
  systemPromptDetail?: string
  /** System-prompt/tool-catalog state replaced by a SYSTEM update. */
  previousPromptDetail?: ConversationPromptSnapshot
  /** Full assistant/tool result content for the details panel. */
  outputDetail?: string
  /** Full assistant reasoning content for the details panel. */
  thinkingDetail?: string
  /** Original message blocks in source order for the details panel. */
  sourceBlocks?: readonly TrajectorySourceBlock[]
  /** Original tool result blocks in source order for the details panel. */
  outputBlocks?: readonly TrajectorySourceBlock[]
  /** Call-time model-visible tool schema for the details panel. */
  schemaDetail?: string
  /** Assistant-only timing and token facts for the details panel. */
  assistantMetrics?: AssistantMetricDetail
  /** Tool-only result summary paired with the call in the same record. */
  result?: string
  /** Raw Markdown source converted into the tool-result summary at its consumer. */
  resultPreviewMarkdown?: string
  /** Tool call id used to link message source blocks to tool records. */
  callId?: string
  /** Recorded tool name; independent of the display summary. */
  toolName?: string
  /** Failed operation or interrupted assistant output. */
  isError?: boolean
  /** Own duration in seconds, or `null` when no duration is known. */
  timeSeconds: number | null
  /** Unix epoch milliseconds when this operation actually started, when known. */
  startedAt?: number | null
  /** Message-only prompt token count. */
  input?: number
  /** Message-only input tokens served from a provider cache. */
  cacheRead?: number
  /** Message-only input tokens written into a provider cache. */
  cacheWrite?: number
  /** Message-only completion token count. */
  output?: number
  /** Message-only reasoning token count. */
  think?: number
  /** Whether the legacy standalone cell renders its selection treatment. */
  selected?: boolean
}

export interface TrajectoryGroupModel {
  title: string
  description?: string
  cells: readonly TrajectoryCellProps[]
}

export interface TrajectoryTurnModel {
  turn: number | null
  groups: readonly TrajectoryGroupModel[]
}

export interface TrajectoryTableProps {
  /** Wrapping control shared by all JSON inspectors. */
  stringWrapping?: JsonTreeProps['stringWrapping']
  /** Trajectory locale seat. */
  t: TrajectoryTranslate
  /** Slot-backed durable image renderer shared with the Chat gallery. */
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  /** Session-bound loader for durable message image attachments. */
  loadImage: MessageImageLoader
  /** Session-global request numbers for the request groups visible in this context. */
  requestNumbers?: readonly TrajectoryRequestNumber[]
  /** Grouped records in display order. */
  turns: readonly TrajectoryTurnModel[]
  /** In-flight cells whose content replaces the matching structural record index. */
  streamingCells?: readonly TrajectoryCellProps[]
  /** Record indexes emphasized by the active timeline focus. */
  timelineFocusIndexes?: ReadonlySet<number> | null
  /** Record indexes retained by the active live search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null
  /** Report the record currently selected in the local inspector. */
  onSelectedIndexChange?: (index: number | null) => void
  /** Report a direct user selection from a ledger row. */
  onRecordSelect?: (index: number) => void
  /** One externally requested record selection; a new object repeats the request. */
  recordSelection?: { readonly index: number } | null
  /** One externally requested record focus without changing inspector selection. */
  recordFocus?: { readonly index: number } | null
  /** Whether the initial history tail is still loading. */
  historyLoading?: boolean
  /** Whether one older history page request is pending anywhere. */
  olderHistoryLoading?: boolean
  /** First loaded raw event, used to preserve scroll position after prepending a page. */
  historyStartSeq?: number | undefined
  /** Whether one older history page can be requested. */
  hasOlderRecords?: boolean
  /** Load one older history page. */
  onLoadOlder?: () => Promise<boolean>
  /** Clear selection state owned by the ledger host. */
  onClearSelection?: () => void
  /** Turn ids whose rows after the first are folded into a summary. */
  collapsedTurns: ReadonlySet<number>
  /** Toggle one turn between folded and expanded. */
  onToggleTurn: (turn: number) => void
  /** Stable Assistant record ids whose tool calls are folded. */
  collapsedAssistants: ReadonlySet<string>
  /** Toggle tool calls under one assistant record. */
  onToggleAssistant: (id: string) => void
  /** One-shot cross-view inspect: open and scroll to this call's record. */
  inspectCallId?: string | null
  /** Acknowledge a consumed (or unresolvable) inspect request. */
  onInspectApplied?: (() => void) | undefined
}

interface TrajectoryRequestNumberBase {
  group: string
  number: number
  status?: 'complete' | 'running' | 'error'
  startedAt?: number
  completedAt?: number | null
  error?: string
  errorCode?: string
  retry?: number
  maxRetries?: number
  retryDelayMs?: number
  resultSeq?: number
  provider?: string
  model?: string
  requestConfig?: AssistantRequestConfig
  usage?: TrajectoryUsage
  cumulativeUsage?: TrajectoryUsage
}

export type TrajectoryRequestNumber = TrajectoryRequestNumberBase & (
  | {
    purpose?: 'assistant'
    /** Request anchor event sequence; absent for the currently streaming request. */
    seq?: number
    turn: number
    step: number
  }
  | {
    purpose: 'compaction'
    /** Request anchor event sequence and stable compaction identity. */
    seq: number
    turn: number | null
    step: 0
  }
)

export interface TrajectoryUsage {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}

export interface TrajectoryToolbarProps {
  /** Whether timeline blocks use recorded durations instead of equal widths. */
  actualDuration: boolean
  /** Select recorded-duration or equal-width blocks. */
  onActualDurationChange: (actualDuration: boolean) => void
  /** Whether recorded timing retains idle gaps between operations. */
  actualTime: boolean
  /** Select complete wall-clock timing or idle-compressed timing. */
  onActualTimeChange: (actualTime: boolean) => void
  /** Whether every collapsible turn is currently folded. */
  allTurnsCollapsed: boolean
  /** Fold or expand every collapsible turn. */
  onToggleAllTurns: () => void
  /** Whether every collapsible assistant's tool calls are currently folded. */
  allAssistantsCollapsed: boolean
  /** Fold or expand tool calls under every collapsible assistant. */
  onToggleAllAssistants: () => void
  /** Current live ledger search query. */
  searchQuery: string
  /** Update the live ledger search query. */
  onSearchQueryChange: (query: string) => void
  /** Translate a toolbar dictionary key. */
  t: TranslateNS<typeof NS>
}

export interface TrajectoryTimelineProps {
  t: TrajectoryTranslate
  turns: readonly TrajectoryTurnModel[]
  mode: TrajectoryTimelineMode
  range: TrajectoryTimeRange | null
  /** Whether the loaded timeline omits an earlier history prefix. */
  hasEarlierRecords?: boolean
  /** Load one earlier history page from the truncation control. */
  onLoadEarlier?: () => Promise<boolean>
  selectedIndex?: number | null
  /** Record indexes matching the active ledger search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null
  onRangeChange: (range: TrajectoryTimeRange | null) => void
  /** Select a directly clicked timeline block. */
  onRecordSelect?: (index: number) => void
  /** Bring the nearest record into view after clicking timeline whitespace. */
  onRecordFocus?: (index: number) => void
}

export type TrajectoryTimelineMode = 'sequence' | 'duration' | 'time' | 'actual'

export interface TrajectoryTimeRange {
  start: number
  end: number
}

export interface TrajectoryTimelineSpan extends TrajectoryTimeRange {
  index: number
  isError: boolean
  kind: TrajectoryCellKind
  label: string
  lane: number
}

export interface TrajectoryTimelineTurnBoundary {
  turn: number
  time: number
}

export interface TrajectoryTimelineModel extends TrajectoryTimeRange {
  spans: readonly TrajectoryTimelineSpan[]
  turnBoundaries: readonly TrajectoryTimelineTurnBoundary[]
}

export interface CodeProgram {
  rawInput: string
  source: string
  description: string
  arguments: Record<string, unknown>
  language: 'typescript' | 'python' | undefined
}

export interface JsonTreeLabels {
  /** Menu item: copy the raw primitive value. */
  copyValue: string
  /** Menu item: copy the value as compact JSON (primitive rows). */
  copyJson: string
  /** Menu item: copy the property path. */
  copyPath: string
  /** Menu item: copy the value as pretty-printed JSON. */
  copyPrettyJson: string
  /** Menu item: copy the value as compact JSON (object rows). */
  copyCompactJson: string
  /** Copy-button state label after a successful copy. */
  copied: string
  /** Copy-button state label after a failed copy. */
  copyFailed: string
  /** Expander aria label while expanded. */
  collapseNode: string
  /** Expander aria label while collapsed. */
  expandNode: string
  /** Copy-button tooltip, given the current action label. */
  copyButtonTitle: (action: string) => string
}

export interface JsonTreeProps {
  /** Parsed JSON object or array. */
  data: object | unknown[]
  /** Accessible label for the tree. */
  label: string
  /** Optional positioning class owned by the caller. */
  className?: string | undefined
  /** Maximum visible lines per collapsed string; defaults to 3. */
  collapsedStringLines?: number
  /** Optional wrap toggle; each expansion reads the shared default without changing other open strings. */
  stringWrapping?: {
    /** Localized label for the wrapping toggle. */
    label: string
    /** Read the wrapping preference when a string is expanded. @returns Whether to wrap long lines. */
    getDefault: () => boolean
    /** Remember a user toggle for future expansions. @param wrapped - Whether to wrap long lines. */
    setDefault: (wrapped: boolean) => void
  } | undefined
  /** Whether JSON rows expose copy actions. */
  copyable?: boolean
  /** Whether the top-level object or array is always expanded. */
  expandTopLevel?: boolean
  /** Localized display copy supplied by the owning render site. */
  labels: JsonTreeLabels
}

export interface ImageLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

export interface AssistantRequestConfig {
  provider: string
  model: string
  purpose?: string
  thinking?: string
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
  stop?: readonly string[]
}

export interface ConversationPromptSnapshot {
  /** Provider/model and sampling configuration from the effective request header. */
  config: AssistantRequestConfig
  /**
   * Rendered text of the `system/message` surface node in force for the
   * request; empty when the surface has no system prompt or the node lies
   * outside the loaded history window.
   */
  system: string
  /** Complete tool catalog sent with the request, including tools that were never called. */
  tools: readonly ToolSchema[]
}

export interface MessageImageLabels {
  /** Fallback display name for an unnamed image. */
  image: string
  /** Thumbnail tooltip inviting the original-image preview. */
  open: string
  /** Accessible thumbnail label; receives the image's display name. */
  openNamed: (label: string) => string
  /** Loading placeholder shown until bytes resolve. */
  loading: string
  /** Retry-control label shown when the load fails. */
  loadFailed: string
  /** Lightbox strings forwarded to the opened preview. */
  lightbox: ImageLightboxLabels
}

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number
    height: number
  }
}

export interface FileAttachmentRef {
  /** Opaque content-addressed storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Sanitized display filename, also the stored object's leaf name. */
  name: string
  /** Exact byte length. */
  bytes: number
}
