import { resolveCandyJar, type CandyJarApi } from "./candyjar-bridge";

export type AsrTextPayload = {
  text: string;
  sessionId: string;
  seq?: number;
  isFinal?: boolean;
};

export type AsrError = {
  error: "not-allowed" | "audio-capture" | "no-speech" | "network" | "unsupported" | "engine" | "aborted" | "unknown";
  message?: string;
  fatal?: boolean;
  sessionId: string;
  code?: string;
};

export type AsrStartOptions = {
  lang?: string;
  interim?: boolean;
  continuous?: boolean;
  onText: (payload: AsrTextPayload) => void;
};

export type AsrAvailability =
  | {
      available: true;
      provider: "local-wrapper" | "native";
      implementation?: string;
      protocolVersion: number;
    }
  | {
      available: false;
      reason: string;
      message: string;
    };

export type AsrDiagnosticEvent = {
  readonly elapsedMilliseconds: number;
  readonly type: string;
  readonly detail?: Readonly<Record<string, unknown>>;
};

export type AsrDiagnostics = {
  readonly capturedAt: string;
  readonly runtime: Readonly<{
    href?: string;
    flashAppHtmlUrl?: string;
    userAgent?: string;
    artifactId?: string;
    artifactVersion?: string;
    isSecureContext: boolean;
    isTopLevel: boolean;
    hasCandyJarCall: boolean;
    hasLingguang: boolean;
    hasNativeAsr: boolean;
    hasNativeStart: boolean;
    hasNativeStop: boolean;
    hasNativeAbort: boolean;
    hasCanIUse: boolean;
  }>;
  readonly availability?: AsrAvailability;
  readonly events: readonly AsrDiagnosticEvent[];
};

export type AsrSessionOutcome =
  | {
      status: "completed";
      sessionId: string;
      text: string;
      reason: "stop";
    }
  | {
      status: "aborted";
      sessionId: string;
      text: string;
      reason: "abort";
    }
  | {
      status: "failed";
      sessionId: string;
      text: string;
      reason: "error";
      error: AsrError;
    };

export interface AsrSession {
  readonly id: string;
  readonly ready: Promise<void>;
  readonly done: Promise<AsrSessionOutcome>;
  /** Resolves only after the provider has released the microphone/session resource. */
  readonly released: Promise<void>;
  stop(): Promise<AsrSessionOutcome>;
  abort(): Promise<AsrSessionOutcome>;
}

export interface AsrClient {
  readonly availability: Promise<AsrAvailability>;
  getDiagnostics(): AsrDiagnostics;
  subscribeDiagnostics(listener: (diagnostics: AsrDiagnostics) => void): () => void;
  start(options: AsrStartOptions): AsrSession;
  destroy(): void;
}

type NativeAsrApi = {
  start(options: {
    lang?: string;
    interim?: boolean;
    continuous?: boolean;
    onText: (payload: AsrTextPayload) => void;
    onError?: (error: AsrError) => void;
    onEnd?: (reason: "stop" | "abort" | "error", sessionId: string) => void;
  }): Promise<void>;
  stop(): Promise<void>;
  abort?(): Promise<void>;
};

type AsrWindow = NonNullable<Parameters<typeof resolveCandyJar>[0]> & {
  CandyJar?: CandyJarApi;
  artifactId?: string;
  artifactVersion?: string;
  lingguang?: {
    asr?: NativeAsrApi;
    canIUse?(api: string | { api: string }): Promise<boolean>;
  };
};

type LocalRuntimeInfo = {
  runtime: "asap-local-wrapper";
  protocolVersion: number;
  capabilities: {
    asr: {
      available: boolean;
      implementation?: string;
      reason?: string;
    };
  };
};

type ProviderResolution =
  | { available: true; provider: AsrProvider; availability: Extract<AsrAvailability, { available: true }> }
  | { available: false; availability: Extract<AsrAvailability, { available: false }> };

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
};

type ProviderCallbacks = {
  onText(payload: Omit<AsrTextPayload, "sessionId">): void;
  onError(error: AsrError): void;
};

type ProviderRelease = {
  reason: "stop" | "abort" | "error";
  error?: AsrError;
};

type ProviderSession = {
  readonly started: Promise<void>;
  /** The provider's single authoritative resource-release signal. It never rejects. */
  readonly released: Promise<ProviderRelease>;
  requestStop(): Promise<void>;
  requestAbort(): Promise<void>;
};

type AsrProvider = {
  begin(id: string, options: AsrStartOptions, callbacks: ProviderCallbacks): ProviderSession;
  destroy(): void;
};

type LocalProviderSession = {
  callbacks: ProviderCallbacks;
  released: Deferred<ProviderRelease>;
  seq: number;
};

