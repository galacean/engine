import { summarizeFailures } from "./agent-failure-statistics";
import { imageFromDataUrl } from "./image-resources";
import type { AgentEvent, AgentInputSource, AgentViewImage } from "./agent-types";
import type { AgentSessionTask } from "./session-data";
import type { AsrDiagnostics } from "./asr";
import {
  IndexedDbTraceAttachments,
  prepareTraceImage,
  traceImageDataUrl,
  type TraceAttachmentStorage
} from "./trace-attachments";

const DEFAULT_MAX_RECORDS = 20;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const DEFAULT_MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_ATTACHMENTS = 32;

export type AgentTraceImageAttachment = Omit<AgentViewImage, "blob"> & {
  attachmentId: string;
  dataUrl?: string;
  mediaType?: string;
  bytes?: number;
  storageId?: string;
};
type TraceImageReference = {
  attachmentId?: string;
  readonly width: number;
  readonly height: number;
  omitted?: "attachment-budget-exceeded" | "invalid-image" | "attachment-pending" | "attachment-storage-failed";
};

export type AgentTraceError = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
};

export type AgentTraceAsr = {
  readonly startedAt: string;
  readonly tailTuning?: Readonly<{
    minimumMilliseconds: number;
    textSettleMilliseconds: number;
    maximumMilliseconds: number;
  }>;
  readonly startDurationMilliseconds?: number;
  readonly listeningDurationMilliseconds?: number;
  readonly finalizationDurationMilliseconds?: number;
  readonly pointerReleasedAtElapsedMilliseconds?: number;
  readonly stopRequestedAtElapsedMilliseconds?: number;
  readonly endedAtElapsedMilliseconds?: number;
  readonly tailWindowDurationMilliseconds?: number;
  readonly releaseToStopDurationMilliseconds?: number;
  readonly stopToEndDurationMilliseconds?: number;
  readonly textAtPointerRelease?: string;
  readonly textAtStopRequest?: string;
  readonly postReleaseTranscriptCount?: number;
  readonly postStopTranscriptCount?: number;
  readonly finalTextWasFinal?: boolean;
  readonly endReason?: string;
  readonly sessionId?: string;
  readonly interactionEvents?: readonly Readonly<{
    elapsedMilliseconds: number;
    type: string;
    controllerState: string;
    pointerId?: number;
    activePointerId?: number;
    visibilityState?: string;
    fromState?: string;
    toState?: string;
  }>[];
  readonly transcripts: readonly Readonly<{
    elapsedMilliseconds: number;
    text: string;
    seq?: number;
    isFinal?: boolean;
    phase?: "before-release" | "after-release-before-stop" | "after-stop";
  }>[];
  readonly finalText: string;
  readonly diagnostics?: AsrDiagnostics;
  readonly error?: Readonly<{
    code: string;
    message: string;
    fatal: boolean;
  }>;
};

export type AgentTraceEventRecord = {
  readonly elapsedMilliseconds: number;
  readonly event: unknown;
};

/** Lightweight Session identity and input outcomes; no image bytes or host context. */
export type AgentTraceSession = Pick<AgentSessionTask, "id" | "inputId" | "continuedFrom"> & {
  inputs: { id: string; text: string; error?: string }[];
};

export type AgentTraceRecord = {
  readonly diagnostics?: ReturnType<typeof summarizeFailures>;
  readonly schemaVersion: 1;
  readonly interactionId: string;
  readonly taskId?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMilliseconds: number;
  readonly status: "completed" | "failed" | "cancelled" | "asr-rejected";
  readonly input: Readonly<{
    source: AgentInputSource;
    text: string;
    /** Optional original user content blocks, never inferred from model requests. */
    content?: readonly unknown[];
  }>;
  readonly asr?: AgentTraceAsr;
  readonly worldBefore?: unknown;
  readonly session?: AgentTraceSession;
  readonly worldAfter?: unknown;
  readonly agentEvents: readonly AgentTraceEventRecord[];
  readonly attachments?: readonly AgentTraceImageAttachment[];
  readonly error?: AgentTraceError;
};

