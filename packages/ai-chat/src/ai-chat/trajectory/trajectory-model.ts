import type { AgentTraceRecord, AgentTraceSnapshot } from "../agent-trace";
import { normalizeModelTelemetry } from "../context-metrics";
import { parseContextCompaction } from "../context-compaction";

const DEFAULT_PREVIEW_CHARACTERS = 512;
const DEFAULT_TITLE_CHARACTERS = 80;

export type TrajectoryCellKind = "user" | "assistant" | "tool" | "subtool" | "system" | "context" | "compacted";
export type TrajectoryCellStatus = "completed" | "running" | "failed";
export type TrajectoryTimelineLane = 0 | 1 | 2;

export type TrajectoryTokenUsage = Readonly<{
  input?: number;
  cacheRead?: number;
  cacheWrite?: number;
  output?: number;
  thinking?: number;
}>;

/** One model-visible content block kept in its original request order. */
export type TrajectorySourceBlock = Readonly<{
  type: string;
  content: string;
  role?: string;
  callId?: string;
  toolName?: string;
  attachment?: Readonly<{
    attachmentId?: string;
    omitted?: string;
    name?: string;
    mediaType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    dataUrl?: string;
  }>;
  file?: Readonly<{
    name?: string;
    mediaType?: string;
    bytes?: number;
  }>;
}>;

/** A model-visible tool definition. Old traces may only know the tool name. */
export type TrajectoryToolDefinition = Readonly<{
  name: string;
  description?: string;
  parameters?: unknown;
  strict?: boolean;
}>;

/** The prompt/tool state at the moment a model request was built. */
export type TrajectoryPromptSnapshot = Readonly<{
  system: string;
  tools: readonly TrajectoryToolDefinition[];
  config?: unknown;
}>;

/** Facts needed by the DSH-style timing inspector. */
export type TrajectoryAssistantMetrics = Readonly<{
  timingRecorded: boolean;
  stepStartTime: number | null;
  firstTokenTime: number | null;
  completedTime: number | null;
  usageProvided: boolean;
  outputTokens: number | null;
}>;

export type TrajectoryCell = Readonly<{
  /** 1-based record index shared by the ledger, search, and timeline. */
  index: number;
  id: string;
  turn: number;
  step: number | null;
  group: string;
  kind: TrajectoryCellKind;
  status: TrajectoryCellStatus;
  text: string;
  preview?: string;
  result?: string;
  inputDetail?: string;
  outputDetail?: string;
  thinkingDetail?: string;
  rawDetail?: unknown;
  schemaDetail?: string;
  startedAtMilliseconds: number | null;
  durationMilliseconds: number | null;
  isError: boolean;
  toolName?: string;
  callId?: string;
  model?: string;
  provider?: string;
  traceId?: string;
  usage?: TrajectoryTokenUsage;
  /** A separator-only request anchor with no visible assistant record. */
  requestOnly?: boolean;
  /** Full system-prompt/tool-catalog state introduced by a SYSTEM record. */
  promptDetail?: TrajectoryPromptSnapshot;
  /** Known prompt text when a full prompt snapshot was not recorded. */
  systemPromptDetail?: string;
  /** Prompt state replaced by a SYSTEM update record. */
  previousPromptDetail?: TrajectoryPromptSnapshot;
  /** Tool names/schemas visible to the model at this point. */
  promptTools?: readonly TrajectoryToolDefinition[];
  /** Original message blocks in request order. */
  sourceBlocks?: readonly TrajectorySourceBlock[];
  /** Original tool result blocks in source order. */
  outputBlocks?: readonly TrajectorySourceBlock[];
  /** Producer metadata attached to a user/context message. */
  messageSource?: unknown;
  /** Assistant timing/token facts, including unavailable TTFT facts. */
  assistantMetrics?: TrajectoryAssistantMetrics;
  searchText: string;
}>;

/** One model request (one Agent step) with its retry and usage facts. */
export type TrajectoryRequest = Readonly<{
  /** 1-based request number across the imported trace document. */
  number: number;
  turn: number;
  step: number;
  group: string;
  status: TrajectoryCellStatus;
  startedAtMilliseconds: number | null;
  finishedAtMilliseconds: number | null;
  durationMilliseconds: number | null;
  attemptCount: number;
  retry: number;
  provider?: string;
  model?: string;
  traceId?: string;
  error?: string;
  errorCode?: string;
  inputDetail?: string;
  rawDetail?: unknown;
  usage?: TrajectoryTokenUsage;
  purpose?: "assistant" | "compaction";
  requestOnly?: boolean;
  tools?: readonly TrajectoryToolDefinition[];
  sourceBlocks?: readonly TrajectorySourceBlock[];
  requestOptions?: unknown;
  firstTokenAtMilliseconds?: number | null;
  /** Sum of this request and every earlier request in the document. */
  cumulativeUsage?: TrajectoryTokenUsage;
}>;

/** Facts the current Trace schema does not record but the DSH inspector exposes. */
export type TrajectoryTimingAvailability = Readonly<{
  firstToken: boolean;
  tokenUsage: boolean;
}>;

export type TrajectoryGroup = Readonly<{
  title: string;
  description?: string;
  cells: readonly TrajectoryCell[];
}>;

export type TrajectoryTurn = Readonly<{
  turn: number;
  title: string;
  status: TrajectoryCellStatus;
  startedAtMilliseconds: number | null;
  finishedAtMilliseconds: number | null;
  durationMilliseconds: number | null;
  groups: readonly TrajectoryGroup[];
  cells: readonly TrajectoryCell[];
}>;

export type TrajectoryTimelineSpan = Readonly<{
  cellIndex: number;
  kind: TrajectoryCellKind;
  lane: TrajectoryTimelineLane;
  label: string;
  start: number;
  end: number;
  isError: boolean;
}>;

export type TrajectoryTimelineTurnBoundary = Readonly<{
  turn: number;
  time: number;
}>;

export type TrajectoryTimeline = Readonly<{
  start: number;
  end: number;
  spans: readonly TrajectoryTimelineSpan[];
  turnBoundaries: readonly TrajectoryTimelineTurnBoundary[];
}>;

export type TrajectoryDocument = Readonly<{
  title: string;
  sourceName?: string;
  status: TrajectoryCellStatus;
  startedAtMilliseconds: number | null;
  finishedAtMilliseconds: number | null;
  durationMilliseconds: number | null;
  turns: readonly TrajectoryTurn[];
  cells: readonly TrajectoryCell[];
  requests: readonly TrajectoryRequest[];
  timeline: TrajectoryTimeline | null;
  warnings: readonly string[];
  records: readonly AgentTraceSnapshot[];
  timingAvailability: TrajectoryTimingAvailability;
}>;

export type TrajectoryProjectionOptions = Readonly<{
  sourceName?: string;
  title?: string;
}>;

export type TrajectoryTimelineMode = "sequence" | "duration" | "time" | "actual";

export type TrajectoryTimeRange = Readonly<{
  start: number;
  end: number;
}>;

type RecordObject = Record<string, unknown>;

type CellDraft = Omit<TrajectoryCell, "index">;

type GroupDraft = {
  readonly title: string;
  readonly cells: MutableCell[];
};

type ModelStart = {
  readonly at: number | null;
  readonly availableApiNames?: readonly string[];
  readonly tools?: readonly TrajectoryToolDefinition[];
};

type ProjectionContext = {
  currentSystemPrompt?: string;
  currentTools?: readonly TrajectoryToolDefinition[];
  systemPromptSeen: boolean;
};

type PendingTool = {
  readonly cell: MutableCell;
  readonly step: number;
  readonly toolName?: string;
};

type StepSnapshot = {
  readonly step: number;
  readonly scriptResult?: unknown;
};

type RequestDraft = Omit<TrajectoryRequest, "number" | "cumulativeUsage">;
type RequestDraftWithOptions = RequestDraft & { readonly requestOptions?: unknown };

type MutableRequest = {
  -readonly [Key in keyof RequestDraftWithOptions]: RequestDraftWithOptions[Key];
};

type MutableCell = {
  -readonly [Key in keyof Omit<TrajectoryCell, "index">]: Omit<TrajectoryCell, "index">[Key];
} & {
  readonly _order: number;
};

export class TrajectoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrajectoryParseError";
  }
}

/**
 * Parse one exported Agent Trace JSON document.
 *
 * Accepted inputs are a single completed/running trace, an array of traces, or
 * an object with a `records`/`traces` array. The projection is intentionally
 * tolerant of missing optional diagnostics so old exports remain inspectable.
 */
export function parseTrajectoryJson(source: string, options: TrajectoryProjectionOptions = {}): TrajectoryDocument {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new TrajectoryParseError(`Trace JSON 解析失败：${getErrorMessage(error)}`);
  }
  return projectTrajectory(value, options);
}

/** Project already parsed JSON into the standalone trajectory view model. */
export function projectTrajectory(value: unknown, options: TrajectoryProjectionOptions = {}): TrajectoryDocument {
  const extracted = extractTraceRecords(value);
  if (extracted.records.length === 0) {
    throw new TrajectoryParseError("没有找到可展示的 Agent Trace 记录");
  }

  const ordered = extracted.records
    .map((record, order) => ({ record, order, startedAt: readTimestamp(record.startedAt) }))
    .sort((left, right) => {
      if (left.startedAt === null || right.startedAt === null) return left.order - right.order;
      return left.startedAt - right.startedAt || left.order - right.order;
    })
    .map(({ record }) => record);
  const warnings: string[] = [];
  const turns: TrajectoryTurn[] = [];
  const requestDrafts: RequestDraftWithOptions[] = [];
  const projection: ProjectionContext = { systemPromptSeen: false };
  let nextIndex = 1;
  let nextTurnNumber = 1;

  for (const [offset, record] of ordered.entries()) {
    const projected = projectRecord(record, nextTurnNumber, nextIndex, warnings, projection);
    turns.push(projected.turn);
    requestDrafts.push(...projected.requests);
    nextIndex += projected.turn.cells.length;
    nextTurnNumber = Math.max(nextTurnNumber, projected.turn.turn) + 1;
  }

  const cells = turns.flatMap((turn) => turn.cells);
  const requests = numberRequests(requestDrafts);
  const startedAtMilliseconds = minimumNumber(turns.map((turn) => turn.startedAtMilliseconds));
  const finishedAtMilliseconds = maximumNumber(turns.map((turn) => turn.finishedAtMilliseconds));
  const durationMilliseconds =
    startedAtMilliseconds === null || finishedAtMilliseconds === null
      ? maximumNumber(turns.map((turn) => turn.durationMilliseconds))
      : Math.max(0, finishedAtMilliseconds - startedAtMilliseconds);
  const status = aggregateStatus(turns);
  const firstInput = ordered[0]?.input?.text?.trim();
  const fallbackTitle = firstInput ? compactText(firstInput, DEFAULT_TITLE_CHARACTERS) : "Agent Trajectory";
  const title =
    options.title?.trim() ||
    extracted.title?.trim() ||
    (ordered.length === 1 ? fallbackTitle : `${ordered.length} 条 Agent Trace`);

  return {
    title,
    sourceName: options.sourceName,
    status,
    startedAtMilliseconds,
    finishedAtMilliseconds,
    durationMilliseconds,
    turns,
    cells,
    requests,
    timeline: deriveTrajectoryTimeline(cells, turns, "sequence"),
    warnings,
    records: ordered,
    timingAvailability: {
      firstToken: cells.some((cell) => cell.assistantMetrics?.firstTokenTime != null),
      tokenUsage: cells.some((cell) => cell.usage !== undefined)
    }
  };
}