type ManagedAsrSessionState = "resolving" | "starting" | "listening" | "stopping" | "aborting" | "terminal";
type AsrReadinessState = "pending" | "ready" | "cancelled";
type TimedPromiseResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }
  | { status: "timed-out" };

type AsrResultEvent = Event & {
  detail?: unknown;
  id?: unknown;
  result?: unknown;
  isFinal?: unknown;
  speechState?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
  message?: unknown;
  seq?: unknown;
};

const LOCAL_RUNTIME_PROTOCOL_VERSION = 1;
const LOCAL_RUNTIME_DISCOVERY_TIMEOUT_MILLISECONDS = 1_000;
const ASR_CALL_TIMEOUT_MILLISECONDS = 20_000;
const ASR_FINALIZATION_TIMEOUT_MILLISECONDS = 20_000;
const ASR_ABORT_TIMEOUT_MILLISECONDS = 5_000;
const ASR_EVENT = "CandyJar.ASR.OnResult";
const MAX_ASR_DIAGNOSTIC_EVENTS = 96;
let nextSessionId = 0;

/** Creates one ASR client and binds its runtime provider exactly once. */
export function createAsrClient(hostWindow: AsrWindow = window): AsrClient {
  const diagnostics = new AsrDiagnosticsRecorder(hostWindow);
  return new DefaultAsrClient(resolveProvider(hostWindow, diagnostics), diagnostics);
}

class DefaultAsrClient implements AsrClient {
  readonly availability: Promise<AsrAvailability>;

  private _activeSession: ManagedAsrSession | undefined;
  private _destroyed = false;

  constructor(
    private readonly _providerResolution: Promise<ProviderResolution>,
    private readonly _diagnostics: AsrDiagnosticsRecorder
  ) {
    this.availability = _providerResolution.then((resolution) => {
      this._diagnostics.setAvailability(resolution.availability);
      return resolution.availability;
    });
  }

  getDiagnostics(): AsrDiagnostics {
    return this._diagnostics.snapshot();
  }

  subscribeDiagnostics(listener: (diagnostics: AsrDiagnostics) => void): () => void {
    return this._diagnostics.subscribe(listener);
  }

  start(options: AsrStartOptions): AsrSession {
    if (this._destroyed) throw new Error("ASR client has been destroyed");
    if (this._activeSession) {
      if (this._activeSession.settled) {
        throw createError("ASR_CLEANUP_PENDING", "上一轮语音识别仍在清理，暂时不能开始新会话");
      }
      throw createError("ASR_BUSY", "已有语音识别正在进行");
    }
    const session = new ManagedAsrSession(this._providerResolution, options, this._diagnostics);
    this._diagnostics.record("session.created", { sessionId: session.id });
    this._activeSession = session;
    void session.released.then(() => {
      if (this._activeSession === session) this._activeSession = undefined;
    });
    return session;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const activeSession = this._activeSession;
    this._activeSession = undefined;
    if (activeSession) void activeSession.abort();
    const released = activeSession?.released ?? Promise.resolve();
    void released.then(() => {
      void this._providerResolution.then(
        (resolution) => {
          if (resolution.available) resolution.provider.destroy();
        },
        () => undefined
      );
    });
  }
}

class ManagedAsrSession implements AsrSession {
  readonly id = createSessionId();
  readonly ready: Promise<void>;
  readonly done: Promise<AsrSessionOutcome>;
  readonly released: Promise<void>;

  private readonly _readyDeferred = createDeferred<void>();
  private readonly _doneDeferred = createDeferred<AsrSessionOutcome>();
  private readonly _releasedDeferred = createDeferred<void>();
  private _providerSession: ProviderSession | undefined;
  private _abortFailure: AsrError | undefined;
  private _providerFailure: AsrError | undefined;
  private _text = "";
  private _state: ManagedAsrSessionState = "resolving";
  private _readinessState: AsrReadinessState = "pending";
  private _abortPromise: Promise<AsrSessionOutcome> | undefined;
  private _stopTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  constructor(
    providerResolution: Promise<ProviderResolution>,
    private readonly _options: AsrStartOptions,
    private readonly _diagnostics: AsrDiagnosticsRecorder
  ) {
    this.ready = this._readyDeferred.promise;
    this.done = this._doneDeferred.promise;
    this.released = this._releasedDeferred.promise;
    // `ready` rejecting is an expected result when a session is cancelled before
    // listening. Keep it observable to callers without producing an unhandled
    // rejection for consumers that only wait for `done`.
    void this.ready.catch(() => undefined);
    void this._initialize(providerResolution);
  }

  get settled(): boolean {
    return this._state === "terminal";
  }

  async stop(): Promise<AsrSessionOutcome> {
    this._diagnostics.record("session.stop_requested", { sessionId: this.id, state: this._state });
    if (this._state === "terminal" || this._state === "aborting") return this.done;
    if (this._state !== "stopping") {
      this._state = "stopping";
      this._startFinalizationTimeout();
      if (this._providerSession) this._requestProviderStop(this._providerSession);
    }
    return this.done;
  }