/** Read-only snapshot of the interaction that is still executing. */
export type ActiveAgentTraceRecord = {
  readonly diagnostics?: ReturnType<typeof summarizeFailures>;
  readonly schemaVersion: 1;
  readonly interactionId: string;
  readonly taskId?: string;
  readonly startedAt: string;
  readonly observedAt: string;
  readonly durationMilliseconds: number;
  readonly status: "running";
  readonly input: Readonly<{
    source: AgentInputSource;
    text: string;
    /** Optional original user content blocks, never inferred from model requests. */
    content?: readonly unknown[];
  }>;
  readonly asr?: AgentTraceAsr;
  readonly worldBefore?: unknown;
  readonly session?: AgentTraceSession;
  readonly agentEvents: readonly AgentTraceEventRecord[];
  readonly attachments?: readonly AgentTraceImageAttachment[];
};

export type AgentTraceSnapshot = AgentTraceRecord | ActiveAgentTraceRecord;

export type AgentTraceStoreOptions = {
  readonly enabled?: boolean;
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  /** Encoded image bytes retained once per interaction, independently of request count. */
  readonly maxAttachmentBytes?: number;
  readonly attachmentStorage?: TraceAttachmentStorage;
  readonly sessionStorageKey?: string;
};

export type AgentTraceStart = {
  readonly input: string;
  readonly inputSource: AgentInputSource;
  readonly asr?: AgentTraceAsr;
  readonly worldBefore?: unknown;
  readonly session?: AgentTraceSession;
};

export type ActiveAgentTraceUpdate = {
  readonly input?: string;
  readonly asr?: AgentTraceAsr;
  readonly worldBefore?: unknown;
  readonly session?: AgentTraceSession;
};

type ActiveAgentTrace = {
  readonly interactionId: string;
  readonly startedAt: string;
  readonly startedAtMilliseconds: number;
  input: string;
  readonly inputSource: AgentInputSource;
  asr?: AgentTraceAsr;
  worldBefore?: unknown;
  session?: AgentTraceSession;
  readonly agentEvents: AgentTraceEventRecord[];
  readonly attachments: AgentTraceImageAttachment[];
  readonly imageReferences: Map<string, TraceImageReference>;
  readonly pendingImages: Map<Blob, TraceImageReference>;
  attachmentBytes: number;
  taskId?: string;
};

export class AgentTraceStore {
  readonly #maxRecords: number;
  readonly #maxBytes: number;
  readonly #maxAttachmentBytes: number;
  readonly #sessionStorageKey?: string;
  readonly #attachmentStorage: TraceAttachmentStorage;
  readonly #pendingImages = new Map<string, Promise<void>>();
  readonly #records: AgentTraceRecord[] = [];
  readonly #listeners = new Set<() => void>();
  #enabled: boolean;
  #active: ActiveAgentTrace | undefined;