/**
 * Derive the overview timeline in operation order, idle-compressed duration, or
 * wall-clock duration. `time` keeps recorded starts but projects equal-width
 * markers; `actual` keeps both recorded starts and durations.
 */
export function deriveTrajectoryTimeline(
  cells: readonly TrajectoryCell[],
  turns: readonly TrajectoryTurn[],
  mode: TrajectoryTimelineMode
): TrajectoryTimeline | null {
  const visibleCells = cells.filter((cell) => cell.requestOnly !== true);
  if (visibleCells.length === 0) return null;
  if (mode === "sequence") {
    const spans = visibleCells.map(
      (cell, offset): TrajectoryTimelineSpan => ({
        cellIndex: cell.index,
        kind: cell.kind,
        lane: timelineLane(cell.kind),
        label: cell.text,
        start: offset,
        end: offset + 1,
        isError: cell.isError
      })
    );
    return {
      start: 0,
      end: visibleCells.length,
      spans,
      turnBoundaries: deriveTurnBoundaries(
        turns,
        (cell) => spans.find((span) => span.cellIndex === cell.index)?.start ?? 0
      )
    };
  }

  // Adapted from DSH ui-trajectory/timeline.ts; see THIRD_PARTY_NOTICES.md.
  const timed = visibleCells.flatMap((cell) => {
    const start = cell.startedAtMilliseconds;
    if (start === null) return [];
    return [
      {
        cell,
        start,
        end: start + Math.max(0, cell.durationMilliseconds ?? 0)
      }
    ];
  });
  if (timed.length === 0) return null;

  const orderedRanges = [...timed].sort((left, right) => left.start - right.start || left.end - right.end);
  const removedByRange = new Map<(typeof timed)[number], number>();
  let removed = 0;
  let coveredUntil: number | null = null;
  for (const range of orderedRanges) {
    if (mode === "duration" && coveredUntil !== null && range.start > coveredUntil)
      removed += range.start - coveredUntil;
    removedByRange.set(range, removed);
    coveredUntil = coveredUntil === null ? range.end : Math.max(coveredUntil, range.end);
  }

  const spans = timed.map((range): TrajectoryTimelineSpan => {
    const { cell, start, end } = range;
    const offsetRemoved = removedByRange.get(range) ?? 0;
    return {
      cellIndex: cell.index,
      kind: cell.kind,
      lane: timelineLane(cell.kind),
      label: cell.text,
      start: start - offsetRemoved,
      end: (mode === "time" ? start : end) - offsetRemoved,
      isError: cell.isError
    };
  });
  const start = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.end), start + 0.1);
  const spanByIndex = new Map(spans.map((span) => [span.cellIndex, span]));
  return {
    start,
    end,
    spans,
    turnBoundaries: deriveTurnBoundaries(turns, (cell) => spanByIndex.get(cell.index)?.start ?? start)
  };
}

/** Return cells intersecting an inclusive timeline selection. */
export function trajectoryTimelineFocusIndexes(
  cells: readonly TrajectoryCell[],
  turns: readonly TrajectoryTurn[],
  range: TrajectoryTimeRange,
  mode: TrajectoryTimelineMode
): ReadonlySet<number> {
  const timeline = deriveTrajectoryTimeline(cells, turns, mode);
  return new Set(
    timeline?.spans
      .filter((span) => span.start <= range.end && span.end >= range.start)
      .map((span) => span.cellIndex) ?? []
  );
}