  async abort(): Promise<AsrSessionOutcome> {
    this._diagnostics.record("session.abort_requested", { sessionId: this.id, state: this._state });
    if (this._state === "terminal") return this.done;
    if (this._abortPromise) return this._abortPromise;
    this._state = "aborting";
    const providerSession = this._providerSession;
    if (!providerSession) {
      this._settle({ status: "aborted", sessionId: this.id, text: this._text, reason: "abort" });
      this._markReleased();
      return this.done;
    }
    const abortPromise = this._abortProvider(providerSession);
    this._abortPromise = abortPromise;
    return abortPromise;
  }

  private async _initialize(providerResolution: Promise<ProviderResolution>): Promise<void> {
    let resolution: ProviderResolution;
    try {
      resolution = await providerResolution;
    } catch (error) {
      this._diagnostics.record("session.provider_resolution_failed", {
        sessionId: this.id,
        error: serializeDiagnosticError(error)
      });
      this._fail(normalizeAsrError(error, this.id));
      this._markReleased();
      return;
    }
    if (this._state === "terminal" || this._state === "aborting") return;
    if (resolution.available === false) {
      this._diagnostics.record("session.provider_unavailable", {
        sessionId: this.id,
        reason: resolution.availability.reason
      });
      this._fail({
        error: "unsupported",
        message: resolution.availability.message,
        fatal: true,
        sessionId: this.id,
        code: "ASR_NOT_SUPPORTED"
      });
      this._markReleased();
      return;
    }
    if (this._state === "stopping") {
      this._settle({ status: "aborted", sessionId: this.id, text: this._text, reason: "abort" });
      this._markReleased();
      return;
    }

    // A provider is allowed to report text, failure, or terminal state from inside
    // begin(). Publish the starting state before crossing that re-entrant boundary
    // so a synchronous terminal callback cannot be overwritten afterwards.
    this._state = "starting";
    this._diagnostics.record("session.provider_begin", { sessionId: this.id });
    let providerSession: ProviderSession;
    try {
      providerSession = resolution.provider.begin(this.id, this._options, {
        onText: (payload) => this._handleText(payload),
        onError: (error) => this._handleProviderError(error)
      });
    } catch (error) {
      this._fail(normalizeAsrError(error, this.id));
      this._markReleased();
      return;
    }
    this._providerSession = providerSession;
    void providerSession.released.then(
      (release) => this._handleProviderRelease(release),
      (error) => this._handleProviderReleaseContractFailure(error)
    );
    providerSession.started.then(
      () => {
        if (this._state === "terminal") return;
        this._diagnostics.record("session.ready", { sessionId: this.id, state: this._state });
        this._resolveReady();
        if (this._state === "stopping") {
          this._requestProviderStop(providerSession);
        } else if (this._state !== "aborting") {
          this._state = "listening";
        }
      },
      (error) => this._handleProviderStartFailure(error)
    );
  }

  private _handleText(payload: Omit<AsrTextPayload, "sessionId">): void {
    if (this._state === "terminal" || this._state === "aborting") return;
    this._text = payload.text;
    this._diagnostics.record("session.text", {
      sessionId: this.id,
      length: payload.text.length,
      seq: payload.seq,
      isFinal: payload.isFinal
    });
    this._options.onText({ ...payload, sessionId: this.id });
  }

  private _handleProviderRelease(release: ProviderRelease): void {
    this._diagnostics.record("session.provider_released", {
      sessionId: this.id,
      reason: release.reason,
      error: release.error ? serializeDiagnosticError(release.error) : undefined
    });
    this._markReleased();
    if (this._state === "terminal") return;
    if (this._state === "aborting") {
      const failure = this._abortFailure ?? this._providerFailure ?? release.error;
      if (failure) {
        this._fail(failure, true);
      } else if (release.reason === "error") {
        this._fail(this._createUnexpectedEndError(), true);
      } else {
        this._settle({ status: "aborted", sessionId: this.id, text: this._text, reason: "abort" });
      }
      return;
    }
    if (this._providerFailure || release.error || release.reason === "error") {
      this._fail(this._providerFailure ?? release.error ?? this._createUnexpectedEndError());
      return;
    }
    if (release.reason === "abort") {
      this._settle({ status: "aborted", sessionId: this.id, text: this._text, reason: "abort" });
      return;
    }
    this._settle({ status: "completed", sessionId: this.id, text: this._text, reason: "stop" });
  }

  private _requestProviderStop(providerSession: ProviderSession): void {
    let stopRequest: Promise<void>;
    try {
      stopRequest = providerSession.requestStop();
    } catch (error) {
      this._handleProviderStopFailure(providerSession, error);
      return;
    }
    void stopRequest.catch((error) => this._handleProviderStopFailure(providerSession, error));
  }