  constructor(options: AgentTraceStoreOptions = {}) {
    this.#enabled = options.enabled ?? false;
    this.#maxRecords = requirePositiveInteger(options.maxRecords ?? DEFAULT_MAX_RECORDS, "maxRecords");
    this.#maxBytes = requirePositiveInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes");
    this.#maxAttachmentBytes = requirePositiveInteger(
      options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
      "maxAttachmentBytes"
    );
    this.#sessionStorageKey = options.sessionStorageKey;
    this.#attachmentStorage = options.attachmentStorage ?? new IndexedDbTraceAttachments();
    if (this.#enabled) this.#restore();
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  get size(): number {
    return this.#records.length;
  }

  get running(): boolean {
    return this.#active !== undefined;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    if (enabled) this.#restore();
    else {
      this.#active = undefined;
    }
    this.#notify();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  begin(input: AgentTraceStart): string | undefined {
    if (!this.#enabled) return undefined;
    const interactionId = createInteractionId();
    this.#active = {
      interactionId,
      startedAt: new Date().toISOString(),
      startedAtMilliseconds: performance.now(),
      input: input.input,
      inputSource: input.inputSource,
      asr: clone(input.asr),
      worldBefore: clone(input.worldBefore),
      session: clone(input.session),
      agentEvents: [],
      attachments: [],
      imageReferences: new Map(),
      pendingImages: new Map(),
      attachmentBytes: 0
    };
    this.#notify();
    return interactionId;
  }

  updateActive(interactionId: string | undefined, update: ActiveAgentTraceUpdate): boolean {
    const active = this.#active;
    if (!this.#enabled || !interactionId || !active || active.interactionId !== interactionId) return false;
    if (update.input !== undefined) active.input = update.input;
    if (update.asr !== undefined) active.asr = clone(update.asr);
    if (update.session !== undefined) active.session = clone(update.session);
    if (update.worldBefore !== undefined) active.worldBefore = clone(update.worldBefore);
    this.#notify();
    return true;
  }

  captureAgentEvent(event: AgentEvent): void {
    const active = this.#active;
    if (!this.#enabled || !active) return;
    if (event.type === "task_started") active.taskId = event.taskId;
    active.agentEvents.push({
      elapsedMilliseconds: performance.now() - active.startedAtMilliseconds,
      event: safelyNormalizeAgentEvent(event, (image) => this.#captureImage(active, image))
    });
    this.#notify();
  }

  finish(
    interactionId: string | undefined,
    status: AgentTraceRecord["status"],
    options: Readonly<{ worldAfter?: unknown; error?: unknown }> = {}
  ): AgentTraceRecord | undefined {
    const active = this.#active;
    if (!this.#enabled || !interactionId || !active || active.interactionId !== interactionId) return undefined;
    this.#active = undefined;
    const finishedAtMilliseconds = performance.now();
    const record: AgentTraceRecord = {
      schemaVersion: 1,
      interactionId,
      taskId: active.taskId,
      startedAt: active.startedAt,
      finishedAt: new Date().toISOString(),
      durationMilliseconds: finishedAtMilliseconds - active.startedAtMilliseconds,
      status,
      input: {
        source: active.inputSource,
        text: active.input
      },
      asr: clone(active.asr),
      worldBefore: clone(active.worldBefore),
      session: clone(active.session),
      worldAfter: clone(options.worldAfter),
      // Pending attachment writes update these references; all public snapshots are cloned.
      agentEvents: active.agentEvents,
      diagnostics: summarizeFailures(active.agentEvents, status),
      ...(active.attachments.length || this.#pendingImages.has(interactionId)
        ? { attachments: active.attachments }
        : {}),
      error: options.error === undefined ? undefined : serializeError(options.error)
    };
    this.#append(record);
    return clone(record);
  }

  recordAsrRejection(
    input: Readonly<{ text?: string; asr: AgentTraceAsr; error?: unknown }>
  ): AgentTraceRecord | undefined {
    return this.recordAsrOutcome(input, "asr-rejected");
  }

  /** A parallel voice interaction must never replace the active Agent trace. */
  recordAsrOutcome(
    input: Readonly<{ text?: string; asr: AgentTraceAsr; error?: unknown }>,
    status: "asr-rejected" | "cancelled"
  ): AgentTraceRecord | undefined {
    if (!this.#enabled) return undefined;
    const finishedAt = new Date().toISOString();
    const record: AgentTraceRecord = {
      schemaVersion: 1,
      interactionId: createInteractionId(),
      startedAt: input.asr.startedAt,
      finishedAt,
      durationMilliseconds: Math.max(0, Date.parse(finishedAt) - Date.parse(input.asr.startedAt)),
      status,
      input: { source: "voice", text: input.text ?? input.asr.finalText },
      asr: clone(input.asr),
      agentEvents: [],
      error: input.error === undefined ? undefined : serializeError(input.error)
    };
    this.#append(record);
    return clone(record);
  }

  getLastTrace(): AgentTraceRecord | undefined {
    return clone(this.#records.at(-1));
  }

  getTraces(): AgentTraceRecord[] {
    return clone(this.#records) ?? [];
  }

  getCurrentTrace(): AgentTraceSnapshot | undefined {
    const active = this.#active;
    if (!active) return this.getLastTrace();
    const observedAtMilliseconds = performance.now();
    return {
      schemaVersion: 1,
      interactionId: active.interactionId,
      taskId: active.taskId,
      startedAt: active.startedAt,
      observedAt: new Date().toISOString(),
      durationMilliseconds: observedAtMilliseconds - active.startedAtMilliseconds,
      status: "running",
      input: {
        source: active.inputSource,
        text: active.input
      },
      asr: clone(active.asr),
      worldBefore: clone(active.worldBefore),
      session: clone(active.session),
      agentEvents: clone(active.agentEvents) ?? [],
      diagnostics: summarizeFailures(active.agentEvents),
      ...(active.attachments.length ? { attachments: clone(active.attachments) } : {})
    };
  }

  exportLastTrace(): Promise<string | undefined> {
    const trace = this.#records.at(-1);
    return this.#exportTrace(trace?.interactionId);
  }

  exportCurrentTrace(): Promise<string | undefined> {
    return this.#exportTrace(this.#active?.interactionId ?? this.#records.at(-1)?.interactionId);
  }

  async #exportTrace(interactionId: string | undefined): Promise<string | undefined> {
    if (!interactionId) return undefined;
    // Capture the identity, not "latest", across asynchronous disk I/O.
    while (this.#pendingImages.has(interactionId)) await this.#pendingImages.get(interactionId);
    const trace =
      this.#active?.interactionId === interactionId
        ? this.getCurrentTrace()
        : clone(this.#records.find((record) => record.interactionId === interactionId));
    if (!trace) throw new Error("Trace was cleared or evicted during export");
    for (const attachment of trace.attachments ?? []) {
      if (!attachment.dataUrl)
        attachment.dataUrl = await traceImageDataUrl(
          await this.#attachmentStorage.read(attachment.storageId ?? attachment.attachmentId)
        );
    }
    return JSON.stringify({ ...trace, diagnostics: summarizeFailures(trace.agentEvents, trace.status) }, null, 2);
  }

  clear(): void {
    // This tab owns its history, not the immutable attachments shared by other tabs.
    this.#records.length = 0;
    this.#active = undefined;
    this.#persist();
    this.#notify();
  }

  #captureImage(active: ActiveAgentTrace, image: AgentViewImage): TraceImageReference {
    const dimensions = { width: image.width, height: image.height };
    if (
      !(image.blob instanceof Blob) ||
      image.blob.size > DEFAULT_MAX_ATTACHMENT_BYTES ||
      !/^image\/(?:png|jpeg)$/.test(image.blob.type) ||
      !Number.isSafeInteger(image.width) ||
      image.width <= 0 ||
      !Number.isSafeInteger(image.height) ||
      image.height <= 0
    ) {
      return { ...dimensions, omitted: "invalid-image" };
    }
    const key = image.blob;
    const previous = active.pendingImages.get(key);
    if (previous) return previous;
    const reference: TraceImageReference = { ...dimensions, omitted: "attachment-pending" };
    active.pendingImages.set(key, reference);
    this.#queueImages(active.interactionId, async () => {
      try {
        const { metadata, data } = await prepareTraceImage(image);
        const known = active.imageReferences.get(metadata.attachmentId);
        if (known) {
          Object.assign(reference, known);
          delete reference.omitted;
          return;
        }
        if (
          active.attachmentBytes + image.blob.size > this.#maxAttachmentBytes ||
          active.attachments.length >= MAX_IMAGE_ATTACHMENTS
        ) {
          reference.omitted = "attachment-budget-exceeded";
          return;
        }
        await this.#attachmentStorage.save(metadata, data);
        reference.attachmentId = metadata.attachmentId;
        delete reference.omitted;
        active.attachments.push(metadata);
        active.imageReferences.set(metadata.attachmentId, reference);
        active.attachmentBytes += image.blob.size;
      } catch {
        reference.omitted = "attachment-storage-failed";
      } finally {
        // Blob references are only kept while the write is in flight, never as cache keys.
        active.pendingImages.delete(key);
      }
    });
    return reference;
  }

  #queueImages(interactionId: string, work: () => Promise<void>): void {
    const pending = (this.#pendingImages.get(interactionId) ?? Promise.resolve()).then(work).finally(() => {
      if (this.#pendingImages.get(interactionId) === pending) this.#pendingImages.delete(interactionId);
      this.#persist();
      this.#notify();
    });
    this.#pendingImages.set(interactionId, pending);
  }

  #append(record: AgentTraceRecord): void {
    this.#records.push(record);
    while (this.#records.length > this.#maxRecords) this.#records.shift();
    while (this.#records.length > 1 && byteLengthOf(this.#records) > this.#maxBytes) this.#records.shift();
    this.#persist();
    this.#notify();
  }

  #restore(): void {
    const storage = readSessionStorage();
    if (!storage || !this.#sessionStorageKey || this.#records.length > 0) return;
    try {
      const serialized = storage.getItem(this.#sessionStorageKey);
      if (!serialized) return;
      const records = JSON.parse(serialized) as unknown;
      if (!Array.isArray(records)) return;
      for (const record of records) {
        if (isTraceRecord(record)) {
          this.#records.push(record);
          for (const image of record.attachments ?? []) {
            if (!image.dataUrl) continue;
            this.#queueImages(record.interactionId, async () => {
              try {
                const { metadata, data } = await prepareTraceImage(
                  imageFromDataUrl(image.dataUrl!, image.width, image.height)
                );
                await this.#attachmentStorage.save(metadata, data);
                Object.assign(image, {
                  storageId: metadata.attachmentId,
                  mediaType: metadata.mediaType,
                  bytes: metadata.bytes
                });
                delete image.dataUrl;
              } catch {
                /* Keep legacy bytes until migration succeeds, rather than lose an image. */
              }
            });
          }
        }
      }
      while (this.#records.length > this.#maxRecords) this.#records.shift();
    } catch {
      // Diagnostics must never interfere with the Agent runtime.
    }
  }

  #persist(): void {
    const storage = readSessionStorage();
    if (!storage || !this.#sessionStorageKey) return;
    try {
      if (this.#records.length === 0) storage.removeItem(this.#sessionStorageKey);
      else storage.setItem(this.#sessionStorageKey, JSON.stringify(this.#records));
    } catch {
      // Storage quota and privacy policies must not break a player task.
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // A debug observer must never interfere with the Agent runtime.
      }
    }
  }
}

function normalizeAgentEvent(event: AgentEvent, captureImage: (image: AgentViewImage) => TraceImageReference): unknown {
  if (event.type === "input_attachments") {
    return {
      ...event,
      images: event.images.map((item) => ({ reference: clone(item.reference), image: captureImage(item.image) }))
    };
  }
  if (event.type === "view_observed") {
    return { ...event, metadata: clone(event.metadata), image: captureImage(event.image) };
  }
  if (event.type === "model_request") {
    return {
      ...event,
      messages: event.messages.map((message) =>
        message.role === "user" && message.image ? { ...message, image: captureImage(message.image) } : clone(message)
      )
    };
  }
  if (event.type === "model_finished") {
    return {
      ...clone(event),
      step: {
        ...clone(event.step),
        attempts: omitDuplicatedRequestMessages(event.step.attempts)
      }
    };
  }
  if (event.type === "model_failed") {
    const { error, ...rest } = event;
    return {
      ...clone(rest),
      attempts: omitDuplicatedRequestMessages(event.attempts),
      error: serializeError(error)
    };
  }
  if (event.type === "task_completed") {
    const { result } = event;
    return {
      type: event.type,
      taskId: event.taskId,
      result: {
        taskId: result.taskId,
        input: result.input,
        inputSource: result.inputSource,
        finalMessage: result.finalMessage
      }
    };
  }
  if (event.type === "task_failed") {
    const { failure } = event;
    return {
      type: event.type,
      taskId: event.taskId,
      error: serializeError(event.error),
      failure: {
        taskId: failure.taskId,
        input: failure.input,
        inputSource: failure.inputSource,
        status: failure.status,
        message: failure.message,
        category: failure.category,
        executionSummary: clone(failure.executionSummary),
        executions: clone(failure.result.executions)
      }
    };
  }
  return clone(event);
}

function safelyNormalizeAgentEvent(
  event: AgentEvent,
  captureImage: (image: AgentViewImage) => TraceImageReference
): unknown {
  try {
    return normalizeAgentEvent(event, captureImage);
  } catch (error) {
    return {
      type: "trace_capture_failed",
      sourceEventType: event.type,
      error: serializeError(error)
    };
  }
}

function omitDuplicatedRequestMessages<TAttempt extends { requestMessages?: unknown }>(
  attempts: readonly TAttempt[]
): Array<Omit<TAttempt, "requestMessages">> {
  return attempts.map(({ requestMessages: _requestMessages, ...attempt }) => clone(attempt) ?? attempt);
}

function serializeError(value: unknown): AgentTraceError {
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: value.message || String(value),
      stack: value.stack
    };
  }
  return { name: "Error", message: String(value) };
}

function clone<T>(value: T): T | undefined {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function createInteractionId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    // Older WebViews may expose a partial crypto object.
  }
  return `agent-trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function byteLengthOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function readSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function isTraceRecord(value: unknown): value is AgentTraceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AgentTraceRecord>;
  return record.schemaVersion === 1 && typeof record.interactionId === "string" && typeof record.startedAt === "string";
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