export function trajectoryCellMatches(cell: TrajectoryCell, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = cell.searchText.toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

export function formatTrajectoryDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  const rounded = Math.round(milliseconds);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ms`;
}

/** Format a duration for the compact ledger columns. */
export function formatTrajectoryCellDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  return milliseconds < 1_000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
}

/** Format a token count for the compact ledger columns. */
export function formatTrajectoryTokens(value: number | undefined): string {
  return value === undefined ? "—" : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatTrajectoryTimestamp(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function projectRecord(
  record: AgentTraceSnapshot,
  turnNumber: number,
  firstIndex: number,
  warnings: string[],
  projection: ProjectionContext
): Readonly<{ turn: TrajectoryTurn; requests: readonly RequestDraftWithOptions[] }> {
  const base = readTimestamp(record.startedAt);
  const finished = record.status === "running" ? readTimestamp(record.observedAt) : readTimestamp(record.finishedAt);
  const declaredDuration = finiteNumber(record.durationMilliseconds);
  const duration = declaredDuration ?? (base === null || finished === null ? null : Math.max(0, finished - base));
  const groups: GroupDraft[] = [];
  const cells: MutableCell[] = [];
  const toolCallNames = new Map<string, string>();
  const toolCallIdsByStep = new Map<number, Map<string, string>>();
  let order = 0;
  let group = getGroup(groups, "Message");

  const push = (target: GroupDraft, cell: CellDraft): MutableCell => {
    const draft: MutableCell = { ...cell, id: `${cell.id}:${turnNumber}:${order}`, _order: order++ };
    target.cells.push(draft);
    cells.push(draft);
    return draft;
  };
  const associateToolCall = (cell: MutableCell, step: number, toolName: string): void => {
    const callId = toolCallIdsByStep.get(step)?.get(toolName);
    if (cell.callId === undefined && callId !== undefined) cell.callId = callId;
    const resolvedName = cell.callId === undefined ? undefined : toolCallNames.get(JSON.stringify([step, cell.callId]));
    if (resolvedName !== undefined) cell.toolName = resolvedName;
    attachToolSchema(cell);
  };
  const attachToolSchema = (cell: MutableCell): void => {
    const toolName = cell.toolName ?? cell.text;
    const stepTools = cell.step === null ? undefined : modelStarts.get(cell.step)?.tools;
    const definition = stepTools?.find((tool) => tool.name === toolName);
    if (definition === undefined || definition.parameters === undefined) return;
    const schemaDetail = JSON.stringify(
      {
        name: definition.name,
        description: definition.description ?? "",
        parameters: definition.parameters,
        ...(definition.strict === undefined ? {} : { strict: definition.strict })
      },
      null,
      2
    );
    cell.schemaDetail = schemaDetail;
  };
  const pushSystemPrompt = (
    prompt: string,
    tools: readonly TrajectoryToolDefinition[] | undefined,
    at: number,
    raw: unknown
  ): void => {
    const previousPrompt =
      projection.currentSystemPrompt === undefined || projection.currentTools === undefined
        ? undefined
        : {
            system: projection.currentSystemPrompt,
            tools: projection.currentTools
          };
    if (
      projection.systemPromptSeen &&
      projection.currentSystemPrompt === prompt &&
      sameToolDefinitions(projection.currentTools, tools)
    )
      return;
    const changed =
      previousPrompt !== undefined &&
      (previousPrompt.system !== prompt || !sameToolDefinitions(previousPrompt.tools, tools));
    group = getGroup(groups, "Message");
    push(group, {
      id: `${record.interactionId}:system:${projection.systemPromptSeen ? "update" : "initial"}`,
      turn: turnNumber,
      step: null,
      group: group.title,
      kind: "system",
      status: "completed",
      text: projection.systemPromptSeen ? "系统提示词已更新" : "初始系统提示词",
      preview: compactText(prompt),
      systemPromptDetail: prompt,
      // DSH's system-only detail represents missing schemas; [] means a known empty catalog.
      ...(tools === undefined ? {} : { promptDetail: { system: prompt, tools } }),
      promptTools: tools,
      ...(changed && previousPrompt !== undefined ? { previousPromptDetail: previousPrompt } : {}),
      rawDetail: raw,
      startedAtMilliseconds: at,
      durationMilliseconds: 0,
      isError: false,
      searchText: searchTextOf(
        prompt,
        ...(tools ?? []).map((tool) => tool.name),
        ...(tools ?? []).map((tool) => tool.description)
      )
    });
    projection.currentSystemPrompt = prompt;
    projection.currentTools = tools;
    projection.systemPromptSeen = true;
  };

  const input = isRecord(record.input) ? record.input : undefined;
  const inputText = typeof input?.text === "string" ? input.text : "";
  const inputSource = typeof input?.source === "string" ? input.source : undefined;
  const events = Array.isArray(record.agentEvents) ? record.agentEvents.filter(isRecord) : [];
  const initialRequest = findFirstRequestMessages(events);
  const initialSystemPrompt = findSystemPrompt(initialRequest);
  const initialTools = findRequestTools(events);
  if (initialSystemPrompt !== undefined) {
    pushSystemPrompt(initialSystemPrompt, initialTools, base ?? 0, {
      source: "model_request.messages",
      messages: initialRequest
    });
  }
  // The input snapshot owns USER content; model requests also contain runtime context.
  const userBlocks = readMessageSourceBlocks({ role: "user", content: input?.content ?? inputText }) ?? [
    { type: "text", content: inputText, role: "user" }
  ];
  const userRaw = {
    input: record.input,
    ...(record.asr === undefined ? {} : { asr: record.asr })
  };
  const initialUserCell = push(group, {
    id: `${record.interactionId}:user`,
    turn: turnNumber,
    step: null,
    group: group.title,
    kind: "user",
    status: "completed",
    text: "",
    preview: inputText,
    inputDetail: inputText,
    sourceBlocks: userBlocks,
    messageSource: { kind: "user", inputSource, interactionId: record.interactionId },
    rawDetail: userRaw,
    startedAtMilliseconds: base,
    durationMilliseconds: 0,
    isError: false,
    searchText: searchTextOf(inputText, inputSource, record.asr)
  });

  if (events.length === 0) {
    warnings.push(`第 ${turnNumber} 轮 Trace 没有 agentEvents，只能显示用户输入。`);
  }

  const modelStarts = new Map<number, ModelStart>();
  const requestMessages = new Map<string, unknown>();
  const requestDrafts = new Map<number, MutableRequest>();
  const directTools: PendingTool[] = [];
  const executeCells = new Map<number, MutableCell>();
  const subtoolCells = new Map<number, MutableCell[]>();
  const toolQueues = new Map<string, { cells: MutableCell[]; remaining: number; ambiguous: boolean }>();
  const identifiedTools = new Map<string, MutableCell>();
  const stepSnapshots = new Map<number, StepSnapshot>();
  const assistantSteps = new Set<number>();
  const observationInputs = new Set<string>();
  const contextInputs = new Set<string>();
  const hasCanonicalContext = events.some(
    (entry) =>
      isRecord(entry.event) && entry.event.type === "transcript_appended" && Array.isArray(entry.event.messages)
  );
  const requestSlots = createLegacyContextSlots(events);
  const requestToolGroups = createRequestToolGroups();
  const compactionInputs = new Set<string>();
  let contextStep: number | null = null;
  let lastAssistant: MutableCell | undefined;
  let lastEventAt = base;

  const eventTime = (entry: RecordObject): number => {
    const elapsed = finiteNumber(entry.elapsedMilliseconds) ?? 0;
    const at = base === null ? elapsed : base + elapsed;
    lastEventAt = at;
    return at;
  };

  const finishDirectToolsBefore = (step: number, at: number) => {
    for (const pending of directTools) {
      if (pending.step >= step || pending.cell.status !== "running") continue;
      finishCell(pending.cell, at, pending.cell.outputDetail, pending.cell.isError);
    }
  };

  const pushContext = (message: unknown, key: string, step: number | null, at: number, taskId: unknown) => {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "developer")) return;
    const payload = typeof message.content === "string" ? parseJson(message.content) : undefined;
    const contextKind = isRecord(payload) && typeof payload.contextKind === "string" ? payload.contextKind : undefined;
    // Task envelopes, request-local corrections and screenshot inputs are not Context history.
    if (
      contextKind === "agent_task" ||
      contextKind === "view_observation" ||
      contextKind === "agent_protocol_correction"
    )
      return;
    const source = isRecord(message.source) ? message.source : undefined;
    if (source?.kind === "user" || (!contextKind && message.role !== "developer" && !source)) return;
    if (contextInputs.has(key)) return;
    contextInputs.add(key);
    const contextGroup = getGroup(groups, step === null ? "Message" : `Step ${step}`);
    const detail = typeof message.content === "string" ? message.content : (prettyJson(message.content) ?? "");
    push(contextGroup, {
      id: `${record.interactionId}:context:${key}`,
      turn: turnNumber,
      step,
      group: contextGroup.title,
      kind: "context",
      status: "completed",
      text: contextKind ?? "Context",
      preview: compactText(detail),
      inputDetail: detail,
      rawDetail: message,
      sourceBlocks: readMessageSourceBlocks(message),
      messageSource: source ?? { kind: "runtime", contextKind, taskId },
      startedAtMilliseconds: at,
      durationMilliseconds: 0,
      isError: false,
      searchText: searchTextOf(contextKind, detail)
    });
  };
  const pushCompactions = (attempts: readonly RecordObject[], step: number) => {
    for (const attempt of attempts) {
      const compaction = readCompaction(attempt.contextCompaction);
      if (!compaction || compaction.status === "not_needed") continue;
      const key = requestKey(step, finiteInteger(attempt.attempt) ?? 1);
      if (compactionInputs.has(key)) continue;
      compactionInputs.add(key);
      const summary = compaction.replacement?.summary;
      const compactGroup = getGroup(groups, `Step ${step}`);
      push(compactGroup, {
        id: `${record.interactionId}:compaction:${step}:${attempt.attempt}`,
        turn: turnNumber,
        step: null,
        group: compactGroup.title,
        kind: "compacted",
        status: compaction.status === "failed" ? "failed" : "completed",
        text: `${compaction.beforeTokens} → ${compaction.afterTokens} token`,
        preview: summary ?? compaction.reason,
        inputDetail: prettyJson(compaction),
        outputDetail: summary,
        sourceBlocks: [{ type: "context-compaction", content: prettyJson(compaction)! }],
        rawDetail: compaction,
        startedAtMilliseconds: null,
        durationMilliseconds: compaction.durationMs,
        isError: compaction.status === "failed",
        searchText: searchTextOf(summary, compaction.reason)
      });
    }
  };

  for (const [eventIndex, entry] of events.entries()) {
    const event = entry.event;
    if (!isRecord(event)) continue;
    const type = typeof event.type === "string" ? event.type : "";
    const step = finiteInteger(event.step);
    const at = eventTime(entry);

    if (type === "model_started" && step !== null) {
      contextStep = step;
      const tools = readToolDefinitions(event);
      modelStarts.set(step, {
        at,
        ...(Array.isArray(event.availableApiNames)
          ? { availableApiNames: event.availableApiNames.filter((value): value is string => typeof value === "string") }
          : {}),
        ...(tools === undefined ? {} : { tools })
      });
      requestDrafts.set(step, {
        turn: turnNumber,
        step,
        group: `Step ${step}`,
        status: "running",
        startedAtMilliseconds: at,
        finishedAtMilliseconds: null,
        durationMilliseconds: null,
        attemptCount: 0,
        retry: 0,
        purpose: "assistant",
        ...(tools === undefined ? {} : { tools }),
        rawDetail: { started: event }
      });
      continue;
    }

    if (type === "input_attachments" && Array.isArray(event.images)) {
      const blocks = event.images
        .filter(isRecord)
        .filter((item) => isRecord(item.image))
        .map((item) => readImageSourceBlock(item.image as RecordObject));
      if (!event.inputId) {
        initialUserCell.sourceBlocks = [...(initialUserCell.sourceBlocks ?? []), ...blocks];
      } else {
        push(group, {
          id: `${record.interactionId}:input-images:${event.inputId}`,
          turn: turnNumber,
          step: contextStep,
          group: group.title,
          kind: "context",
          status: "completed",
          text: "补充图片",
          preview: "用户补充的截图",
          sourceBlocks: blocks,
          rawDetail: event,
          startedAtMilliseconds: at,
          durationMilliseconds: 0,
          isError: false,
          searchText: "用户截图附件",
          messageSource: { kind: "user", inputId: event.inputId }
        });
      }
      continue;
    }
    if (type === "transcript_appended") {
      // Like DSH tool/result, a receipt completes its call without another model request.
      applyToolResultMessage(
        directTools.filter((tool) => contextStep === null || tool.step === contextStep),
        event.messages,
        at,
        warnings,
        false
      );
      if (Array.isArray(event.messages))
        event.messages.forEach((message, index) =>
          pushContext(message, `event:${eventIndex}:message:${index}`, contextStep, at, event.taskId)
        );
      continue;
    }

    if (type === "model_request" && step !== null) {
      contextStep = step;
      const attempt = finiteInteger(event.attempt) ?? 1;
      const recordedTools = readToolDefinitions(event);
      const start = modelStarts.get(step);
      if (recordedTools !== undefined) {
        // Partial traces can record the request schema without a model_started timestamp.
        modelStarts.set(step, { at: null, ...start, tools: recordedTools });
      }
      requestMessages.set(requestKey(step, attempt), event.messages);
      const request = requestDrafts.get(step);
      if (request !== undefined) {
        request.attemptCount = Math.max(request.attemptCount, attempt);
        request.retry = Math.max(0, request.attemptCount - 1);
        request.inputDetail = prettyJson(event.messages);
        request.sourceBlocks = readRequestSourceBlocks(event.messages);
        request.tools = modelStarts.get(step)?.tools ?? request.tools;
        request.requestOptions = readRequestOptions(event);
        request.rawDetail = { ...(isRecord(request.rawDetail) ? request.rawDetail : {}), request: event };
      }
      const requestSystemPrompt = findSystemPrompt(event.messages);
      if (requestSystemPrompt !== undefined) {
        pushSystemPrompt(requestSystemPrompt, recordedTools ?? modelStarts.get(step)?.tools, at, {
          attempt,
          messages: event.messages
        });
      }
      if (Array.isArray(event.messages)) {
        const identities = requestSlots(requestKey(step, attempt), event.messages.length);
        const receiptGroups = requestToolGroups(event.messages, identities, step, directTools);
        for (const [index, target] of receiptGroups) {
          applyToolResultMessage([target], [event.messages[index]], at, warnings);
        }
        if (!hasCanonicalContext) {
          event.messages.forEach((message, index) => {
            const identity =
              isRecord(message) && typeof message.id === "string" ? `id:${message.id}` : identities[index];
            pushContext(message, `legacy:${identity}`, step, at, event.taskId);
          });
        }
        for (let i = 1; i < event.messages.length; i++) {
          const message = event.messages[i];
          const receipt = event.messages[i - 1];
          if (
            !isRecord(message) ||
            message.role !== "user" ||
            typeof message.content !== "string" ||
            !isRecord(receipt) ||
            receipt.role !== "tool" ||
            typeof receipt.toolCallId !== "string"
          )
            continue;
          const payload = parseJson(message.content);
          const producingCall = receiptGroups.get(i - 1);
          if (
            !isRecord(payload) ||
            payload.contextKind !== "view_observation" ||
            !producingCall ||
            observationInputs.has(producingCall.cell.id)
          )
            continue;
          observationInputs.add(producingCall.cell.id);
          const inputGroup = getGroup(groups, `Step ${step}`);
          push(inputGroup, {
            id: `${producingCall.cell.id}:view-input`,
            turn: turnNumber,
            step,
            group: inputGroup.title,
            kind: "context",
            status: "completed",
            text: "截图输入",
            preview: `${producingCall.toolName} → 模型输入`,
            inputDetail: message.content,
            rawDetail: message,
            sourceBlocks: readMessageSourceBlocks(message),
            messageSource: {
              role: "tool",
              name: producingCall.toolName,
              callId: receipt.toolCallId,
              step: producingCall.step
            },
            startedAtMilliseconds: at,
            durationMilliseconds: 0,
            isError: false,
            searchText: searchTextOf("observe_view", "截图输入", message.content)
          });
        }
      }
      finishDirectToolsBefore(step, at);
      continue;
    }

    if (type === "view_observed" && step !== null && typeof event.toolCallId === "string") {
      const target = directTools.find((pending) => pending.step === step && pending.cell.callId === event.toolCallId);
      if (target && isRecord(event.image)) {
        // New traces already have a receipt; enrich it without moving its completion time.
        if (target.cell.status === "running") {
          applyToolResult(target.cell, { ok: true, metadata: event.metadata, image: event.image }, at);
        }
        target.cell.outputBlocks = [...(target.cell.outputBlocks ?? []), readImageSourceBlock(event.image)];
        target.cell.result = `截图 ${event.image.width} × ${event.image.height}`;
      }
      continue;
    }

    if (type === "model_finished" && isRecord(event.step)) {
      const stepRecord = event.step;
      const finishedStep = finiteInteger(stepRecord.step);
      if (finishedStep === null) continue;
      contextStep = finishedStep;
      const modelStart = modelStarts.get(finishedStep);
      const attempts = Array.isArray(stepRecord.attempts) ? stepRecord.attempts.filter(isRecord) : [];
      pushCompactions(attempts, finishedStep);
      // Only the accepted response owns executed calls; rejected retries remain raw evidence.
      const acceptedCalls = attempts.at(-1)?.toolCalls;
      for (const call of Array.isArray(acceptedCalls) ? acceptedCalls.filter(isRecord) : []) {
        const callId = typeof call.id === "string" ? call.id : undefined;
        const callFunction = isRecord(call.function) ? call.function : undefined;
        const name = typeof callFunction?.name === "string" ? callFunction.name : undefined;
        if (callId !== undefined && name !== undefined) {
          toolCallNames.set(JSON.stringify([finishedStep, callId]), name);
          const byName = toolCallIdsByStep.get(finishedStep) ?? new Map<string, string>();
          if (!byName.has(name)) byName.set(name, callId);
          toolCallIdsByStep.set(finishedStep, byName);
        }
      }
      const decision = isRecord(stepRecord.decision) ? stepRecord.decision : undefined;
      const decisionType = typeof decision?.type === "string" ? decision.type : "";
      const directName = decisionType === "file" || decisionType === "invalid_tool" ? decision?.name : decisionType;
      if (
        (decisionType === "file" || decisionType === "invalid_tool" || decisionType === "execute") &&
        typeof stepRecord.toolCallId === "string" &&
        typeof directName === "string"
      ) {
        toolCallNames.set(JSON.stringify([finishedStep, stepRecord.toolCallId]), directName);
        toolCallIdsByStep.set(finishedStep, new Map([[directName, stepRecord.toolCallId]]));
      }
      // A batch has one model response, while each invocation has its own execution step.
      if (stepRecord.modelStep === undefined || stepRecord.modelStep === finishedStep) {
        const assistantStart = modelStart?.at ?? null;
        const assistant = projectAssistantCell({
          record,
          turnNumber,
          step: finishedStep,
          stepRecord,
          attempts,
          startedAt: assistantStart,
          finishedAt: at,
          requestMessages: findRequestMessages(requestMessages, finishedStep, attempts),
          requestTools: modelStart?.tools,
          group: `Step ${finishedStep}`
        });
        group = getGroup(groups, assistant.group);
        lastAssistant = push(group, assistant);
        assistantSteps.add(finishedStep);
        finishRequest(requestDrafts, finishedStep, at, assistant, undefined, attempts);
      }
      group = getGroup(groups, `Step ${finishedStep}`);
      if (decisionType === "execute" && decision !== undefined) {
        const execute = push(
          group,
          createExecuteCell({
            record,
            turnNumber,
            step: finishedStep,
            code: typeof decision.code === "string" ? decision.code : "",
            startedAt: at
          })
        );
        if (typeof stepRecord.toolCallId === "string") execute.callId = stepRecord.toolCallId;
        executeCells.set(finishedStep, execute);
        associateToolCall(execute, finishedStep, "execute");
      }
      if (
        decision !== undefined &&
        (decisionType === "read_tool" ||
          decisionType === "list_tool" ||
          decisionType === "search_tool" ||
          decisionType === "observe_view" ||
          decisionType === "read_image" ||
          decisionType === "pointer")
      ) {
        const tool = projectDecisionTool({
          record,
          turnNumber,
          step: finishedStep,
          decision,
          startedAt: at
        });
        group = getGroup(groups, tool.group);
        const pending = push(group, tool);
        if (typeof stepRecord.toolCallId === "string") pending.callId = stepRecord.toolCallId;
        associateToolCall(pending, finishedStep, pending.toolName ?? pending.text);
        attachToolSchema(pending);
        directTools.push({
          cell: pending,
          step: finishedStep,
          toolName: pending.toolName ?? pending.text
        });
      }
      continue;
    }

    if (type === "model_failed" && step !== null) {
      const attempts = Array.isArray(event.attempts) ? event.attempts.filter(isRecord) : [];
      pushCompactions(attempts, step);
      const modelStart = modelStarts.get(step);
      const error = isRecord(event.error) ? event.error : undefined;
      const assistant = projectAssistantFailureCell({
        record,
        turnNumber,
        step,
        attempts,
        error,
        startedAt: modelStart?.at ?? null,
        finishedAt: at,
        requestMessages: findRequestMessages(requestMessages, step, attempts),
        requestTools: modelStart?.tools
      });
      group = getGroup(groups, assistant.group);
      lastAssistant = push(group, assistant);
      assistantSteps.add(step);
      finishRequest(requestDrafts, step, at, assistant, event, attempts);
      continue;
    }

    if (type === "script_started" && step !== null) {
      const code = typeof event.code === "string" ? event.code : "";
      group = getGroup(groups, `Step ${step}`);
      const cell =
        executeCells.get(step) ??
        push(
          group,
          createExecuteCell({
            record,
            turnNumber,
            step,
            code,
            startedAt: at
          })
        );
      executeCells.set(step, cell);
      cell.startedAtMilliseconds = at;
      associateToolCall(cell, step, "execute");
      if (cell.inputDetail === undefined || cell.inputDetail === "") {
        cell.inputDetail = code;
        cell.preview = compactText(firstLine(code) || code || "execute");
        cell.rawDetail = { type: "execute", code };
        cell.searchText = searchTextOf("execute", code);
      }
      continue;
    }

    if (type === "tool_started" && step !== null) {
      const tool = typeof event.tool === "string" ? event.tool : "tool";
      const input = event.input;
      const ordinal = finiteInteger(event.call);
      group = getGroup(groups, `Step ${step}`);
      // Direct calls may already have a pending cell from model_finished (also
      // needed for old traces without lifecycle events). Enrich that same call.
      const direct = directTools.find(
        (pending) =>
          pending.step === step &&
          pending.toolName === tool &&
          (typeof event.toolCallId !== "string" || !pending.cell.callId || pending.cell.callId === event.toolCallId)
      );
      const cell =
        direct?.cell ??
        push(
          group,
          createSubtoolCell({
            record,
            turnNumber,
            step,
            tool,
            input,
            startedAt: at,
            call: ordinal
          })
        );
      cell.startedAtMilliseconds = at;
      if (typeof event.toolCallId === "string") cell.callId = event.toolCallId;
      if (toolCallIdsByStep.get(step)?.has(tool) && !executeCells.has(step)) {
        cell.kind = "tool";
        cell.callId = toolCallIdsByStep.get(step)!.get(tool);
        attachToolSchema(cell);
      }
      associateToolCall(cell, step, tool);
      if (ordinal !== null) {
        identifiedTools.set(subtoolCallId(record, step, ordinal), cell);
      } else {
        const queue = toolQueues.get(toolQueueKey(step, tool)) ?? { cells: [], remaining: 0, ambiguous: false };
        queue.cells.push(cell);
        queue.remaining++;
        queue.ambiguous ||= queue.remaining > 1;
        toolQueues.set(toolQueueKey(step, tool), queue);
      }
      const stepCells = subtoolCells.get(step) ?? [];
      stepCells.push(cell);
      subtoolCells.set(step, stepCells);
      continue;
    }

    if (type === "tool_finished" && step !== null) {
      const tool = typeof event.tool === "string" ? event.tool : "tool";
      const ordinal = finiteInteger(event.call);
      let cell: MutableCell | undefined;
      if (ordinal !== null) {
        const id = subtoolCallId(record, step, ordinal);
        cell = identifiedTools.get(id);
        if (cell?.toolName !== tool) cell = undefined;
        if (cell) identifiedTools.delete(id);
      } else {
        const key = toolQueueKey(step, tool);
        const queue = toolQueues.get(key);
        if (queue) {
          if (!queue.ambiguous) cell = queue.cells[0];
          else if (queue.remaining === queue.cells.length) {
            warnings.push(
              `第 ${turnNumber} 轮 Step ${step} 的 ${tool} 并发调用缺少调用标识，结果关联需以脚本汇总为准。`
            );
          }
          if (--queue.remaining === 0) toolQueues.delete(key);
        }
      }
      if (cell !== undefined) {
        associateToolCall(cell, step, tool);
        applyToolResult(
          cell,
          isRecord(event.result) && event.receipt ? { ...event.result, receipt: event.receipt } : event.result,
          at
        );
      }
      continue;
    }

    if (type === "script_trace" && step !== null && isRecord(event.trace)) {
      applyScriptTrace({
        trace: event.trace,
        step,
        at,
        record,
        turnNumber,
        groups,
        executeCells,
        subtoolCells,
        push
      });
      continue;
    }

    if (type === "script_finished" && step !== null) {
      const cell = executeCells.get(step);
      if (cell !== undefined) {
        associateToolCall(cell, step, "execute");
        applyToolResult(
          cell,
          isRecord(event.result) && event.receipt ? { ...event.result, receipt: event.receipt } : event.result,
          at
        );
      }
      continue;
    }

    if (type === "task_completed" && isRecord(event.result)) {
      collectStepSnapshots(stepSnapshots, event.result.steps);
      if (lastAssistant !== undefined) {
        const finalMessage = typeof event.result.finalMessage === "string" ? event.result.finalMessage : undefined;
        if (finalMessage !== undefined && lastAssistant.outputDetail === undefined) {
          lastAssistant.outputDetail = finalMessage;
          lastAssistant.preview = compactText(finalMessage);
          lastAssistant.searchText = searchTextOf(
            lastAssistant.text,
            lastAssistant.preview,
            lastAssistant.outputDetail,
            lastAssistant.inputDetail
          );
        }
      }
      continue;
    }

    if (type === "task_failed") {
      collectStepSnapshots(stepSnapshots, event.steps);
      const failure = isRecord(event.failure) ? event.failure : undefined;
      const message =
        typeof failure?.message === "string"
          ? failure.message
          : typeof event.error === "object" && event.error !== null && "message" in event.error
            ? String((event.error as { message?: unknown }).message ?? "")
            : "Agent task failed";
      if (lastAssistant === undefined || !lastAssistant.isError) {
        const failureStep = lastAssistant?.step ?? 1;
        group = getGroup(groups, `Step ${failureStep}`);
        lastAssistant = push(group, {
          id: `${record.interactionId}:task-error`,
          turn: turnNumber,
          step: failureStep,
          group: group.title,
          kind: lastAssistant === undefined ? "assistant" : "context",
          status: "failed",
          text: "",
          preview: message,
          ...(lastAssistant === undefined ? { outputDetail: message } : { inputDetail: message }),
          rawDetail: event,
          startedAtMilliseconds: at,
          durationMilliseconds: 0,
          isError: true,
          searchText: searchTextOf(message)
        });
      } else {
        lastAssistant.isError = true;
        lastAssistant.status = "failed";
        lastAssistant.outputDetail = appendDetail(lastAssistant.outputDetail, message);
        lastAssistant.searchText = searchTextOf(lastAssistant.searchText, lastAssistant.outputDetail);
      }
      continue;
    }

    if (type === "trace_capture_failed") {
      warnings.push(`第 ${turnNumber} 轮有事件捕获失败：${stringifyCompact(event.error)}`);
    }
  }

  for (const request of requestDrafts.values()) {
    if (assistantSteps.has(request.step)) {
      request.requestOnly = false;
      continue;
    }
    request.requestOnly = true;
    const requestGroup = getGroup(groups, request.group);
    group = requestGroup;
    push(requestGroup, {
      id: `${record.interactionId}:request-only:${request.step}`,
      turn: turnNumber,
      step: request.step,
      group: request.group,
      kind: "assistant",
      status: request.status === "running" && record.status !== "running" ? "failed" : request.status,
      text: "",
      requestOnly: true,
      ...(request.inputDetail === undefined ? {} : { inputDetail: request.inputDetail }),
      ...(request.sourceBlocks === undefined ? {} : { sourceBlocks: request.sourceBlocks }),
      ...(request.tools === undefined ? {} : { promptTools: request.tools }),
      ...(request.requestOptions === undefined ? {} : { requestOptions: request.requestOptions }),
      rawDetail: request.rawDetail,
      startedAtMilliseconds: request.startedAtMilliseconds,
      durationMilliseconds: request.durationMilliseconds,
      isError: request.status === "failed" || record.status !== "running",
      searchText: searchTextOf(request.inputDetail)
    });
  }

  for (const [step, snapshot] of stepSnapshots) {
    if (snapshot.scriptResult === undefined) continue;
    const execute = executeCells.get(step);
    if (execute !== undefined) {
      applyToolResult(
        execute,
        snapshot.scriptResult,
        execute.startedAtMilliseconds === null
          ? (lastEventAt ?? finished ?? base ?? 0)
          : execute.startedAtMilliseconds + (execute.durationMilliseconds ?? 0)
      );
    }
    const direct = directTools.find((pending) => pending.step === step);
    if (direct !== undefined) {
      applyToolResult(
        direct.cell,
        snapshot.scriptResult,
        direct.cell.startedAtMilliseconds === null
          ? (lastEventAt ?? finished ?? base ?? 0)
          : direct.cell.startedAtMilliseconds + (direct.cell.durationMilliseconds ?? 0)
      );
    }
  }

  // A closed turn interrupts unfinished calls; an exported live snapshot does not.
  if (record.status !== "running") {
    for (const cell of cells) {
      if (cell.status === "running" && (cell.kind === "tool" || cell.kind === "subtool")) {
        finishCell(cell, finished ?? lastEventAt ?? base, undefined, true);
      }
    }
  }

  // Resolve bytes only in presentation blocks, never duplicate them into raw request JSON.
  const attachments = new Map(
    (Array.isArray(record.attachments) ? record.attachments : [])
      .filter(isRecord)
      .filter((image) => typeof image.attachmentId === "string")
      .map((image) => [image.attachmentId as string, image])
  );
  const imageWarnings = new Set<string>();
  const resolveImages = (blocks: readonly TrajectorySourceBlock[] | undefined) =>
    blocks?.map((block) => {
      if (!block.attachment) return block;
      const { attachmentId, ...reference } = block.attachment;
      const stored = attachmentId ? attachments.get(attachmentId) : undefined;
      const dataUrl = typeof stored?.dataUrl === "string" ? stored.dataUrl : reference.dataUrl;
      const attachment = { ...reference, ...(stored ?? {}), ...(dataUrl ? { dataUrl } : {}) };
      if (!dataUrl || !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(dataUrl)) {
        const reason =
          reference.omitted === "attachment-budget-exceeded"
            ? "截图超过 Trace 附件预算，图片未保存"
            : reference.omitted === "attachment-storage-failed"
              ? "截图写入本地附件库失败，图片未保存"
              : reference.omitted === "attachment-pending"
                ? "截图尚未完成本地附件保存"
                : "Trace 未记录图片数据或附件缺失";
        imageWarnings.add(`第 ${turnNumber} 轮：${reason}。`);
        return { ...block, content: `[${reason}]`, attachment: undefined };
      }
      return { ...block, attachment };
    });
  for (const cell of cells) {
    cell.sourceBlocks = resolveImages(cell.sourceBlocks);
    cell.outputBlocks = resolveImages(cell.outputBlocks);
  }
  for (const request of requestDrafts.values()) request.sourceBlocks = resolveImages(request.sourceBlocks);
  warnings.push(...imageWarnings);

  const indexById = new Map(cells.map((cell, offset) => [cell.id, firstIndex + offset]));
  const projectedGroups = groups
    .filter((entry) => entry.cells.length > 0)
    .map((entry): TrajectoryGroup => {
      const projectedCells = entry.cells
        .sort((left, right) => left._order - right._order)
        .map(
          (cell): TrajectoryCell => ({
            ...cell,
            index: indexById.get(cell.id) ?? firstIndex
          })
        );
      return {
        title: entry.title,
        ...(entry.title.startsWith("Step ") ? optionalDescription("description", describeGroup(projectedCells)) : {}),
        cells: projectedCells
      };
    });
  const projectedCells = cells.map(
    (cell): TrajectoryCell => ({
      ...cell,
      index: indexById.get(cell.id) ?? firstIndex
    })
  );
  for (const request of requestDrafts.values()) {
    if (request.status !== "running") continue;
    request.status = record.status === "running" ? "running" : "failed";
    request.finishedAtMilliseconds = finished;
    if (request.startedAtMilliseconds !== null && finished !== null) {
      request.durationMilliseconds = Math.max(0, finished - request.startedAtMilliseconds);
    }
  }
  const status = traceStatus(record);
  return {
    turn: {
      turn: turnNumber,
      title: compactText(inputText || `Turn ${turnNumber}`, DEFAULT_TITLE_CHARACTERS),
      status,
      startedAtMilliseconds: base,
      finishedAtMilliseconds: finished,
      durationMilliseconds: duration,
      groups: projectedGroups,
      cells: projectedCells
    },
    requests: [...requestDrafts.values()]
  };
}

function finishRequest(
  requests: Map<number, MutableRequest>,
  step: number,
  at: number,
  assistant: CellDraft,
  event?: RecordObject,
  attempts: readonly RecordObject[] = []
): void {
  const request = requests.get(step);
  if (request === undefined) return;
  request.status = assistant.status;
  request.finishedAtMilliseconds = at;
  request.durationMilliseconds = assistant.durationMilliseconds;
  request.provider = assistant.provider;
  request.model = assistant.model;
  request.traceId = assistant.traceId;
  request.usage = readUsage(event ?? {}, attempts) ?? assistant.usage;
  request.attemptCount = Math.max(
    request.attemptCount,
    attempts.length,
    ...attempts.map((attempt) => finiteInteger(attempt.attempt) ?? 0)
  );
  request.retry = Math.max(0, request.attemptCount - 1);
  request.inputDetail = assistant.inputDetail;
  request.sourceBlocks = readRequestSourceBlocks(
    request.inputDetail === undefined ? undefined : parseJson(request.inputDetail)
  );
  request.tools = assistant.promptTools ?? request.tools;
  request.firstTokenAtMilliseconds = assistant.assistantMetrics?.firstTokenTime ?? null;
  const lastFailedAttempt = attempts.findLast((attempt) => attempt.error != null);
  const failure = event?.error ?? lastFailedAttempt?.error;
  request.error =
    failure == null
      ? assistant.isError
        ? assistant.outputDetail
        : undefined
      : isRecord(failure) && typeof failure.message === "string"
        ? failure.message
        : stringifyCompact(failure);
  const error = isRecord(failure) ? failure : undefined;
  request.errorCode = readNestedString(error, "code", "errorCode");
  request.rawDetail = event ?? assistant.rawDetail;
}

function projectAssistantCell(input: {
  record: AgentTraceSnapshot;
  turnNumber: number;
  step: number;
  stepRecord: RecordObject;
  attempts: readonly RecordObject[];
  startedAt: number | null;
  finishedAt: number;
  requestMessages: unknown;
  requestTools?: readonly TrajectoryToolDefinition[];
  group: string;
}): CellDraft {
  const decision = isRecord(input.stepRecord.decision) ? input.stepRecord.decision : undefined;
  // A successful tool-only response owns its empty content, not a prior retry's text.
  const acceptedAttempt = input.attempts.at(-1);
  const rawContent =
    typeof acceptedAttempt?.rawContent === "string" && acceptedAttempt.rawContent !== ""
      ? acceptedAttempt.rawContent
      : undefined;
  const finalMessage =
    decision?.type === "final" && typeof decision.message === "string" ? decision.message : undefined;
  const text =
    (finalMessage ?? (rawContent !== undefined && !looksLikeToolPayload(rawContent) ? rawContent : "")) || "仅工具调用";
  const outputDetail = finalMessage ?? rawContent;
  const thinking = readNestedString(acceptedAttempt?.debug, "reasoningContent", "reasoning", "thinking");
  const model = input.attempts
    .map((attempt) => readNestedString(attempt.debug, "modelName", "requestedModel", "modelRoute"))
    .filter((value): value is string => value !== undefined)
    .at(-1);
  const provider = input.attempts
    .map((attempt) => readNestedString(attempt.debug, "provider", "providerName", "modelProvider"))
    .filter((value): value is string => value !== undefined)
    .at(-1);
  const traceId = input.attempts
    .map((attempt) => (typeof attempt.traceId === "string" ? attempt.traceId : undefined))
    .filter((value): value is string => value !== undefined)
    .at(-1);
  const usage = readUsage(input.stepRecord, input.attempts);
  // model_finished is emitted only after a valid decision, including successful retries.
  const isError = false;
  const assistantSourceBlocks = readAssistantSourceBlocks(input.stepRecord, input.attempts, thinking, outputDetail);
  return {
    id: `${input.record.interactionId}:assistant:${input.step}`,
    turn: input.turnNumber,
    step: input.step,
    group: input.group,
    kind: "assistant",
    status: isError ? "failed" : "completed",
    text: text === "仅工具调用" ? text : "",
    ...(text === "仅工具调用" ? {} : { preview: compactText(text) }),
    ...(outputDetail === undefined ? {} : { outputDetail }),
    ...(thinking === undefined ? {} : { thinkingDetail: thinking }),
    ...(assistantSourceBlocks === undefined ? {} : { sourceBlocks: assistantSourceBlocks }),
    ...(input.requestMessages === undefined ? {} : { inputDetail: prettyJson(input.requestMessages) }),
    ...(input.requestTools === undefined ? {} : { promptTools: input.requestTools }),
    rawDetail: input.stepRecord,
    startedAtMilliseconds: input.startedAt,
    durationMilliseconds:
      input.startedAt === null
        ? sumNumbers(input.attempts.map((attempt) => finiteNumber(attempt.durationMilliseconds)))
        : Math.max(0, input.finishedAt - input.startedAt),
    isError,
    ...(typeof input.stepRecord.toolCallId === "string" ? { callId: input.stepRecord.toolCallId } : {}),
    ...(model === undefined ? {} : { model }),
    ...(provider === undefined ? {} : { provider }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(usage === undefined ? {} : { usage }),
    assistantMetrics: {
      timingRecorded: true,
      stepStartTime: input.startedAt,
      firstTokenTime: readFirstTokenTime(input.stepRecord, input.attempts),
      completedTime: input.finishedAt,
      usageProvided: usage !== undefined,
      outputTokens: usage?.output ?? null
    },
    searchText: searchTextOf(text, outputDetail, thinking, model, traceId, prettyJson(input.requestMessages))
  };
}

function projectAssistantFailureCell(input: {
  record: AgentTraceSnapshot;
  turnNumber: number;
  step: number;
  attempts: readonly RecordObject[];
  error: RecordObject | undefined;
  startedAt: number | null;
  finishedAt: number;
  requestMessages: unknown;
  requestTools?: readonly TrajectoryToolDefinition[];
}): CellDraft {
  const message =
    typeof input.error?.message === "string"
      ? input.error.message
      : (input.attempts
          .map((attempt) => (typeof attempt.error === "string" ? attempt.error : undefined))
          .filter((value): value is string => value !== undefined)
          .at(-1) ?? "模型请求失败");
  const lastAttempt = input.attempts.at(-1);
  const output =
    typeof lastAttempt?.rawContent === "string" && lastAttempt.rawContent !== "" ? lastAttempt.rawContent : message;
  const thinking = readNestedString(lastAttempt?.debug, "reasoningContent", "reasoning", "thinking");
  const usage = readUsage({}, input.attempts);
  const sourceBlocks = readAssistantSourceBlocks({}, input.attempts, thinking, output);
  return {
    id: `${input.record.interactionId}:model-failed:${input.step}`,
    turn: input.turnNumber,
    step: input.step,
    group: `Step ${input.step}`,
    kind: "assistant",
    status: "failed",
    text: "",
    preview: compactText(output),
    outputDetail: output,
    ...(thinking === undefined ? {} : { thinkingDetail: thinking }),
    ...(usage === undefined ? {} : { usage }),
    provider: readNestedString(lastAttempt?.debug, "provider", "providerName", "modelProvider"),
    model: readNestedString(lastAttempt?.debug, "modelName", "requestedModel", "modelRoute"),
    ...(typeof lastAttempt?.traceId === "string" ? { traceId: lastAttempt.traceId } : {}),
    ...(input.requestMessages === undefined ? {} : { inputDetail: prettyJson(input.requestMessages) }),
    ...(sourceBlocks === undefined ? {} : { sourceBlocks }),
    ...(input.requestTools === undefined ? {} : { promptTools: input.requestTools }),
    rawDetail: { attempts: input.attempts, error: input.error },
    startedAtMilliseconds: input.startedAt,
    durationMilliseconds:
      input.startedAt === null
        ? sumNumbers(input.attempts.map((attempt) => finiteNumber(attempt.durationMilliseconds)))
        : Math.max(0, input.finishedAt - input.startedAt),
    isError: true,
    assistantMetrics: {
      timingRecorded: true,
      stepStartTime: input.startedAt,
      firstTokenTime: readFirstTokenTime({}, input.attempts),
      completedTime: input.finishedAt,
      usageProvided: usage !== undefined,
      outputTokens: usage?.output ?? null
    },
    searchText: searchTextOf(message, prettyJson(input.attempts), prettyJson(input.requestMessages))
  };
}

function projectDecisionTool(input: {
  record: AgentTraceSnapshot;
  turnNumber: number;
  step: number;
  decision: RecordObject;
  startedAt: number;
}): CellDraft {
  const type = typeof input.decision.type === "string" ? input.decision.type : "tool";
  const toolName = type === "observe_view" ? "observe_view" : type;
  return {
    id: `${input.record.interactionId}:direct-tool:${input.step}`,
    turn: input.turnNumber,
    step: input.step,
    group: `Step ${input.step}`,
    kind: "tool",
    status: "running",
    text: toolName,
    preview: compactText(stringifyCompact(input.decision)),
    inputDetail: prettyJson(input.decision),
    rawDetail: input.decision,
    startedAtMilliseconds: input.startedAt,
    durationMilliseconds: null,
    isError: false,
    toolName,
    searchText: searchTextOf(toolName, prettyJson(input.decision))
  };
}

function createExecuteCell(input: {
  record: AgentTraceSnapshot;
  turnNumber: number;
  step: number;
  code: string;
  startedAt: number;
}): CellDraft {
  return {
    id: `${input.record.interactionId}:execute:${input.step}`,
    turn: input.turnNumber,
    step: input.step,
    group: `Step ${input.step}`,
    kind: "tool",
    status: "running",
    text: "execute",
    preview: compactText(firstLine(input.code) || input.code),
    inputDetail: input.code,
    rawDetail: { type: "execute", code: input.code },
    startedAtMilliseconds: input.startedAt,
    durationMilliseconds: null,
    isError: false,
    toolName: "execute",
    searchText: searchTextOf("execute", input.code)
  };
}

function createSubtoolCell(input: {
  record: AgentTraceSnapshot;
  turnNumber: number;
  step: number;
  tool: string;
  input: unknown;
  startedAt: number;
  call?: number | null;
}): CellDraft {
  return {
    id: `${input.record.interactionId}:subtool:${input.step}:${input.tool}:${input.startedAt}`,
    turn: input.turnNumber,
    step: input.step,
    group: `Step ${input.step}`,
    kind: "subtool",
    status: "running",
    text: input.tool,
    preview: compactText(stringifyCompact(input.input)),
    inputDetail: prettyJson(input.input),
    rawDetail: { tool: input.tool, input: input.input },
    startedAtMilliseconds: input.startedAt,
    durationMilliseconds: null,
    isError: false,
    toolName: input.tool,
    ...(input.call == null ? {} : { callId: subtoolCallId(input.record, input.step, input.call) }),
    searchText: searchTextOf(input.tool, prettyJson(input.input))
  };
}

function applyScriptTrace(input: {
  trace: RecordObject;
  step: number;
  at: number;
  record: AgentTraceSnapshot;
  turnNumber: number;
  groups: GroupDraft[];
  executeCells: Map<number, MutableCell>;
  subtoolCells: Map<number, MutableCell[]>;
  push: (group: GroupDraft, cell: CellDraft) => MutableCell;
}): void {
  const traceDuration = finiteNumber(input.trace.durationMilliseconds);
  const traceStartedAt = readTimestamp(input.trace.startedAt);
  const startedAt = traceStartedAt ?? (traceDuration === null ? input.at : input.at - traceDuration);
  const group = getGroup(input.groups, `Step ${input.step}`);
  const execute =
    input.executeCells.get(input.step) ??
    input.push(
      group,
      createExecuteCell({
        record: input.record,
        turnNumber: input.turnNumber,
        step: input.step,
        code: typeof input.trace.source === "string" ? input.trace.source : "",
        startedAt
      })
    );
  input.executeCells.set(input.step, execute);
  execute.inputDetail = typeof input.trace.source === "string" ? input.trace.source : execute.inputDetail;
  execute.preview = compactText(firstLine(execute.inputDetail ?? "") || execute.preview || "execute");
  execute.rawDetail = input.trace;
  if (traceDuration !== null) {
    execute.durationMilliseconds = traceDuration;
  }
  applyToolResult(execute, input.trace.result, startedAt + (traceDuration ?? 0));

  const traceCalls = Array.isArray(input.trace.toolCalls) ? input.trace.toolCalls.filter(isRecord) : [];
  const existing = [...(input.subtoolCells.get(input.step) ?? [])];
  const identified = new Map(existing.filter((cell) => cell.callId !== undefined).map((cell) => [cell.callId, cell]));
  const legacy = existing.filter((cell) => cell.callId === undefined);
  // Legacy ordinals are only unambiguous with a complete, contiguous summary.
  const complete = traceCalls.length === legacy.length && traceCalls.every((value, i) => value.call === i + 1);
  const matched = new Set<MutableCell>();
  let cursor = startedAt;
  for (const call of traceCalls) {
    const tool = typeof call.tool === "string" ? call.tool : "tool";
    const duration = finiteNumber(call.durationMilliseconds);
    // Script call ordinals describe start order, not completion order.
    const ordinal = finiteInteger(call.call);
    const id = ordinal === null ? undefined : subtoolCallId(input.record, input.step, ordinal);
    const byId = id === undefined ? undefined : identified.get(id);
    const byOrdinal = ordinal === null ? undefined : legacy[ordinal - 1];
    const matches = (cell: MutableCell) =>
      !matched.has(cell) && cell.toolName === tool && cell.inputDetail === prettyJson(call.input);
    const candidates = legacy.filter(matches);
    const matching =
      byId ??
      (complete && byOrdinal !== undefined && matches(byOrdinal)
        ? byOrdinal
        : candidates.length === 1
          ? candidates[0]
          : undefined);
    const cell =
      matching ??
      input.push(
        group,
        createSubtoolCell({
          record: input.record,
          turnNumber: input.turnNumber,
          step: input.step,
          tool,
          input: call.input,
          startedAt: cursor,
          call: ordinal
        })
      );
    cell.inputDetail = prettyJson(call.input);
    cell.preview = compactText(stringifyCompact(call.input));
    cell.rawDetail = call;
    const measuredDuration = duration ?? cell.durationMilliseconds;
    applyToolResult(cell, call.result, (cell.startedAtMilliseconds ?? cursor) + (measuredDuration ?? 0));
    cell.durationMilliseconds = measuredDuration;
    matched.add(cell);
    if (matching === undefined) {
      const cells = input.subtoolCells.get(input.step) ?? [];
      cells.push(cell);
      input.subtoolCells.set(input.step, cells);
    }
    cursor += duration ?? 0.1;
  }
}

function subtoolCallId(record: AgentTraceSnapshot, step: number, ordinal: number): string {
  return `${record.taskId ?? record.interactionId}:${step}:subcall:${ordinal}`;
}

/** Request history replays native IDs; only the owning assistant slot identifies a call group. */
function createRequestToolGroups() {
  const bindings = new Map<string, PendingTool | undefined>();
  const assigned = new Set<string>();
  return (messages: readonly unknown[], slots: readonly string[], step: number, tools: readonly PendingTool[]) => {
    const receipts = new Map<number, PendingTool>();
    const groups: { key: string; callId: string; name?: string; receipts: number[] }[] = [];
    let current = new Map<string, (typeof groups)[number]>();
    const ungrouped: number[] = [];
    messages.forEach((message, index) => {
      if (!isRecord(message)) return;
      if (message.role === "assistant") {
        current = new Map();
        if (!Array.isArray(message.toolCalls)) return;
        for (const call of message.toolCalls) {
          if (!isRecord(call) || typeof call.id !== "string") continue;
          const group = {
            key: JSON.stringify([slots[index], call.id]),
            callId: call.id,
            name: isRecord(call.function) && typeof call.function.name === "string" ? call.function.name : undefined,
            receipts: [] as number[]
          };
          groups.push(group);
          current.set(call.id, group);
        }
      } else if (message.role === "tool") {
        const group = typeof message.toolCallId === "string" ? current.get(message.toolCallId) : undefined;
        if (group) group.receipts.push(index);
        else ungrouped.push(index);
      }
    });
    // New history is appended after the last request. Bind newest groups first so
    // pre-task history cannot claim a current call with the same provider ID.
    for (const group of groups.reverse()) {
      let target = bindings.get(group.key);
      if (!bindings.has(group.key)) {
        target = tools.findLast(
          (tool) =>
            tool.step < step &&
            !assigned.has(tool.cell.id) &&
            tool.cell.callId === group.callId &&
            (group.name === undefined || tool.toolName === group.name)
        );
        if (target) {
          assigned.add(target.cell.id);
        }
        bindings.set(group.key, target);
      }
      if (target) for (const index of group.receipts) receipts.set(index, target);
    }
    // Partial old exports may omit assistant messages. Never guess among reused IDs,
    // including already completed calls whose receipts can still be replayed.
    for (const index of ungrouped) {
      const message = messages[index] as RecordObject;
      const candidates = tools.filter((tool) => tool.step < step && tool.cell.callId === message.toolCallId);
      if (candidates.length === 1) receipts.set(index, candidates[0]);
    }
    return receipts;
  };
}

function applyToolResultMessage(
  pending: readonly PendingTool[],
  messages: unknown,
  at: number,
  warnings: string[],
  allowUnidentified = true
): void {
  if (!Array.isArray(messages)) return;
  const toolMessages = messages
    .filter(isRecord)
    .filter((message) => message.role === "tool")
    .filter((message) => typeof message.content === "string");
  for (const message of toolMessages) {
    const running = pending.filter((entry) => entry.cell.status === "running");
    const target =
      running.find((entry) => entry.cell.callId !== undefined && entry.cell.callId === message.toolCallId) ??
      (allowUnidentified && typeof message.toolCallId !== "string"
        ? running.find((entry) => entry.cell.callId === undefined)
        : undefined);
    if (target === undefined) continue;
    const parsed = parseJson(message.content as string);
    if (parsed === undefined && typeof message.content === "string") {
      warnings.push(`工具结果不是合法 JSON：${compactText(message.content)}`);
    }
    applyToolResult(target.cell, parsed ?? message.content, at);
  }
}

function applyToolResult(cell: MutableCell, result: unknown, at: number): void {
  const normalized = normalizeToolResult(result);
  cell.outputDetail = normalized.detail;
  cell.outputBlocks = normalized.blocks;
  cell.result = normalized.summary;
  cell.isError = normalized.isError;
  cell.status = normalized.isError ? "failed" : "completed";
  if (cell.startedAtMilliseconds !== null) {
    cell.durationMilliseconds = Math.max(0, at - cell.startedAtMilliseconds);
  }
  cell.rawDetail = cell.rawDetail === undefined ? result : { input: cell.rawDetail, result };
  cell.searchText = searchTextOf(
    cell.searchText,
    cell.result,
    cell.outputDetail,
    prettyJson(result),
    ...(cell.outputBlocks ?? []).flatMap((block) => [
      block.type,
      block.content,
      block.attachment?.name,
      block.file?.name
    ])
  );
}

function normalizeToolResult(value: unknown): {
  summary: string;
  detail: string;
  blocks: readonly TrajectorySourceBlock[];
  isError: boolean;
} {
  const consoleBlocks: TrajectorySourceBlock[] =
    isRecord(value) && Array.isArray(value.console) && value.console.length
      ? [
          {
            type: "text",
            content:
              "Console\n" +
              value.console
                .map((entry) =>
                  isRecord(entry)
                    ? `[${String(entry.level)}] ${(Array.isArray(entry.args) ? entry.args : []).map((arg) => (typeof arg === "string" ? arg : stringifyCompact(arg))).join(" ")}`
                    : stringifyCompact(entry)
                )
                .join("\n")
          }
        ]
      : [];
  if (isRecord(value) && value.ok === false) {
    const error = isRecord(value.error) ? value.error : value;
    const code = typeof error.code === "string" ? error.code : "ERROR";
    const message = typeof error.message === "string" ? error.message : stringifyCompact(error);
    const detail = prettyJson(value) ?? stringifyCompact(value);
    return {
      summary: compactText(`${code}: ${message}`),
      detail,
      blocks: [...consoleBlocks, { type: "text", content: detail }],
      isError: true
    };
  }
  const payload =
    isRecord(value) && "result" in value
      ? value.result
      : isRecord(value) && "output" in value
        ? value.output
        : isRecord(value) && "value" in value
          ? value.value
          : value;
  const detail = prettyJson(value) ?? stringifyCompact(value);
  const blocks: readonly TrajectorySourceBlock[] =
    isRecord(value) && ("console" in value || "returnValuePresent" in value)
      ? [
          ...consoleBlocks,
          {
            type: "text",
            content:
              "Return\n" +
              (value.returnValuePresent === false ? "undefined" : (prettyJson(payload) ?? stringifyCompact(payload)))
          },
          ...(value.receipt ? [{ type: "text", content: "Execution\n" + prettyJson(value.receipt) }] : [])
        ]
      : readToolResultBlocks(payload);
  return {
    summary: compactText(stringifyCompact(payload)),
    detail,
    blocks: blocks.length > 0 ? blocks : [{ type: "text", content: detail }],
    isError: false
  };
}

/**
 * Preserve structured tool result blocks when a host records MCP-style
 * `content`; older scalar results remain one text block.
 */
function readToolResultBlocks(value: unknown): readonly TrajectorySourceBlock[] {
  const source = isRecord(value) && Array.isArray(value.content) ? value.content : Array.isArray(value) ? value : [];
  return source.flatMap((entry): TrajectorySourceBlock[] => {
    if (!isRecord(entry)) return [];
    const type = typeof entry.type === "string" ? entry.type : "unknown";
    const content =
      typeof entry.text === "string"
        ? entry.text
        : typeof entry.content === "string"
          ? entry.content
          : stringifyCompact(entry);
    if (type === "image" || type === "image_url") {
      const image = isRecord(entry.image) ? entry.image : undefined;
      const imageUrl = isRecord(entry.image_url) ? entry.image_url : undefined;
      const dataUrl =
        typeof image?.dataUrl === "string"
          ? image.dataUrl
          : typeof imageUrl?.url === "string"
            ? imageUrl.url
            : undefined;
      return [
        {
          type: "image",
          content,
          ...(dataUrl?.startsWith("data:image/") === true ? { attachment: { dataUrl } } : {})
        }
      ];
    }
    if (type === "file") {
      const file = isRecord(entry.file) ? entry.file : entry;
      return [
        {
          type,
          content,
          file: {
            ...(typeof file.name === "string" ? { name: file.name } : {}),
            ...(typeof file.mediaType === "string" ? { mediaType: file.mediaType } : {}),
            ...(typeof file.bytes === "number" ? { bytes: file.bytes } : {})
          }
        }
      ];
    }
    return [{ type, content }];
  });
}

function finishCell(cell: MutableCell, at: number | null, output: string | undefined, isError: boolean): void {
  if (output !== undefined) cell.outputDetail = output;
  if (isError) cell.isError = true;
  cell.status = isError ? "failed" : "completed";
  if (cell.startedAtMilliseconds !== null && at !== null) {
    cell.durationMilliseconds = Math.max(0, at - cell.startedAtMilliseconds);
  }
}

function collectStepSnapshots(target: Map<number, StepSnapshot>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const step of value.filter(isRecord)) {
    const number = finiteInteger(step.step);
    if (number === null) continue;
    target.set(number, { step: number, scriptResult: step.scriptResult });
  }
}

function findRequestMessages(
  messages: ReadonlyMap<string, unknown>,
  step: number,
  attempts: readonly RecordObject[]
): unknown {
  for (const attempt of [...attempts].reverse()) {
    const number = finiteInteger(attempt.attempt);
    if (number === null) continue;
    const found = messages.get(requestKey(step, number));
    if (found !== undefined) return found;
  }
  return messages.get(requestKey(step, 1));
}

function requestKey(step: number, attempt: number): string {
  return `${step}\u0000${attempt}`;
}

function toolQueueKey(step: number, tool: string): string {
  return `${step}\u0000${tool}`;
}

function getGroup(groups: GroupDraft[], title: string): GroupDraft {
  const existing = groups.find((group) => group.title === title);
  if (existing !== undefined) return existing;
  const group: GroupDraft = { title, cells: [] };
  groups.push(group);
  return group;
}

function describeGroup(cells: readonly TrajectoryCell[]): string | undefined {
  const times: number[] = [];
  for (const cell of cells) {
    if (cell.startedAtMilliseconds === null) continue;
    times.push(cell.startedAtMilliseconds);
    if (cell.durationMilliseconds !== null) {
      times.push(cell.startedAtMilliseconds + cell.durationMilliseconds);
    }
  }
  const parts: string[] = [];
  if (times.length >= 2) {
    parts.push(formatTrajectoryDuration(Math.max(...times) - Math.min(...times)));
  } else if (times.length === 1) {
    const duration = cells.find((cell) => cell.startedAtMilliseconds === times[0])?.durationMilliseconds;
    if (duration !== null && duration !== undefined) parts.push(formatTrajectoryDuration(duration));
  }
  const tools = new Map<string, number>();
  for (const cell of cells) {
    if (cell.kind !== "tool" && cell.kind !== "subtool") continue;
    const name = cell.toolName ?? cell.text;
    if (!name) continue;
    tools.set(name, (tools.get(name) ?? 0) + 1);
  }
  for (const [name, count] of tools) parts.push(count > 1 ? `${name}×${count}` : name);
  return parts.length === 0 ? undefined : parts.join(" ");
}

function deriveTurnBoundaries(
  turns: readonly TrajectoryTurn[],
  timeOf: (cell: TrajectoryCell) => number
): readonly TrajectoryTimelineTurnBoundary[] {
  return turns
    .flatMap((turn) => {
      const first = turn.cells.find((cell) => cell.requestOnly !== true);
      if (first === undefined) return [];
      return [{ turn: turn.turn, time: timeOf(first) }];
    })
    .filter(
      (boundary, index, all) =>
        index === 0 || boundary.time > all[index - 1].time || boundary.turn !== all[index - 1].turn
    );
}

function timelineLane(kind: TrajectoryCellKind): TrajectoryTimelineLane {
  if (kind === "tool" || kind === "subtool") return 2;
  if (kind === "assistant" || kind === "compacted") return 1;
  return 0;
}

function extractTraceRecords(value: unknown): {
  records: AgentTraceSnapshot[];
  title?: string;
} {
  if (Array.isArray(value)) {
    return { records: value.filter(isTraceSnapshot) };
  }
  if (!isRecord(value)) {
    throw new TrajectoryParseError("Trace 必须是对象或数组");
  }
  const title = typeof value.title === "string" ? value.title : undefined;
  if (isTraceSnapshot(value)) return { records: [value], title };
  for (const key of ["records", "traces", "snapshots"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      const records = candidate.filter(isTraceSnapshot);
      if (records.length > 0) return { records, title };
    }
  }
  if (isRecord(value.trace) && isTraceSnapshot(value.trace)) {
    return { records: [value.trace], title };
  }
  throw new TrajectoryParseError(
    "不是可识别的 Agent Trace：需要 schemaVersion=1、interactionId、startedAt 和 agentEvents"
  );
}

function isTraceSnapshot(value: unknown): value is AgentTraceSnapshot {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.interactionId === "string" &&
    typeof value.startedAt === "string" &&
    Array.isArray(value.agentEvents) &&
    (value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed" ||
      value.status === "cancelled" ||
      value.status === "asr-rejected")
  );
}

function readCompaction(value: unknown) {
  try {
    return parseContextCompaction(value);
  } catch {
    return undefined;
  }
}

/** Old exports have request snapshots only. Replay explicit replacements, never match content. */
function createLegacyContextSlots(events: readonly RecordObject[]) {
  const replacements = new Map<string, { prefixLength: number; cutIndex: number }>();
  for (const entry of events) {
    const event = entry.event;
    if (!isRecord(event)) continue;
    const completed = event.type === "model_finished" && isRecord(event.step) ? event.step : undefined;
    const step = finiteInteger(completed?.step ?? (event.type === "model_failed" ? event.step : undefined));
    const attempts = completed?.attempts ?? event.attempts;
    if (step === null || !Array.isArray(attempts)) continue;
    for (const attempt of attempts.filter(isRecord)) {
      const number = finiteInteger(attempt.attempt);
      const replacement = readCompaction(attempt.contextCompaction)?.replacement;
      if (number !== null && replacement) replacements.set(requestKey(step, number), replacement);
    }
  }
  let previous: string | undefined;
  let serial = 0;
  let slots: string[] = [];
  const applied = new Set<string>();
  return (key: string, count: number): readonly string[] => {
    const replacement =
      previous === undefined || previous === key || applied.has(previous) ? undefined : replacements.get(previous);
    if (replacement) {
      const { prefixLength, cutIndex } = replacement;
      slots = [...slots.slice(0, prefixLength), `summary:${serial++}`, ...slots.slice(prefixLength + cutIndex)];
      applied.add(previous!);
    }
    slots.length = Math.min(slots.length, count);
    while (slots.length < count) slots.push(`message:${serial++}`);
    previous = key;
    return slots;
  };
}

function readUsage(step: RecordObject, attempts: readonly RecordObject[]): TrajectoryTokenUsage | undefined {
  const latest = attempts.at(-1);
  if (latest && "telemetry" in latest) {
    const usage = normalizeModelTelemetry(latest.telemetry)?.usage;
    if (!usage) return undefined;
    if (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.cachedInputTokens === undefined)
      return undefined;
    // ASAP input includes cached tokens; DSH adds the cache bucket back for its total.
    return {
      ...(usage.inputTokens === undefined ? {} : { input: usage.inputTokens - (usage.cachedInputTokens ?? 0) }),
      ...(usage.cachedInputTokens === undefined ? {} : { cacheRead: usage.cachedInputTokens }),
      ...(usage.outputTokens === undefined ? {} : { output: usage.outputTokens })
    };
  }
  const candidates: unknown[] = [
    step.usage,
    ...attempts.flatMap((attempt) => [attempt.usage, isRecord(attempt.debug) ? attempt.debug.usage : undefined])
  ];
  for (const candidate of candidates.reverse()) {
    if (!isRecord(candidate)) continue;
    const input = finiteNumber(candidate.inputTokens);
    const cacheRead = finiteNumber(candidate.cacheReadTokens);
    const cacheWrite = finiteNumber(candidate.cacheWriteTokens);
    const output = finiteNumber(candidate.outputTokens);
    const thinking = finiteNumber(candidate.reasoningTokens);
    const usage: TrajectoryTokenUsage = {
      ...(input === null ? {} : { input }),
      ...(cacheRead === null ? {} : { cacheRead }),
      ...(cacheWrite === null ? {} : { cacheWrite }),
      ...(output === null ? {} : { output }),
      ...(thinking === null ? {} : { thinking })
    };
    if (Object.keys(usage).length > 0) return usage;
  }
  return undefined;
}

function traceStatus(record: AgentTraceSnapshot): TrajectoryCellStatus {
  if (record.status === "running") return "running";
  if (record.status === "completed") return "completed";
  return "failed";
}

function aggregateStatus(turns: readonly TrajectoryTurn[]): TrajectoryCellStatus {
  if (turns.some((turn) => turn.status === "failed")) return "failed";
  if (turns.some((turn) => turn.status === "running")) return "running";
  return "completed";
}

function numberRequests(drafts: readonly RequestDraft[]): readonly TrajectoryRequest[] {
  const ordered = [...drafts].sort((left, right) => {
    if (left.startedAtMilliseconds === null || right.startedAtMilliseconds === null) {
      return left.turn - right.turn || left.step - right.step;
    }
    return left.startedAtMilliseconds - right.startedAtMilliseconds || left.turn - right.turn || left.step - right.step;
  });
  let cumulativeUsage: TrajectoryTokenUsage | undefined;
  return ordered.map((request, offset) => {
    cumulativeUsage = addUsage(cumulativeUsage, request.usage);
    return {
      ...request,
      number: offset + 1,
      ...(cumulativeUsage === undefined ? {} : { cumulativeUsage })
    };
  });
}

function addUsage(
  total: TrajectoryTokenUsage | undefined,
  usage: TrajectoryTokenUsage | undefined
): TrajectoryTokenUsage | undefined {
  if (usage === undefined) return total;
  return {
    ...(total?.input === undefined && usage.input === undefined
      ? {}
      : { input: (total?.input ?? 0) + (usage.input ?? 0) }),
    ...(total?.cacheRead === undefined && usage.cacheRead === undefined
      ? {}
      : { cacheRead: (total?.cacheRead ?? 0) + (usage.cacheRead ?? 0) }),
    ...(total?.cacheWrite === undefined && usage.cacheWrite === undefined
      ? {}
      : { cacheWrite: (total?.cacheWrite ?? 0) + (usage.cacheWrite ?? 0) }),
    ...(total?.output === undefined && usage.output === undefined
      ? {}
      : { output: (total?.output ?? 0) + (usage.output ?? 0) }),
    ...(total?.thinking === undefined && usage.thinking === undefined
      ? {}
      : { thinking: (total?.thinking ?? 0) + (usage.thinking ?? 0) })
  };
}

function searchTextOf(...values: unknown[]): string {
  return values
    .flatMap((value) => {
      if (value === undefined || value === null) return [];
      if (typeof value === "string") return [value];
      if (typeof value === "number" || typeof value === "boolean") return [String(value)];
      return [stringifyCompact(value)];
    })
    .join("\n");
}

function findFirstRequestMessages(events: readonly RecordObject[]): unknown {
  for (const entry of events) {
    const event = entry.event;
    if (!isRecord(event) || event.type !== "model_request") continue;
    return event.messages;
  }
  return undefined;
}

function findSystemPrompt(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (const message of messages) {
    if (!isRecord(message) || message.role !== "system") continue;
    if (typeof message.content === "string") return message.content;
  }
  return undefined;
}

function findRequestTools(events: readonly RecordObject[]): readonly TrajectoryToolDefinition[] | undefined {
  const starts = new Map<number, readonly TrajectoryToolDefinition[] | undefined>();
  for (const entry of events) {
    const event = entry.event;
    if (!isRecord(event) || (event.type !== "model_started" && event.type !== "model_request")) continue;
    const step = finiteInteger(event.step);
    if (step === null) continue;
    if (event.type === "model_request") return readToolDefinitions(event) ?? starts.get(step);
    starts.set(step, readToolDefinitions(event));
  }
  return undefined;
}

function readToolDefinitions(value: RecordObject): readonly TrajectoryToolDefinition[] | undefined {
  const source = Array.isArray(value.tools)
    ? value.tools
    : Array.isArray(value.toolDefinitions)
      ? value.toolDefinitions
      : undefined;
  if (source === undefined) return undefined;
  const tools = source.flatMap((entry): TrajectoryToolDefinition[] => {
    if (!isRecord(entry)) return [];
    const definition = isRecord(entry.function) ? entry.function : entry;
    const name = typeof definition.name === "string" ? definition.name : undefined;
    if (name === undefined || name === "") return [];
    return [
      {
        name,
        ...(typeof definition.description === "string" ? { description: definition.description } : {}),
        ...(definition.parameters === undefined ? {} : { parameters: definition.parameters }),
        ...(typeof definition.strict === "boolean" ? { strict: definition.strict } : {})
      }
    ];
  });
  // availableApiNames belongs to the script runtime, not the model's tool catalog.
  return tools;
}

function readMessageSourceBlocks(message: unknown): readonly TrajectorySourceBlock[] | undefined {
  if (!isRecord(message) || typeof message.role !== "string") return undefined;
  const role = message.role;
  if (role === "tool") {
    const callId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
    const content = typeof message.content === "string" ? message.content : stringifyCompact(message.content);
    return [
      {
        type: "tool-result",
        content,
        role,
        ...(callId === undefined ? {} : { callId })
      }
    ];
  }
  const content =
    typeof message.content === "string"
      ? [{ type: "text", content: message.content }]
      : Array.isArray(message.content)
        ? message.content.flatMap((block): TrajectorySourceBlock[] => {
            if (!isRecord(block)) return [];
            const type = typeof block.type === "string" ? block.type : "unknown";
            if (type === "image" || type === "image_url") {
              const image = isRecord(block.image) ? block.image : undefined;
              const imageUrl = isRecord(block.image_url) ? block.image_url : undefined;
              const dataUrl =
                typeof image?.dataUrl === "string"
                  ? image.dataUrl
                  : typeof imageUrl?.url === "string"
                    ? imageUrl.url
                    : undefined;
              return [
                {
                  type: "image",
                  content: stringifyCompact(block),
                  role,
                  ...(dataUrl === undefined
                    ? {}
                    : {
                        attachment: {
                          ...(dataUrl.startsWith("data:image/") ? { dataUrl } : {}),
                          ...(typeof image?.width === "number" ? { width: image.width } : {}),
                          ...(typeof image?.height === "number" ? { height: image.height } : {})
                        }
                      })
                }
              ];
            }
            if (type === "file") {
              const file = isRecord(block.file) ? block.file : block;
              return [
                {
                  type: "file",
                  content: stringifyCompact(block),
                  role,
                  file: {
                    ...(typeof file.name === "string" ? { name: file.name } : {}),
                    ...(typeof file.mediaType === "string" ? { mediaType: file.mediaType } : {}),
                    ...(typeof file.bytes === "number" ? { bytes: file.bytes } : {})
                  }
                }
              ];
            }
            const text =
              typeof block.text === "string"
                ? block.text
                : typeof block.content === "string"
                  ? block.content
                  : stringifyCompact(block);
            return [{ type, content: text, role }];
          })
        : [];
  const toolCalls = Array.isArray(message.toolCalls)
    ? message.toolCalls.flatMap((call): TrajectorySourceBlock[] => {
        if (!isRecord(call) || !isRecord(call.function)) return [];
        return [
          {
            type: "tool-call",
            content: typeof call.function.arguments === "string" ? call.function.arguments : "",
            role,
            ...(typeof call.id === "string" ? { callId: call.id } : {}),
            ...(typeof call.function.name === "string" ? { toolName: call.function.name } : {})
          }
        ];
      })
    : [];
  return [
    ...content,
    ...toolCalls,
    ...(role === "user" && isRecord(message.image) ? [{ ...readImageSourceBlock(message.image), role }] : [])
  ];
}

function readImageSourceBlock(image: RecordObject): TrajectorySourceBlock {
  return {
    type: "image",
    content: typeof image.omitted === "string" ? `[image: ${image.omitted}]` : "[image]",
    attachment: {
      ...(typeof image.attachmentId === "string" ? { attachmentId: image.attachmentId } : {}),
      ...(typeof image.omitted === "string" ? { omitted: image.omitted } : {}),
      ...(typeof image.dataUrl === "string" ? { dataUrl: image.dataUrl } : {}),
      ...(typeof image.width === "number" ? { width: image.width } : {}),
      ...(typeof image.height === "number" ? { height: image.height } : {})
    }
  };
}

function readRequestSourceBlocks(messages: unknown): readonly TrajectorySourceBlock[] | undefined {
  if (!Array.isArray(messages)) return undefined;
  const blocks = messages.flatMap((message): readonly TrajectorySourceBlock[] => {
    if (!isRecord(message) || message.role === "system") return [];
    return readMessageSourceBlocks(message) ?? [];
  });
  return blocks.length === 0 ? undefined : [...blocks];
}

function readAssistantSourceBlocks(
  stepRecord: RecordObject,
  attempts: readonly RecordObject[],
  thinking: string | undefined,
  output: string | undefined
): readonly TrajectorySourceBlock[] | undefined {
  const blocks: TrajectorySourceBlock[] = [];
  if (thinking !== undefined) blocks.push({ type: "reasoning", content: thinking });
  if (output !== undefined && output !== "") blocks.push({ type: "text", content: output });
  const selectedAttempt = attempts.at(-1);
  if (selectedAttempt !== undefined) {
    const attempt = selectedAttempt;
    const toolCalls = Array.isArray(attempt.toolCalls) ? attempt.toolCalls.filter(isRecord) : [];
    for (const call of toolCalls) {
      const callFunction = isRecord(call.function) ? call.function : undefined;
      blocks.push({
        type: "tool-call",
        content: typeof callFunction?.arguments === "string" ? callFunction.arguments : "",
        ...(typeof call.id === "string" ? { callId: call.id } : {}),
        ...(typeof callFunction?.name === "string" ? { toolName: callFunction.name } : {})
      });
    }
  }
  const decision = isRecord(stepRecord.decision) ? stepRecord.decision : undefined;
  if (
    decision !== undefined &&
    decision.type === "final" &&
    typeof decision.message === "string" &&
    decision.message !== output
  ) {
    blocks.push({ type: "text", content: decision.message });
  }
  return blocks.length === 0 ? undefined : blocks;
}

function readRequestOptions(event: RecordObject): unknown {
  for (const key of ["options", "requestConfig", "config"]) {
    if (event[key] !== undefined) return event[key];
  }
  return undefined;
}

function readFirstTokenTime(step: RecordObject, attempts: readonly RecordObject[]): number | null {
  const stepTime = finiteNumber(step.firstTokenAtMilliseconds) ?? finiteNumber(step.firstTokenAt);
  if (stepTime !== null) return stepTime;
  for (const attempt of attempts) {
    const value = finiteNumber(attempt.firstTokenAtMilliseconds) ?? finiteNumber(attempt.firstTokenAt);
    if (value !== null) return value;
    const relative = finiteNumber(attempt.firstTokenDurationMilliseconds) ?? finiteNumber(attempt.ttftMilliseconds);
    const startedAt = finiteNumber(attempt.startedAtMilliseconds);
    if (relative !== null && startedAt !== null) return startedAt + relative;
  }
  return null;
}

function sameToolDefinitions(
  left: readonly TrajectoryToolDefinition[] | undefined,
  right: readonly TrajectoryToolDefinition[] | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  return left.every((tool, index) => stringifyCompact(tool) === stringifyCompact(right[index]));
}

function optionalDescription<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: string });
}

function appendDetail(existing: string | undefined, addition: string): string {
  return existing === undefined || existing === "" ? addition : `${existing}\n\n${addition}`;
}

function looksLikeToolPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return false;
  const parsed = parseJson(trimmed);
  if (!isRecord(parsed)) return false;
  return (
    parsed.type === "function" ||
    Array.isArray(parsed.tool_calls) ||
    isRecord(parsed.function) ||
    (typeof parsed.name === "string" && "arguments" in parsed)
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function prettyJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function stringifyCompact(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactText(value: string, maximum = DEFAULT_PREVIEW_CHARACTERS): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, maximum).trimEnd()}…`;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function readNestedString(value: unknown, ...keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

function readTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function sumNumbers(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : numbers.reduce((total, value) => total + value, 0);
}

function minimumNumber(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : Math.min(...numbers);
}

function maximumNumber(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function isRecord(value: unknown): value is RecordObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export type { AgentTraceRecord };