  private _startFinalizationTimeout(): void {
    if (this._stopTimeout !== undefined) return;
    this._stopTimeout = globalThis.setTimeout(() => {
      const providerSession = this._providerSession;
      const error: AsrError = {
        error: "engine",
        message: "语音识别超时，请重试。",
        fatal: true,
        sessionId: this.id,
        code: "ASR_FINALIZATION_TIMEOUT"
      };
      if (!providerSession) {
        this._fail(error);
        // Provider resolution has not crossed begin(), so this session never
        // acquired a microphone resource. A late resolution observes the
        // terminal state and cannot acquire one afterwards.
        this._markReleased();
        return;
      }
      this._state = "aborting";
      const abortPromise = this._abortProvider(providerSession, this._providerFailure ?? error);
      this._abortPromise = abortPromise;
    }, ASR_FINALIZATION_TIMEOUT_MILLISECONDS);
  }

  private async _abortProvider(providerSession: ProviderSession, failure?: AsrError): Promise<AsrSessionOutcome> {
    this._abortFailure = failure;
    let abortRequest: Promise<void>;
    try {
      abortRequest = providerSession.requestAbort();
    } catch (error) {
      abortRequest = Promise.reject(error);
    }
    let abortRejection: unknown;
    void abortRequest.catch((error) => {
      abortRejection = error;
    });
    const cleanupResult = await settlePromiseWithTimeout(providerSession.released, ASR_ABORT_TIMEOUT_MILLISECONDS);
    if (this._state === "terminal") return this.done;
    if (cleanupResult.status === "fulfilled") {
      this._handleProviderRelease(cleanupResult.value);
      return this.done;
    }
    if (cleanupResult.status === "rejected" && abortRejection === undefined) abortRejection = cleanupResult.reason;
    const cleanupError = this._createAbortCleanupError(abortRejection);
    this._fail(cleanupError, true);
    return this.done;
  }

  private _handleProviderStartFailure(error: unknown): void {
    if (this._state === "terminal") return;
    this._fail(this._abortFailure ?? normalizeAsrError(error, this.id), this._state === "aborting");
  }

  private _handleProviderReleaseContractFailure(error: unknown): void {
    if (this._state === "terminal") return;
    const normalized = normalizeAsrError(error, this.id);
    this._fail(
      {
        ...normalized,
        error: "engine",
        message: normalized.message ?? "语音识别资源释放信号异常",
        code: "ASR_RELEASE_FAILED"
      },
      this._state === "aborting"
    );
  }

  private _handleProviderError(error: AsrError): void {
    if (this._state === "terminal") return;
    this._diagnostics.record("session.provider_error", {
      sessionId: this.id,
      error: serializeDiagnosticError(error)
    });
    this._providerFailure = normalizeAsrError(error, this.id);
    if (this._state === "aborting") return;
    if (this._state !== "stopping") this._state = "stopping";
    this._startFinalizationTimeout();
  }

  private _handleProviderStopFailure(providerSession: ProviderSession, error: unknown): void {
    if (this._state === "terminal" || this._state === "aborting") return;
    this._state = "aborting";
    const abortPromise = this._abortProvider(providerSession, normalizeAsrError(error, this.id));
    this._abortPromise = abortPromise;
  }

  private _createUnexpectedEndError(): AsrError {
    return {
      error: "unknown",
      message: "语音识别意外结束",
      fatal: true,
      sessionId: this.id,
      code: "ASR_UNEXPECTED_END"
    };
  }

  private _createAbortCleanupError(abortRejection: unknown): AsrError {
    if (abortRejection !== undefined) {
      const normalized = normalizeAsrError(abortRejection, this.id);
      return {
        error: "engine",
        message: normalized.message ?? "语音识别清理失败",
        fatal: true,
        sessionId: this.id,
        code: "ASR_ABORT_FAILED"
      };
    }
    return {
      error: "engine",
      message: "语音识别清理超时",
      fatal: true,
      sessionId: this.id,
      code: "ASR_ABORT_TIMEOUT"
    };
  }

  private _fail(error: AsrError, allowDuringAbort = false): void {
    if (this._state === "terminal" || (this._state === "aborting" && !allowDuringAbort)) return;
    this._rejectReady(error);
    this._settle({ status: "failed", sessionId: this.id, text: this._text, reason: "error", error });
  }

  private _resolveReady(): void {
    if (this._readinessState !== "pending") return;
    this._readinessState = "ready";
    this._readyDeferred.resolve(undefined);
  }

  private _rejectReady(error: AsrError): void {
    if (this._readinessState !== "pending") return;
    this._readinessState = "cancelled";
    this._readyDeferred.reject(error);
  }

  private _settle(outcome: AsrSessionOutcome): void {
    if (this._state === "terminal") return;
    this._diagnostics.record("session.terminal", {
      sessionId: this.id,
      status: outcome.status,
      reason: outcome.reason,
      textLength: outcome.text.length,
      error: outcome.status === "failed" ? serializeDiagnosticError(outcome.error) : undefined
    });
    this._state = "terminal";
    if (this._stopTimeout !== undefined) {
      globalThis.clearTimeout(this._stopTimeout);
      this._stopTimeout = undefined;
    }
    if (this._readinessState === "pending") {
      this._rejectReady(outcome.status === "failed" ? outcome.error : createAsrStartCancelledError(this.id));
    }
    this._doneDeferred.resolve(outcome);
  }

  private _markReleased(): void {
    this._releasedDeferred.resolve(undefined);
  }
}

async function resolveProvider(
  hostWindow: AsrWindow,
  diagnostics: AsrDiagnosticsRecorder
): Promise<ProviderResolution> {
  const candyJar = resolveAvailableCandyJar(hostWindow);
  const nativeAsr = resolveNativeAsr(hostWindow.lingguang?.asr);
  diagnostics.record("provider.resolution_started", {
    hasCandyJar: Boolean(candyJar),
    hasNativeAsr: Boolean(nativeAsr)
  });
  const localRuntimePromise = candyJar ? queryLocalRuntimeInfo(candyJar) : Promise.resolve(undefined);
  const localRuntime = await localRuntimePromise;

  if (localRuntime) {
    const capability = localRuntime.capabilities.asr;
    diagnostics.record("provider.local_runtime_detected", {
      protocolVersion: localRuntime.protocolVersion,
      available: capability.available,
      implementation: capability.implementation,
      reason: capability.reason
    });
    if (!capability.available || !candyJar) {
      return {
        available: false,
        availability: {
          available: false,
          reason: capability.reason ?? "unsupported",
          message: "暂不支持语音"
        }
      };
    }
    return {
      available: true,
      provider: createLocalWrapperProvider(hostWindow, candyJar, diagnostics),
      availability: {
        available: true,
        provider: "local-wrapper",
        implementation: capability.implementation,
        protocolVersion: localRuntime.protocolVersion
      }
    };
  }

  if (nativeAsr) {
    diagnostics.record("provider.native_selected");
    return {
      available: true,
      provider: createNativeProvider(nativeAsr, diagnostics),
      availability: { available: true, provider: "native", protocolVersion: 1 }
    };
  }

  diagnostics.record("provider.unavailable", {
    reason: "documented-native-contract-missing"
  });
  return {
    available: false,
    availability: { available: false, reason: "unsupported", message: "暂不支持语音" }
  };
}

function resolveNativeAsr(value: NativeAsrApi | undefined): NativeAsrApi | undefined {
  if (!value || typeof value.start !== "function" || typeof value.stop !== "function") return undefined;
  return value;
}

function resolveAvailableCandyJar(hostWindow: AsrWindow): CandyJarApi | undefined {
  if (typeof hostWindow.CandyJar?.call === "function") return resolveCandyJar(hostWindow);
  if (!hostWindow.parent || hostWindow.parent === hostWindow) return undefined;
  return resolveCandyJar(hostWindow);
}

function queryLocalRuntimeInfo(candyJar: CandyJarApi): Promise<LocalRuntimeInfo | undefined> {
  return new Promise((resolve) => {
    candyJar.call(
      "Env",
      "getRuntimeInfo",
      {},
      (result) => resolve(normalizeLocalRuntimeInfo(result)),
      () => resolve(undefined),
      LOCAL_RUNTIME_DISCOVERY_TIMEOUT_MILLISECONDS
    );
  });
}

function normalizeLocalRuntimeInfo(value: unknown): LocalRuntimeInfo | undefined {
  if (!isRecord(value) || value.runtime !== "asap-local-wrapper") return undefined;
  if (value.protocolVersion !== LOCAL_RUNTIME_PROTOCOL_VERSION || !isRecord(value.capabilities)) return undefined;
  const asr = value.capabilities.asr;
  if (!isRecord(asr) || typeof asr.available !== "boolean") return undefined;
  return {
    runtime: "asap-local-wrapper",
    protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
    capabilities: {
      asr: {
        available: asr.available,
        implementation: readOptionalString(asr.implementation),
        reason: readOptionalString(asr.reason)
      }
    }
  };
}

function createNativeProvider(nativeAsr: NativeAsrApi, diagnostics: AsrDiagnosticsRecorder): AsrProvider {
  return {
    begin(_id, options, callbacks) {
      diagnostics.record("native.start_invoked", { sessionId: _id });
      const released = createDeferred<ProviderRelease>();
      let releasePublished = false;
      const publishRelease = (reason: ProviderRelease["reason"], error?: AsrError) => {
        if (releasePublished) return;
        releasePublished = true;
        released.resolve({ reason, error });
      };
      let startCall: Promise<void>;
      try {
        startCall = nativeAsr.start({
          ...options,
          onText: ({ text, seq, isFinal }) => callbacks.onText({ text, seq, isFinal }),
          onError: (error) => {
            diagnostics.record("native.on_error", {
              sessionId: _id,
              error: serializeDiagnosticError(error)
            });
            callbacks.onError(error);
          },
          onEnd: (reason) => {
            diagnostics.record("native.on_end", { sessionId: _id, reason });
            publishRelease(reason);
          }
        });
      } catch (error) {
        const normalized = normalizeAsrError(error, _id);
        publishRelease("error", normalized);
        return {
          started: Promise.reject(error),
          released: released.promise,
          requestStop: () => nativeAsr.stop(),
          requestAbort: () => (nativeAsr.abort ? nativeAsr.abort() : nativeAsr.stop())
        };
      }
      // The production shell may keep start() pending for the full recognition session.
      // Invocation is therefore the start boundary; terminal state belongs to onEnd/done.
      void Promise.resolve(startCall).then(
        () => diagnostics.record("native.start_resolved", { sessionId: _id }),
        (error) => {
          diagnostics.record("native.start_rejected", {
            sessionId: _id,
            error: serializeDiagnosticError(error)
          });
          const normalized = normalizeAsrError(error, _id);
          callbacks.onError(normalized);
          publishRelease("error", normalized);
        }
      );
      return {
        started: Promise.resolve(),
        released: released.promise,
        requestStop: () => {
          diagnostics.record("native.stop_invoked", { sessionId: _id });
          return nativeAsr.stop();
        },
        requestAbort: () => {
          diagnostics.record("native.abort_invoked", {
            sessionId: _id,
            fallbackToStop: !nativeAsr.abort
          });
          if (!nativeAsr.abort) return nativeAsr.stop();
          return nativeAsr.abort().then(() => {
            // The deployed public bridge removes this session's callbacks after
            // a successful abort, so no later onEnd("abort") can reach us.
            // Its abort Promise is therefore the authoritative native release
            // boundary; rejection still leaves the session quarantined.
            diagnostics.record("native.abort_resolved", { sessionId: _id });
            publishRelease("abort");
          });
        }
      };
    },
    destroy() {}
  };
}

function createLocalWrapperProvider(
  hostWindow: AsrWindow,
  candyJar: CandyJarApi,
  diagnostics: AsrDiagnosticsRecorder
): AsrProvider {
  const sessions = new Map<string, LocalProviderSession>();
  const publishRelease = (id: string, session: LocalProviderSession, release: ProviderRelease) => {
    sessions.delete(id);
    session.released.resolve(release);
  };
  const onResult = (event: Event) => {
    const payload = readAsrEvent(event as AsrResultEvent);
    const id = readOptionalString(payload.id);
    if (!id) return;
    const session = sessions.get(id);
    if (!session) return;
    diagnostics.record("local.result_event", {
      sessionId: id,
      speechState: payload.speechState,
      errorCode: payload.errorCode,
      isFinal: payload.isFinal,
      textLength: typeof payload.result === "string" ? payload.result.length : undefined,
      seq: payload.seq
    });
    const errorCode = String(payload.errorCode ?? "0");
    if (errorCode !== "0" && errorCode !== "38") {
      const error = buildAsrError(payload, id, errorCode);
      session.callbacks.onError(error);
      publishRelease(id, session, { reason: "error", error });
      return;
    }
    const terminal = payload.isFinal === true || payload.speechState === "cancel" || payload.speechState === "complete";
    if (typeof payload.result === "string") {
      const eventSeq = normalizeSequence(payload.seq);
      if (eventSeq === undefined || eventSeq > session.seq) {
        const seq = eventSeq ?? session.seq + 1;
        session.seq = seq;
        session.callbacks.onText({ text: payload.result, seq, isFinal: payload.isFinal === true });
      }
    }
    if (terminal) {
      publishRelease(id, session, { reason: payload.speechState === "cancel" ? "abort" : "stop" });
    }
  };
  hostWindow.document.addEventListener(ASR_EVENT, onResult);

  return {
    begin(id, options, callbacks) {
      diagnostics.record("local.start_invoked", { sessionId: id });
      if (sessions.size > 0) {
        const error = createError("ASR_BUSY", "已有语音识别正在进行");
        const released = createDeferred<ProviderRelease>();
        released.resolve({ reason: "error", error: normalizeAsrError(error, id) });
        return {
          started: Promise.reject(error),
          released: released.promise,
          requestStop: async () => undefined,
          requestAbort: async () => undefined
        };
      }
      const released = createDeferred<ProviderRelease>();
      const session: LocalProviderSession = { callbacks, released, seq: 0 };
      sessions.set(id, session);
      const started = callCandyJar(candyJar, "startRecognize", {
        id,
        lang: options.lang ?? "zh-CN",
        interim: options.interim ?? true,
        continuous: options.continuous ?? false
      }).catch((error) => {
        publishRelease(id, session, { reason: "error", error: normalizeAsrError(error, id) });
        throw error;
      });
      return {
        started,
        released: released.promise,
        requestStop: () => {
          diagnostics.record("local.stop_invoked", { sessionId: id });
          return callCandyJar(candyJar, "cancelRecognize", { id });
        },
        requestAbort: async () => {
          diagnostics.record("local.abort_invoked", { sessionId: id });
          await callCandyJar(candyJar, "cancelRecognize", { id, abort: true });
          publishRelease(id, session, { reason: "abort" });
        }
      };
    },
    destroy() {
      sessions.clear();
      hostWindow.document.removeEventListener(ASR_EVENT, onResult);
    }
  };
}

class AsrDiagnosticsRecorder {
  private readonly _capturedAt = new Date().toISOString();
  private readonly _startedAtMilliseconds = performance.now();
  private readonly _events: AsrDiagnosticEvent[] = [];
  private readonly _listeners = new Set<(diagnostics: AsrDiagnostics) => void>();
  private readonly _runtime: AsrDiagnostics["runtime"];
  private _availability: AsrAvailability | undefined;

  constructor(hostWindow: AsrWindow) {
    const lingguang = hostWindow.lingguang;
    const nativeAsr = lingguang?.asr;
    let isTopLevel = true;
    try {
      isTopLevel = !hostWindow.parent || hostWindow.parent === hostWindow;
    } catch {
      isTopLevel = false;
    }
    this._runtime = {
      href: readDiagnosticHref(hostWindow),
      flashAppHtmlUrl: readFlashAppHtmlUrl(hostWindow),
      userAgent: readDiagnosticUserAgent(hostWindow),
      artifactId: readOptionalString(hostWindow.artifactId),
      artifactVersion: readOptionalString(hostWindow.artifactVersion),
      isSecureContext: hostWindow.isSecureContext === true,
      isTopLevel,
      hasCandyJarCall: typeof hostWindow.CandyJar?.call === "function",
      hasLingguang: Boolean(lingguang),
      hasNativeAsr: Boolean(nativeAsr),
      hasNativeStart: typeof nativeAsr?.start === "function",
      hasNativeStop: typeof nativeAsr?.stop === "function",
      hasNativeAbort: typeof nativeAsr?.abort === "function",
      hasCanIUse: typeof lingguang?.canIUse === "function"
    };
    this.record("client.created");
  }

  setAvailability(availability: AsrAvailability): void {
    this._availability = cloneDiagnosticValue(availability);
    this.record("provider.resolved", { ...availability });
  }

  subscribe(listener: (diagnostics: AsrDiagnostics) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  record(type: string, detail?: Record<string, unknown>): void {
    this._events.push({
      elapsedMilliseconds: performance.now() - this._startedAtMilliseconds,
      type,
      detail: detail === undefined ? undefined : removeUndefinedDiagnosticValues(detail)
    });
    if (this._events.length > MAX_ASR_DIAGNOSTIC_EVENTS) this._events.shift();
    this._notify();
  }

  snapshot(): AsrDiagnostics {
    return cloneDiagnosticValue({
      capturedAt: this._capturedAt,
      runtime: this._runtime,
      availability: this._availability,
      events: this._events
    });
  }

  private _notify(): void {
    if (this._listeners.size === 0) return;
    const diagnostics = this.snapshot();
    for (const listener of this._listeners) {
      try {
        listener(diagnostics);
      } catch {
        // Diagnostics observers must never interfere with microphone ownership.
      }
    }
  }
}

function cloneDiagnosticValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readDiagnosticHref(hostWindow: AsrWindow): string | undefined {
  try {
    return readOptionalString(hostWindow.location?.href);
  } catch {
    return undefined;
  }
}

function readFlashAppHtmlUrl(hostWindow: AsrWindow): string | undefined {
  try {
    return readOptionalString(
      hostWindow.document?.querySelector?.('meta[name="flash-app-html-url"]')?.getAttribute("content")
    );
  } catch {
    return undefined;
  }
}

function readDiagnosticUserAgent(hostWindow: AsrWindow): string | undefined {
  try {
    return readOptionalString(hostWindow.navigator?.userAgent);
  } catch {
    return undefined;
  }
}

function serializeDiagnosticError(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    const record = value as Error & { code?: unknown; errorCode?: unknown };
    return removeUndefinedDiagnosticValues({
      name: value.name,
      message: value.message,
      code: record.code,
      errorCode: record.errorCode
    });
  }
  if (isRecord(value)) {
    return removeUndefinedDiagnosticValues({
      error: value.error,
      message: value.message,
      code: value.code,
      errorCode: value.errorCode,
      fatal: value.fatal
    });
  }
  return { value: String(value) };
}

function removeUndefinedDiagnosticValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function callCandyJar(
  candyJar: CandyJarApi,
  action: "startRecognize" | "cancelRecognize",
  params: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    candyJar.call("ASR", action, params, () => resolve(), reject, ASR_CALL_TIMEOUT_MILLISECONDS);
  });
}

function readAsrEvent(event: AsrResultEvent): Record<string, unknown> {
  const detail = isRecord(event.detail) ? event.detail : {};
  return {
    id: event.id ?? detail.id,
    result: event.result ?? detail.result,
    isFinal: normalizeBoolean(event.isFinal ?? detail.isFinal),
    speechState: event.speechState ?? detail.speechState,
    errorCode: event.errorCode ?? detail.errorCode,
    errorMessage: event.errorMessage ?? detail.errorMessage,
    message: event.message ?? detail.message,
    seq: event.seq ?? detail.seq
  };
}

function buildAsrError(payload: Record<string, unknown>, sessionId: string, errorCode: string): AsrError {
  const message = readOptionalString(payload.message) ?? readOptionalString(payload.errorMessage);
  if (errorCode === "40" || errorCode === "NO_SPEECH") {
    return {
      error: "no-speech",
      message: message ?? "未识别到文字",
      fatal: true,
      sessionId,
      code: errorCode
    };
  }
  return {
    error: mapErrorCode(errorCode),
    message: message ?? `识别过程出错（${errorCode}）`,
    fatal: true,
    sessionId,
    code: errorCode
  };
}

function normalizeAsrError(value: unknown, sessionId: string): AsrError {
  if (isAsrError(value)) return { ...value, sessionId };
  const record = isRecord(value) ? value : undefined;
  const code = readOptionalString(record?.errorCode) ?? readOptionalString(record?.code);
  const message =
    readOptionalString(record?.message) ??
    readOptionalString(record?.errorMessage) ??
    (value instanceof Error ? value.message : "语音识别失败");
  return {
    error: code ? mapErrorCode(code) : mapErrorMessage(message),
    message,
    fatal: true,
    sessionId,
    code
  };
}

function mapErrorCode(code: string): AsrError["error"] {
  const errorByCode: Partial<Record<string, AsrError["error"]>> = {
    PERMISSION_REQUIRED: "not-allowed",
    AUDIO_CAPTURE: "audio-capture",
    NO_SPEECH: "no-speech",
    NETWORK: "network",
    ASR_TRANSCRIBE_FAILED: "engine",
    ASR_FINALIZATION_TIMEOUT: "engine",
    ASR_ABORT_FAILED: "engine",
    ASR_ABORT_TIMEOUT: "engine",
    ASR_CLEANUP_PENDING: "engine",
    ASR_RELEASE_FAILED: "engine",
    ASR_UNAVAILABLE: "unsupported",
    ASR_LOCAL_UNAVAILABLE: "unsupported",
    ASR_LOCAL_INSTALL_FAILED: "unsupported",
    ASR_NOT_SUPPORTED: "unsupported"
  };
  return errorByCode[code] ?? "unknown";
}

function mapErrorMessage(message: string): AsrError["error"] {
  const normalized = message.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("权限")) return "not-allowed";
  if (normalized.includes("microphone") || normalized.includes("麦克风") || normalized.includes("设备")) {
    return "audio-capture";
  }
  if (normalized.includes("network") || normalized.includes("网络")) return "network";
  if (normalized.includes("不支持") || normalized.includes("unavailable")) return "unsupported";
  return "unknown";
}

function normalizeSequence(value: unknown): number | undefined {
  const sequence = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "1";
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isAsrError(value: unknown): value is AsrError {
  return isRecord(value) && typeof value.error === "string" && typeof value.sessionId === "string";
}

function createSessionId(): string {
  nextSessionId += 1;
  return `asr_${Date.now()}_${nextSessionId}`;
}

function createError(code: string, message: string): Error & { code: string; errorCode: string } {
  const error = new Error(message) as Error & { code: string; errorCode: string };
  error.code = code;
  error.errorCode = code;
  return error;
}

function createAsrStartCancelledError(sessionId: string): AsrError {
  return {
    error: "aborted",
    message: "语音识别在开始监听前结束",
    fatal: false,
    sessionId,
    code: "ASR_START_CANCELLED"
  };
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resolveWithTimeout<T>(promise: Promise<T>, fallback: T, timeoutMilliseconds: number): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMilliseconds);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(fallback);
      }
    );
  });
}

function settlePromiseWithTimeout<T>(promise: Promise<T>, timeoutMilliseconds: number): Promise<TimedPromiseResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timed-out" });
    }, timeoutMilliseconds);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve({ status: "fulfilled", value });
      },
      (reason) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve({ status: "rejected", reason });
      }
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
