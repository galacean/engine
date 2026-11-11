import * as dat from "dat.gui";
import type { WaterRuntimeControl } from "../native/WaterRuntimeControl";
import type {
  WaterDevelopmentHandle,
  WaterDevelopmentObserver,
  WaterDevelopmentTarget,
  WaterDevelopmentTargetSource
} from "../runtime/body/WaterBodyLoader";
import { getWaterDevToolsDisplayLabel, getWaterDevToolsDisplayOptions } from "./WaterDevToolsLocalization";
import type {
  WaterControlAvailability,
  WaterControlDescriptor,
  WaterControlEffect,
  WaterControlGroup,
  WaterControlOwner,
  WaterControlValue,
  WaterEnumControl,
  WaterTuningSession
} from "./WaterDevToolsTypes";
import { createWaterTuningSession, getActiveWaterRuntimeVariantId } from "./WaterTuningAdapters";

const PANEL_WIDTH = 420;
const AUTO_PLACE_GAP = 8;
const POLL_INTERVAL_MS = 250;
const PANEL_STATE_KEY = "water-devtools:panel-open";
const CONTROL_GROUPS: readonly WaterControlGroup[] = Object.freeze([
  "Body",
  "Surface",
  "Optics",
  "Backend",
  "Authoring (read-only)"
]);

interface DatGuiControllerRuntime {
  readonly domElement: HTMLElement;
  name(name: string): DatGuiControllerRuntime;
  onChange(callback: (value?: unknown) => void): DatGuiControllerRuntime;
  onFinishChange(callback: (value?: unknown) => void): DatGuiControllerRuntime;
  remove(): DatGuiControllerRuntime;
  updateDisplay(): DatGuiControllerRuntime;
}

interface DatGuiRuntime extends dat.GUI {
  readonly domElement: HTMLElement;
  closed: boolean;
  useLocalStorage: boolean;
  close(): void;
  removeFolder(folder: dat.GUI): void;
}

interface WaterControlBinding {
  readonly descriptor: WaterControlDescriptor;
  readonly controller: DatGuiControllerRuntime;
  readonly model: Record<string, WaterControlValue>;
}

interface WaterTargetRecord {
  readonly key: string;
  target: WaterDevelopmentTarget;
  session: WaterTuningSession;
  /** Stable for the session; replaced only by an explicit pending baseline. */
  baseline: ReadonlyMap<string, WaterControlValue>;
}

interface PendingReplacementState {
  readonly baseline: ReadonlyMap<string, WaterControlValue>;
  readonly patches: ReadonlyMap<string, WaterControlValue>;
}

interface QueuedRebind {
  readonly controlId: string;
  readonly value: WaterControlValue;
}

export interface WaterDevToolsFolderHost {
  readonly gui: dat.GUI;
  folder(title: string, open?: boolean): dat.GUI;
  subfolder(parent: dat.GUI, title: string, open?: boolean): dat.GUI;
}

export interface WaterDevToolsCameraOptions {
  /** Display label to stable pose id map shown by the Camera pose selector. */
  readonly poses: Readonly<Record<string, string>>;
  /** Reads the last selected named pose. */
  readPose(): string;
  /** Applies one registered named pose. */
  setPose(pose: string): void | Promise<void>;
}

export interface WaterDevToolsOptions {
  /** Scene-wide authoritative control, independent of body discovery and panel lifetime. */
  readonly runtime?: WaterRuntimeControl;
  /** Presentation mode excludes source replacement, authoring and session replay. */
  readonly mode?: "full" | "presentation";
  readonly loader: WaterDevelopmentTargetSource;
  /** Optional initial visibility for a dedicated tuning showcase; omitted preserves the session preference. */
  readonly initiallyOpen?: boolean;
  /** Optional scene camera poses shown independently from water tuning state. */
  readonly camera?: WaterDevToolsCameraOptions;
  /** Optional transient scene controls that never enter Water baseline, patches, Reset, or JSON export. */
  readonly sceneControls?: readonly WaterControlDescriptor[];
  readonly sceneActions?: readonly {
    readonly group: WaterControlDescriptor["group"];
    readonly label: string;
    readonly run: () => void | Promise<void>;
  }[];
  /** Optional custom host. Omit to use dat.gui's standard top-right placement. */
  readonly host?: HTMLElement;
  /** Optional existing folder tree. Mutually exclusive with `host`. */
  readonly folderHost?: WaterDevToolsFolderHost;
}

export interface WaterDevToolsHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

const mountedPanels = new WeakMap<WaterDevelopmentTargetSource, WaterDevToolsPanel>();
let stylesInstalled = false;

function readControlValue(control: WaterControlDescriptor): WaterControlValue {
  return control.read();
}

function resolveControlOwner(control: WaterControlDescriptor): WaterControlOwner {
  if (control.owner) return control.owner;
  switch (control.group) {
    case "Camera":
    case "Lighting":
      return "scene";
    case "Body":
      return "interaction";
    case "Surface":
      if (control.id.startsWith("surface.appearanceV2.")) return "surface-appearance-v2";
      return "water-look";
    case "Optics":
      return "optical-profile";
    case "Backend":
    case "Session":
      return "runtime";
    case "Lake":
    case "Authoring (read-only)":
      return "authoring";
  }
}

function resolveControlEffect(control: WaterControlDescriptor): WaterControlEffect {
  if (control.effect) return control.effect;
  switch (control.group) {
    case "Surface":
    case "Optics":
      return "visual";
    case "Backend":
    case "Session":
      return "state";
    case "Lake":
    case "Authoring (read-only)":
      return "authoring";
    case "Camera":
    case "Lighting":
    case "Body":
      return "state";
  }
}

function resolveControlAvailability(control: WaterControlDescriptor): WaterControlAvailability {
  return control.availability ?? (control.kind === "readonly" ? "readonly" : "active");
}

function isWritableControl(control: WaterControlDescriptor): boolean {
  const availability = resolveControlAvailability(control);
  return control.kind !== "readonly" && availability !== "readonly" && availability !== "unavailable";
}

function writeControlValue(control: WaterControlDescriptor, value: WaterControlValue): void | Promise<void> {
  switch (control.kind) {
    case "number":
      if (typeof value !== "number") throw new TypeError(`${control.label} expects a number.`);
      return control.write(value);
    case "boolean":
      if (typeof value !== "boolean") throw new TypeError(`${control.label} expects a boolean.`);
      return control.write(value);
    case "color":
      if (typeof value !== "string") throw new TypeError(`${control.label} expects a color string.`);
      return control.write(value);
    case "enum":
      if (typeof value !== "string" && typeof value !== "number") {
        throw new TypeError(`${control.label} expects a selectable value.`);
      }
      return control.write(value);
    case "readonly":
      return;
  }
}

function coerceControlValue(control: WaterControlDescriptor, value: unknown): WaterControlValue {
  switch (control.kind) {
    case "number": {
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) throw new TypeError(`${control.label} expects a finite number.`);
      if (numeric < control.minimum || numeric > control.maximum) {
        throw new RangeError(`${control.label} must be between ${control.minimum} and ${control.maximum}.`);
      }
      return numeric;
    }
    case "boolean":
      return value === true;
    case "color":
      return String(value);
    case "enum": {
      if (typeof value === "string" || typeof value === "number") {
        const matched = Object.values(control.options).find((option) => String(option) === String(value));
        if (matched !== undefined) return matched;
        throw new RangeError(`${control.label} received an unregistered option.`);
      }
      throw new TypeError(`${control.label} expects a selectable value.`);
    }
    case "readonly":
      return control.read();
  }
}

function captureBaseline(session: WaterTuningSession): ReadonlyMap<string, WaterControlValue> {
  const values = new Map<string, WaterControlValue>();
  for (const control of session.controls) {
    if (!isWritableControl(control) || control.sessionScope === "transient") continue;
    values.set(control.id, readControlValue(control));
  }
  return values;
}

function createCameraPoseControl(camera: WaterDevToolsCameraOptions): WaterEnumControl {
  const poseIds = Object.values(camera.poses);
  if (poseIds.length < 2) {
    throw new Error("Water DevTools camera requires at least two named poses.");
  }
  if (new Set(poseIds).size !== poseIds.length) {
    throw new Error("Water DevTools camera pose ids must be unique.");
  }
  const requirePose = (pose: string): string => {
    if (!poseIds.includes(pose)) {
      throw new RangeError(`Water DevTools camera pose '${pose}' is not registered.`);
    }
    return pose;
  };
  requirePose(camera.readPose());
  return Object.freeze({
    kind: "enum",
    id: "camera.pose",
    label: "Camera pose",
    group: "Camera",
    updateMode: "live",
    description: "Switches to a repeatable authored viewpoint without changing water tuning values.",
    sessionScope: "transient",
    options: Object.freeze({ ...camera.poses }),
    read: () => requirePose(camera.readPose()),
    write: (value: string | number) => {
      if (typeof value !== "string") throw new TypeError("Water DevTools camera pose id must be a string.");
      return camera.setPose(requirePose(value));
    }
  });
}

function validateSceneControls(
  controls: readonly WaterControlDescriptor[],
  cameraControl: WaterEnumControl | undefined
): readonly WaterControlDescriptor[] {
  const reservedIds = new Set(["body.selector"]);
  if (cameraControl) reservedIds.add(cameraControl.id);
  const ids = new Set<string>();
  for (const control of controls) {
    if (control.sessionScope !== "transient") {
      throw new Error(`Water DevTools scene control '${control.id}' must use sessionScope='transient'.`);
    }
    if (reservedIds.has(control.id) || ids.has(control.id)) {
      throw new Error(`Water DevTools scene control id '${control.id}' is reserved or duplicated.`);
    }
    ids.add(control.id);
  }
  return Object.freeze([...controls]);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runtimeGui(gui: dat.GUI): DatGuiRuntime {
  return gui as DatGuiRuntime;
}

function runtimeController(controller: object): DatGuiControllerRuntime {
  return controller as DatGuiControllerRuntime;
}

function installStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement("style");
  style.dataset.waterDevtoolsStyle = "";
  style.textContent = `
    .water-devtools {
      max-width: calc(100vw - 16px);
    }

    .water-devtools--standalone {
      z-index: 10020 !important;
    }

    .water-devtools--standalone .close-button {
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    .water-devtools .property-name {
      width: 58%;
    }

    .water-devtools .c {
      width: 42%;
    }

    .water-devtools .cr[data-water-control-id="body.selector"] {
      height: auto;
      min-height: 54px;
    }
    .water-devtools .cr[data-water-control-id="body.selector"] .property-name,
    .water-devtools .cr[data-water-control-id="body.selector"] .c,
    .water-devtools .cr[data-water-control-id="body.selector"] select {
      width: 100%;
      max-width: 100%;
    }

    .water-devtools .cr.water-devtools__readonly {
      opacity: 0.72;
    }

    .water-devtools .cr.water-devtools__runtime-message {
      height: auto;
      min-height: 27px;
    }
    .water-devtools .cr.water-devtools__runtime-message .property-name,
    .water-devtools .cr.water-devtools__runtime-message .c {
      width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 18px;
    }

    .water-devtools .cr.water-devtools__conditional {
      box-shadow: inset 2px 0 0 #ffd180;
    }

    .water-devtools .cr.water-devtools__unavailable {
      box-shadow: inset 2px 0 0 #ff8a80;
      opacity: 0.6;
    }

    .water-devtools .cr[data-water-effect-path] {
      position: relative;
    }

    .water-devtools .cr[data-water-effect-path]:hover,
    .water-devtools .cr[data-water-effect-path]:focus-within {
      height: auto !important;
      min-height: 27px;
    }

    .water-devtools .cr[data-water-effect-path]:hover::after,
    .water-devtools .cr[data-water-effect-path]:focus-within::after {
      box-sizing: border-box;
      clear: both;
      color: #80cbc4;
      content: attr(data-water-effect-path);
      display: block;
      float: left;
      font-size: 9px;
      line-height: 1.25;
      overflow-wrap: anywhere;
      padding: 2px 8px 5px;
      width: 100%;
    }

    .water-devtools .cr.water-devtools__readonly input,
    .water-devtools .cr.water-devtools__readonly select,
    .water-devtools .cr.water-devtools__readonly button {
      cursor: default;
    }

    .water-devtools .cr.water-devtools__busy {
      opacity: 0.58;
      pointer-events: none;
    }

    .water-devtools--standalone[data-status="error"] .close-button {
      color: #ff8a80;
    }

    .water-devtools--standalone[data-status="busy"] .close-button {
      color: #80cbc4;
    }

    .water-devtools--embedded[data-status="error"] > ul > li.title {
      color: #ff8a80;
    }

    .water-devtools--embedded[data-status="busy"] > ul > li.title {
      color: #80cbc4;
    }
  `;
  document.head.append(style);
}

class WaterDevToolsPanel implements WaterDevToolsHandle, WaterDevelopmentObserver {
  private readonly _runtime?: WaterRuntimeControl;
  private _unsubscribeRuntime: () => void = () => undefined;
  private readonly _baselines = new Map<string, ReadonlyMap<string, WaterControlValue>>();
  private _selectedBodyId?: string;
  private readonly _loader: WaterDevelopmentTargetSource;
  private readonly _presentationOnly: boolean;
  private readonly _cameraPoseControl?: WaterEnumControl;
  private readonly _sceneControls: readonly WaterControlDescriptor[];
  private readonly _sceneActions: NonNullable<WaterDevToolsOptions["sceneActions"]>;
  private readonly _host?: HTMLElement;
  private readonly _folderHost?: WaterDevToolsFolderHost;
  private readonly _records = new Map<WaterDevelopmentHandle, WaterTargetRecord>();
  private readonly _bindings = new Map<string, WaterControlBinding>();
  private readonly _folders = new Map<WaterControlGroup, DatGuiRuntime>();
  private readonly _folderOpenStates = new Map<WaterControlGroup, boolean>();
  private readonly _rootControllers: DatGuiControllerRuntime[] = [];
  private readonly _sessionActionControllers: DatGuiControllerRuntime[] = [];
  private readonly _editingControls = new Set<string>();
  private readonly _frameValues = new Map<string, WaterControlValue>();
  private readonly _sessionPatches = new Map<WaterDevelopmentHandle, Map<string, WaterControlValue>>();
  private readonly _pendingReplacements = new Map<WaterDevelopmentHandle, PendingReplacementState>();
  private readonly _replayAfterReplacement = new Map<WaterDevelopmentHandle, ReadonlyMap<string, WaterControlValue>>();
  private readonly _activeRebindHandles = new Set<WaterDevelopmentHandle>();
  private readonly _queuedRebinds = new Map<WaterDevelopmentHandle, QueuedRebind>();
  private readonly _busyCounts = new Map<WaterDevelopmentHandle, number>();
  private _gui!: DatGuiRuntime;
  private _unsubscribe: () => void = () => undefined;
  private _activeKey?: string;
  private _frameRequest?: number;
  private _pollTimer?: number;
  private _autoPlaceObserver?: MutationObserver;
  private _generation = 0;
  private _destroyed = false;
  private _statusModel: Record<string, WaterControlValue> = { status: "Waiting for a water body…" };
  private _statusController?: DatGuiControllerRuntime;

  constructor(options: WaterDevToolsOptions) {
    installStyles();
    this._loader = options.loader;
    this._runtime = options.runtime;
    this._presentationOnly = options.mode === "presentation";
    this._cameraPoseControl = options.camera ? createCameraPoseControl(options.camera) : undefined;
    this._sceneActions = options.sceneActions ?? [];
    this._sceneControls = validateSceneControls(options.sceneControls ?? [], this._cameraPoseControl);
    this._host = options.host;
    this._folderHost = options.folderHost;
    this._createRoot(options.initiallyOpen);
    this._rebuildContents();
    this._unsubscribeRuntime = this._runtime?.observeRuntimeState(() => this._rebuildContents()) ?? (() => undefined);
    this._unsubscribe = this._loader.observeDevelopmentTargets(this);
    window.addEventListener("pointerup", this._handlePointerEnd);
    window.addEventListener("pointercancel", this._handlePointerEnd);
  }

  get element(): HTMLElement {
    return this._gui.domElement;
  }

  attach(target: WaterDevelopmentTarget): void {
    const record = this._createRecord(target);
    this._records.set(target.handle, record);
    const active = this._activeRecord();
    if (
      target.bodyId === this._selectedBodyId ||
      (!this._selectedBodyId && (!active || (!active.target.handle.visible && target.handle.visible)))
    ) {
      this._activeKey = record.key;
    }
    this._rebuildContents();
  }

  replace(previous: WaterDevelopmentTarget, next: WaterDevelopmentTarget): void {
    const previousRecord = this._records.get(previous.handle);
    const pending = this._pendingReplacements.get(previous.handle);
    const nextRecord = this._createRecord(next, previousRecord?.key, pending?.baseline ?? previousRecord?.baseline);
    // Keep the in-flight edit's record identity while replacing all backend closures.
    const record = previousRecord ?? nextRecord;
    if (previousRecord) {
      record.target = nextRecord.target;
      record.session = nextRecord.session;
      if (pending) record.baseline = pending.baseline;
    }
    if (previous.handle !== next.handle) {
      this._records.delete(previous.handle);
      const move = <T>(map: Map<WaterDevelopmentHandle, T>): void => {
        if (map.has(previous.handle)) map.set(next.handle, map.get(previous.handle)!);
        map.delete(previous.handle);
      };
      move(this._sessionPatches);
      move(this._pendingReplacements);
      move(this._replayAfterReplacement);
      move(this._queuedRebinds);
      move(this._busyCounts);
      if (this._activeRebindHandles.delete(previous.handle)) this._activeRebindHandles.add(next.handle);
    }
    this._records.set(next.handle, record);
    if (pending) {
      if (pending.patches.size) this._sessionPatches.set(next.handle, new Map(pending.patches));
      else this._sessionPatches.delete(next.handle);
      this._replayAfterReplacement.set(next.handle, pending.patches);
      this._pendingReplacements.delete(next.handle);
    }
    this._activeKey ??= record.key;
    this._rebuildContents();
  }

  detach(target: WaterDevelopmentTarget): void {
    const record = this._records.get(target.handle);
    if (!record) return;
    this._records.delete(target.handle);
    this._sessionPatches.delete(target.handle);
    this._pendingReplacements.delete(target.handle);
    this._replayAfterReplacement.delete(target.handle);
    this._activeRebindHandles.delete(target.handle);
    this._queuedRebinds.delete(target.handle);
    this._busyCounts.delete(target.handle);
    if (this._activeKey === record.key) {
      this._activeKey = this._defaultRecord()?.key;
    }
    this._rebuildContents();
  }

  reportError(target: WaterDevelopmentTarget, error: unknown): void {
    const active = this._activeRecord();
    if (active?.target.handle !== target.handle) return;
    this._setStatus(`Error: ${formatError(error)}`, "error");
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._unsubscribe();
    this._unsubscribeRuntime();
    this._cancelFrameWrites();
    if (this._pollTimer !== undefined) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
    window.removeEventListener("pointerup", this._handlePointerEnd);
    window.removeEventListener("pointercancel", this._handlePointerEnd);
    this._destroyRoot();
    this._records.clear();
    this._bindings.clear();
    this._folders.clear();
    this._folderOpenStates.clear();
    this._rootControllers.length = 0;
    this._sessionActionControllers.length = 0;
    this._sessionPatches.clear();
    this._pendingReplacements.clear();
    this._replayAfterReplacement.clear();
    this._activeRebindHandles.clear();
    this._queuedRebinds.clear();
    this._busyCounts.clear();
    this._baselines.clear();
    mountedPanels.delete(this._loader);
  }

  private readonly _handlePointerEnd = (): void => {
    const activeElement = document.activeElement;
    for (const controlId of this._editingControls) {
      const binding = this._bindings.get(controlId);
      const keepsTextFocus =
        activeElement instanceof HTMLInputElement &&
        activeElement.type !== "checkbox" &&
        binding?.controller.domElement.contains(activeElement) === true;
      if (!keepsTextFocus) this._editingControls.delete(controlId);
    }
  };

  private readonly _handleRootClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest(".title, .close-button");
    const rootTitle = this._gui.domElement.querySelector(":scope > ul > li.title");
    const rootCloseButton = this._gui.domElement.querySelector(":scope > .close-button");
    if (toggle !== rootTitle && toggle !== rootCloseButton) return;
    queueMicrotask(() => this._syncPanelOpenState());
  };

  private _createRecord(
    target: WaterDevelopmentTarget,
    key?: string,
    baseline?: ReadonlyMap<string, WaterControlValue>
  ): WaterTargetRecord {
    const session = createWaterTuningSession(target, this._presentationOnly ? "presentation" : "full");
    const initial = baseline ?? this._baselines.get(target.bodyId) ?? captureBaseline(session);
    this._baselines.set(target.bodyId, initial);
    return {
      key: key ?? target.bodyId,
      target,
      session,
      baseline: initial
    };
  }

  private _createRoot(initiallyOpen?: boolean): void {
    const shouldOpen = initiallyOpen ?? this._readPanelOpenState();
    const embedded = this._folderHost !== undefined;
    const gui = runtimeGui(
      this._folderHost
        ? this._folderHost.folder("Water System / 水系统", shouldOpen)
        : new dat.GUI({
            name: "Water DevTools",
            width: PANEL_WIDTH,
            autoPlace: this._host === undefined
          })
    );
    if (!embedded) gui.useLocalStorage = false;
    gui.domElement.classList.add(
      "water-devtools",
      embedded ? "water-devtools--embedded" : "water-devtools--standalone"
    );
    gui.domElement.dataset.status = "idle";
    gui.domElement.setAttribute("aria-label", "Water development controls");
    gui.domElement.addEventListener("click", this._handleRootClick);
    if (this._host) this._host.append(gui.domElement);
    if (shouldOpen) gui.open();
    else gui.close();
    this._gui = gui;
    this._bindAutoPlacePosition();
    this._syncPanelOpenState();
  }

  private _destroyRoot(): void {
    this._autoPlaceObserver?.disconnect();
    this._autoPlaceObserver = undefined;
    const element = this._gui.domElement;
    element.removeEventListener("click", this._handleRootClick);
    if (this._folderHost) {
      runtimeGui(this._folderHost.gui).removeFolder(this._gui);
    } else {
      this._gui.destroy();
      element.remove();
    }
    this._folders.clear();
  }

  private _bindAutoPlacePosition(): void {
    if (this._host || this._folderHost) return;
    const parent = this._gui.domElement.parentElement;
    if (!parent) return;
    this._syncAutoPlacePosition();
    this._autoPlaceObserver = new MutationObserver(() => this._syncAutoPlacePosition());
    this._autoPlaceObserver.observe(parent, { childList: true });
  }

  private _syncAutoPlacePosition(): void {
    if (this._host || this._folderHost) return;
    const element = this._gui.domElement;
    const parent = element.parentElement;
    if (!parent) return;
    const siblingWidth = [...parent.children].reduce((maximum, sibling) => {
      if (sibling === element || !(sibling instanceof HTMLElement)) return maximum;
      return Math.max(maximum, sibling.getBoundingClientRect().width);
    }, 0);
    element.style.position = "fixed";
    element.style.top = "0";
    element.style.right = siblingWidth > 0 ? `${siblingWidth + AUTO_PLACE_GAP}px` : "0";
  }

  private _rebuildContents(): void {
    if (this._destroyed) return;
    this._captureFolderOpenStates();
    this._generation++;
    this._cancelFrameWrites();
    this._bindings.clear();
    this._sessionActionControllers.length = 0;
    this._editingControls.clear();
    this._statusController = undefined;
    for (const controller of this._rootControllers.splice(0)) controller.remove();
    for (const folder of this._folders.values()) this._gui.removeFolder(folder);
    this._folders.clear();

    if (this._runtime) {
      const state = this._runtime.runtimeState;
      const model = {
        enabled: state.requestedEnabled,
        state:
          (state.error
            ? `${state.requestedEnabled ? "Enable failed / 启用失败" : "Unload failed / 卸载失败"}: ${state.error}`
            : undefined) ??
          {
            enabled: "Enabled / 已开启",
            enabling: "Loading / 正在加载",
            disabling: "Unloading / 正在卸载",
            disabled: "Unloaded / 已卸载",
            error: "Error / 失败"
          }[state.phase]
      };
      const toggle = runtimeController(
        this._gui
          .add(model, "enabled")
          .name("Water system / 水系统总开关")
          .onChange((value: boolean) => {
            void this._runtime!.setRuntimeEnabled(value).catch((error) => {
              if (!this._destroyed) this._setStatus(`Water: ${formatError(error)}`, "error");
            });
          })
      );
      toggle.domElement.closest<HTMLElement>(".cr")?.setAttribute("data-water-control-id", "system.enabled");
      const status = runtimeController(this._gui.add(model, "state").name("Runtime / 运行状态"));
      status.domElement.closest(".cr")?.setAttribute("title", model.state);
      this._disableController(status);
      this._rootControllers.push(toggle, status);
      if (state.error) {
        this._showRuntimeMessage(status, model.state);
        if (state.residualResources) {
          const residue = runtimeController(
            this._gui.add({ resources: state.residualResources }, "resources").name("Cleanup / 资源清理")
          );
          this._disableController(residue);
          this._showRuntimeMessage(residue, state.residualResources);
          this._rootControllers.push(residue);
        }
      }
      this._gui.domElement.dataset.waterRuntimePhase = state.phase;
      this._gui.domElement.dataset.waterRuntimeRequested = String(state.requestedEnabled);
      this._gui.domElement.dataset.waterRuntimeEffective = String(state.effectiveEnabled);
      if (!state.effectiveEnabled) {
        this._setStatus(model.state, state.phase === "error" ? "error" : state.phase === "disabled" ? "idle" : "busy");
        return;
      }
    }

    const active = this._activeRecord();
    if (this._records.size > 0) this._addBodySelector();
    if (this._cameraPoseControl) {
      const cameraFolder = this._addFolder("Camera");
      this._addControl(cameraFolder, this._cameraPoseControl, (control, value) =>
        this._applyStandaloneControl(control, value)
      );
    }
    const waterControlIds = new Set(active?.session.controls.map(({ id }) => id) ?? []);
    for (const control of this._sceneControls) {
      if (waterControlIds.has(control.id)) {
        throw new Error(`Water DevTools scene control id '${control.id}' conflicts with a Water control.`);
      }
    }
    for (const groupName of [...new Set(this._sceneControls.map(({ group }) => group))]) {
      if (this._folders.has(groupName)) {
        throw new Error(`Water DevTools scene control group '${groupName}' conflicts with another scene group.`);
      }
      const folder = this._addFolder(groupName);
      for (const control of this._sceneControls.filter(({ group }) => group === groupName)) {
        this._addControl(folder, control, (descriptor, value) => this._applyStandaloneControl(descriptor, value));
      }
    }
    for (const action of this._sceneActions) {
      const folder = this._folders.get(action.group) ?? this._addFolder(action.group);
      const model = {
        run: async () => {
          try {
            await action.run();
            this._refreshAllBindings();
            this._setStatus("Ready", "idle");
          } catch (error) {
            this._setStatus(`Error: ${formatError(error)}`, "error");
          }
        }
      };
      const controller = folder.add(model, "run").name(action.label);
      const button = controller.domElement.querySelector<HTMLElement>(".button");
      if (button) {
        button.textContent = action.label;
        button.setAttribute("role", "button");
        button.tabIndex = 0;
        // dat.GUI also forwards row clicks to the function button.
        button.addEventListener("click", (event) => event.stopPropagation());
        button.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            button.click();
          }
        });
        controller.domElement.style.width = "100%";
        const label = controller.domElement.previousElementSibling as HTMLElement | null;
        if (label) label.hidden = true;
      }
    }
    if (!active) {
      delete this._gui.domElement.dataset.waterBodyId;
      delete this._gui.domElement.dataset.waterBackendId;
      this._addRootStatus("Waiting for a water body…");
      return;
    }
    this._gui.domElement.dataset.waterBodyId = active.target.bodyId;
    this._gui.domElement.dataset.waterBackendId = active.target.backendId;

    for (const groupName of CONTROL_GROUPS) {
      const controls = active.session.controls.filter(
        (control) =>
          control.group === groupName &&
          !control.hidden &&
          control.availability !== "unavailable" &&
          !(
            this._presentationOnly &&
            control.kind === "readonly" &&
            (groupName === "Surface" || groupName === "Optics")
          )
      );
      if (controls.length === 0) continue;
      const folder = this._folders.get(groupName) ?? this._addFolder(groupName);
      const sections = new Map<string, dat.GUI>();
      for (const control of controls) {
        let parent: dat.GUI = folder;
        let path = "";
        for (const title of control.section ?? []) {
          path += `/${title}`;
          let section = sections.get(path);
          if (!section) {
            section = this._folderHost ? this._folderHost.subfolder(parent, title, false) : parent.addFolder(title);
            section.close();
            sections.set(path, section);
          }
          parent = section;
        }
        this._addControl(parent, control);
      }
    }
    if (!this._presentationOnly) this._addSessionFolder(active);
    if ((this._busyCounts.get(active.target.handle) ?? 0) > 0) {
      this._setWritableControlsBusy(true);
      this._setStatus("Applying…", "busy");
    } else {
      this._setStatus("Ready", "idle");
    }
  }

  private _showRuntimeMessage(controller: DatGuiControllerRuntime, message: string): void {
    controller.domElement.closest(".cr")?.classList.add("water-devtools__runtime-message");
    const content = controller.domElement.querySelector(".c");
    if (content) content.textContent = message;
  }

  private _captureFolderOpenStates(): void {
    for (const [groupName, folder] of this._folders) {
      this._folderOpenStates.set(groupName, !folder.closed);
    }
  }

  private _addFolder(groupName: WaterControlGroup): DatGuiRuntime {
    const open = this._folderOpenStates.get(groupName) === true;
    const title = getWaterDevToolsDisplayLabel(groupName);
    const folder = runtimeGui(
      this._folderHost ? this._folderHost.subfolder(this._gui, title, open) : this._gui.addFolder(title)
    );
    this._folders.set(groupName, folder);
    if (!this._folderHost) {
      if (open) folder.open();
      else folder.close();
    }
    return folder;
  }

  private _addBodySelector(): void {
    const labels = new Map<string, number>();
    const options: Record<string, string> = {};
    for (const record of this._records.values()) {
      const kind = record.target.bodyKind;
      const baseLabel = `${record.target.bodyId} · ${kind}`;
      const occurrence = (labels.get(baseLabel) ?? 0) + 1;
      labels.set(baseLabel, occurrence);
      options[occurrence === 1 ? baseLabel : `${baseLabel} (${occurrence})`] = record.key;
    }
    const selector: Record<string, WaterControlValue> = {
      body: this._activeKey ?? ""
    };
    const controller = runtimeController(
      this._gui
        .add(selector, "body", options)
        .name(getWaterDevToolsDisplayLabel("Water body"))
        .onChange((value?: unknown) => {
          if (typeof value !== "string" || value === this._activeKey) return;
          this._activeKey = value;
          this._selectedBodyId = value;
          this._rebuildContents();
        })
    );
    this._rootControllers.push(controller);
    const select = controller.domElement.querySelector("select");
    if (select) {
      select.title = [...Object.entries(options)].find(([, key]) => key === selector.body)?.[0] ?? "";
    }
    const row = controller.domElement.closest<HTMLElement>(".cr");
    if (row) {
      row.dataset.waterControlId = "body.selector";
      row.dataset.waterControlKind = "enum";
      row.dataset.waterUpdateMode = "live";
      row.dataset.waterControlOwner = "runtime";
      row.dataset.waterControlEffect = "state";
      row.dataset.waterControlAvailability = "active";
    }
  }

  private _addControl(
    folder: dat.GUI,
    descriptor: WaterControlDescriptor,
    applyControl?: (control: WaterControlDescriptor, value: WaterControlValue) => void | Promise<void>
  ): void {
    const model: Record<string, WaterControlValue> = {
      [descriptor.id]: readControlValue(descriptor)
    };
    let controller: DatGuiControllerRuntime;
    switch (descriptor.kind) {
      case "number":
        controller = runtimeController(
          descriptor.inputOnly
            ? folder.add(model, descriptor.id)
            : folder.add(model, descriptor.id, descriptor.minimum, descriptor.maximum, descriptor.step)
        );
        if (descriptor.inputOnly) {
          // dat.gui's inferred precision truncates display even without an explicit step.
          const updateDisplay = controller.updateDisplay.bind(controller);
          controller.updateDisplay = () => {
            updateDisplay();
            const input = controller.domElement.querySelector("input");
            if (input) input.value = String(model[descriptor.id]);
            return controller;
          };
          controller.updateDisplay();
        }
        break;
      case "boolean":
        controller = runtimeController(folder.add(model, descriptor.id));
        break;
      case "color":
        controller = runtimeController(folder.addColor(model, descriptor.id));
        break;
      case "enum":
        controller = runtimeController(
          folder.add(model, descriptor.id, getWaterDevToolsDisplayOptions(descriptor.options))
        );
        break;
      case "readonly":
        controller = runtimeController(folder.add(model, descriptor.id));
        break;
    }
    const displayLabel = getWaterDevToolsDisplayLabel(descriptor.label);
    controller.name(displayLabel);
    const row = controller.domElement.closest<HTMLElement>(".cr");
    if (row) {
      row.dataset.waterControlId = descriptor.id;
      row.dataset.waterControlKind = descriptor.kind;
      row.dataset.waterUpdateMode = descriptor.updateMode;
    }
    // Availability may change while this binding lives. Keep handlers ready for an editable mode.
    if (descriptor.kind !== "readonly") {
      const commit = (value?: unknown): void => {
        if (!isWritableControl(descriptor)) return;
        try {
          const nextValue = coerceControlValue(descriptor, value);
          if (descriptor.updateMode === "frame" && !applyControl) {
            this._scheduleFrameWrite(descriptor.id, nextValue);
          } else {
            void (applyControl ? applyControl(descriptor, nextValue) : this._applyControl(descriptor, nextValue));
          }
        } catch (error) {
          this._setStatus(`Error: ${formatError(error)}`, "error");
          this._refreshBinding(descriptor.id);
        }
      };
      if (descriptor.updateMode === "commit" || descriptor.updateMode === "replace") {
        controller.onFinishChange(commit);
      } else {
        controller.onChange(commit);
      }
      controller.domElement.addEventListener("pointerdown", () => {
        this._editingControls.add(descriptor.id);
      });
      controller.domElement.addEventListener("focusin", () => {
        this._editingControls.add(descriptor.id);
      });
      controller.domElement.addEventListener("focusout", () => {
        this._editingControls.delete(descriptor.id);
      });
    }
    const binding = Object.freeze({ descriptor, controller, model });
    this._bindings.set(descriptor.id, binding);
    this._syncControlAvailability(binding);
  }

  private async _applyStandaloneControl(control: WaterControlDescriptor, value: WaterControlValue): Promise<void> {
    if (!isWritableControl(control)) return;
    try {
      await writeControlValue(control, value);
      this._refreshAllBindings();
      this._setStatus(this._activeRecord() ? "Ready" : "Waiting for a water body…", "idle");
    } catch (error) {
      this._setStatus(`Error: ${formatError(error)}`, "error");
      this._refreshBinding(control.id);
    }
  }

  private _disableController(controller: DatGuiControllerRuntime): void {
    const row = controller.domElement.closest<HTMLElement>(".cr");
    row?.classList.add("water-devtools__readonly");
    for (const element of controller.domElement.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input, select, button")) {
      element.disabled = true;
      element.tabIndex = -1;
    }
  }

  private _setWritableControlsBusy(busy: boolean): void {
    for (const binding of this._bindings.values()) {
      if (!isWritableControl(binding.descriptor)) continue;
      this._setControllerBusy(binding.controller, busy);
    }
    for (const controller of this._sessionActionControllers) {
      this._setControllerBusy(controller, busy);
    }
  }

  private _setControllerBusy(controller: DatGuiControllerRuntime, busy: boolean): void {
    const row = controller.domElement.closest<HTMLElement>(".cr");
    row?.classList.toggle("water-devtools__busy", busy);
    for (const element of controller.domElement.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input, select, button")) {
      element.disabled = busy;
    }
  }

  private _beginBusy(handle: WaterDevelopmentHandle): void {
    this._busyCounts.set(handle, (this._busyCounts.get(handle) ?? 0) + 1);
    if (this._activeRecord()?.target.handle !== handle) return;
    this._setWritableControlsBusy(true);
  }

  private _endBusy(handle: WaterDevelopmentHandle): void {
    const nextCount = Math.max(0, (this._busyCounts.get(handle) ?? 1) - 1);
    if (nextCount === 0) this._busyCounts.delete(handle);
    else this._busyCounts.set(handle, nextCount);
    if (nextCount === 0 && this._activeRecord()?.target.handle === handle) {
      this._setWritableControlsBusy(false);
    }
  }

  private _addSessionFolder(record: WaterTargetRecord): void {
    const folder = this._addFolder("Session");
    const actions = {
      "Reset to baseline": () => {
        void this._resetToBaseline(record);
      },
      "Copy JSON": () => {
        void this._copyJson(record);
      }
    };
    const resetController = runtimeController(folder.add(actions, "Reset to baseline"));
    const copyController = runtimeController(folder.add(actions, "Copy JSON"));
    resetController.domElement.closest<HTMLElement>(".cr")?.setAttribute("data-water-action", "reset");
    copyController.domElement.closest<HTMLElement>(".cr")?.setAttribute("data-water-action", "copy-json");
    this._sessionActionControllers.push(resetController, copyController);
    this._statusModel = { status: "Ready" };
    this._statusController = runtimeController(folder.add(this._statusModel, "status").name("Status"));
    this._statusController.domElement.closest<HTMLElement>(".cr")?.setAttribute("data-water-status", "");
    this._disableController(this._statusController);
  }

  private _addRootStatus(status: string): void {
    this._statusModel = { status };
    this._statusController = runtimeController(this._gui.add(this._statusModel, "status").name("Status"));
    this._rootControllers.push(this._statusController);
    this._disableController(this._statusController);
    this._setStatus(status, "idle");
  }

  private _scheduleFrameWrite(controlId: string, value: WaterControlValue): void {
    this._frameValues.set(controlId, value);
    if (this._frameRequest !== undefined) return;
    this._frameRequest = window.requestAnimationFrame(() => {
      this._frameRequest = undefined;
      const writes = [...this._frameValues];
      this._frameValues.clear();
      for (const [id, nextValue] of writes) {
        const binding = this._bindings.get(id);
        if (binding) void this._applyControl(binding.descriptor, nextValue);
      }
    });
  }

  private _cancelFrameWrites(): void {
    if (this._frameRequest !== undefined) {
      window.cancelAnimationFrame(this._frameRequest);
      this._frameRequest = undefined;
    }
    this._frameValues.clear();
  }

  private async _applyControl(control: WaterControlDescriptor, value: WaterControlValue): Promise<void> {
    const record = this._activeRecord();
    if (!record) return;
    await this._applyControlForRecord(record, control, value);
  }

  private async _applyControlForRecord(
    record: WaterTargetRecord,
    control: WaterControlDescriptor,
    value: WaterControlValue
  ): Promise<void> {
    if (!isWritableControl(control)) return;
    let handle = record.target.handle;
    const isReplacement = control.updateMode === "replace";
    const mayRebind = isReplacement || control.updateMode === "commit";
    if (mayRebind && this._activeRebindHandles.has(handle)) {
      this._queuedRebinds.set(handle, Object.freeze({ controlId: control.id, value }));
      if (this._activeRecord()?.target.handle === handle) {
        this._setStatus(`Queued latest ${control.label}…`, "busy");
      }
      return;
    }
    if (mayRebind) this._activeRebindHandles.add(handle);
    let pendingRebind: PendingReplacementState | undefined;
    if (mayRebind) {
      const patches = new Map(this._sessionPatches.get(handle) ?? []);
      if (!isReplacement) patches.delete(control.id);
      pendingRebind = Object.freeze({
        baseline: record.baseline,
        patches
      });
    }
    if (pendingRebind) {
      this._pendingReplacements.set(handle, pendingRebind);
    }
    this._beginBusy(handle);
    if (this._activeRecord()?.target.handle === handle) {
      this._setStatus(`Applying ${control.label}…`, "busy");
    }
    try {
      await writeControlValue(control, value);
      handle = record.target.handle;
      let dropped = 0;
      if (pendingRebind) {
        this._pendingReplacements.delete(handle);
        const replay = this._replayAfterReplacement.get(handle);
        this._replayAfterReplacement.delete(handle);
        const nextRecord = this._records.get(handle);
        dropped = replay && nextRecord ? await this._replaySessionPatches(nextRecord, replay) : 0;
        handle = record.target.handle;
      }
      if (!isReplacement && control.sessionScope !== "transient") {
        this._recordSessionPatch(this._records.get(handle) ?? record, control.id, value);
      }
      if (control.rebuildSessionAfterWrite) {
        this._rebuildRecordSession(handle);
      }
      if (this._activeRecord()?.target.handle === handle) {
        if (mayRebind) this._refreshAllBindings();
        this._setStatus(
          dropped > 0 ? `Ready · ${dropped} incompatible edit${dropped === 1 ? "" : "s"} dropped` : "Ready",
          "idle"
        );
      }
    } catch (error) {
      handle = record.target.handle;
      this._pendingReplacements.delete(handle);
      this._replayAfterReplacement.delete(handle);
      if (this._activeRecord()?.target.handle === handle) {
        this._setStatus(`Error: ${formatError(error)}`, "error");
        this._refreshBinding(control.id);
      }
    } finally {
      handle = record.target.handle;
      this._endBusy(handle);
      if (mayRebind) {
        this._activeRebindHandles.delete(handle);
        const queued = this._queuedRebinds.get(handle);
        this._queuedRebinds.delete(handle);
        const queuedRecord = this._records.get(handle);
        const queuedControl = queuedRecord?.session.controls.find(
          (candidate) =>
            candidate.id === queued?.controlId &&
            (candidate.updateMode === "commit" || candidate.updateMode === "replace")
        );
        if (queued && queuedRecord && queuedControl && isWritableControl(queuedControl) && handle.active) {
          void this._applyControlForRecord(queuedRecord, queuedControl, queued.value);
        }
      }
    }
  }

  private _recordSessionPatch(record: WaterTargetRecord, controlId: string, value: WaterControlValue): void {
    if (this._records.get(record.target.handle) !== record) return;
    const patches = this._sessionPatches.get(record.target.handle) ?? new Map<string, WaterControlValue>();
    if (record.baseline.get(controlId) === value) patches.delete(controlId);
    else patches.set(controlId, value);
    if (patches.size === 0) this._sessionPatches.delete(record.target.handle);
    else this._sessionPatches.set(record.target.handle, patches);
  }

  private _rebuildRecordSession(handle: WaterDevelopmentHandle): void {
    const current = this._records.get(handle);
    if (!current) return;
    current.session = this._createRecord(current.target, current.key, current.baseline).session;
    this._rebuildContents();
  }

  private async _replaySessionPatches(
    record: WaterTargetRecord,
    patches: ReadonlyMap<string, WaterControlValue>
  ): Promise<number> {
    let handle = record.target.handle;
    let current = record;
    let dropped = 0;
    const compatible = new Map<string, WaterControlValue>();
    for (const [controlId, value] of patches) {
      const control = current.session.controls.find((candidate) => candidate.id === controlId);
      if (!control || !isWritableControl(control) || control.updateMode === "replace") {
        dropped++;
        continue;
      }
      const mayRebind = control.updateMode === "commit";
      if (mayRebind) {
        this._pendingReplacements.set(
          handle,
          Object.freeze({
            baseline: current.baseline,
            patches: new Map()
          })
        );
      }
      try {
        await writeControlValue(control, value);
        handle = record.target.handle;
        if (mayRebind) current = this._records.get(handle) ?? current;
        compatible.set(controlId, value);
      } catch {
        dropped++;
      } finally {
        handle = record.target.handle;
        if (mayRebind) {
          this._pendingReplacements.delete(handle);
          this._replayAfterReplacement.delete(handle);
        }
      }
    }
    if (this._records.get(handle) !== record) return dropped;
    if (compatible.size === 0) {
      this._sessionPatches.delete(handle);
    } else {
      this._sessionPatches.set(handle, compatible);
    }
    return dropped;
  }

  private async _resetToBaseline(record: WaterTargetRecord): Promise<void> {
    if (this._activeRecord() !== record) return;
    let handle = record.target.handle;
    this._cancelFrameWrites();
    this._sessionPatches.delete(handle);
    this._beginBusy(handle);
    this._setStatus("Resetting…", "busy");
    try {
      const variantControl = record.session.controls.find((control) => control.updateMode === "replace");
      if (variantControl && isWritableControl(variantControl)) {
        const baselineVariant = record.baseline.get(variantControl.id);
        if (baselineVariant !== undefined && readControlValue(variantControl) !== baselineVariant) {
          this._pendingReplacements.set(
            handle,
            Object.freeze({
              baseline: record.baseline,
              patches: new Map()
            })
          );
          await writeControlValue(variantControl, baselineVariant);
          handle = record.target.handle;
          this._pendingReplacements.delete(handle);
          this._replayAfterReplacement.delete(handle);
        }
      }
      for (const [controlId, baseline] of record.baseline) {
        const current = this._records.get(handle) ?? record;
        const control = current.session.controls.find((candidate) => candidate.id === controlId);
        if (!control) continue;
        if (!isWritableControl(control) || control.updateMode === "replace") {
          continue;
        }
        if (readControlValue(control) === baseline) continue;
        const mayRebind = control.updateMode === "commit";
        if (mayRebind) {
          this._pendingReplacements.set(
            handle,
            Object.freeze({
              baseline: record.baseline,
              patches: new Map()
            })
          );
        }
        try {
          await writeControlValue(control, baseline);
        } finally {
          handle = record.target.handle;
          if (mayRebind) {
            this._pendingReplacements.delete(handle);
            this._replayAfterReplacement.delete(handle);
          }
        }
      }
      if (this._activeRecord()?.target.handle === handle) {
        this._refreshAllBindings();
        this._setStatus("Reset complete", "idle");
      }
    } catch (error) {
      handle = record.target.handle;
      this._pendingReplacements.delete(handle);
      this._replayAfterReplacement.delete(handle);
      if (this._activeRecord()?.target.handle === handle) {
        this._refreshAllBindings();
        this._setStatus(`Reset failed: ${formatError(error)}`, "error");
      }
    } finally {
      handle = record.target.handle;
      this._endBusy(handle);
    }
  }

  private async _copyJson(record: WaterTargetRecord): Promise<void> {
    if (this._activeRecord() !== record) return;
    const handle = record.target.handle;
    try {
      const values = Object.fromEntries(
        record.session.controls
          .filter(
            (control) =>
              isWritableControl(control) && control.updateMode !== "replace" && control.sessionScope !== "transient"
          )
          .map((control) => [control.id, readControlValue(control)] as const)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      );
      const structuredDraft = record.session.exportDraft?.();
      const payload = JSON.stringify(
        {
          schemaVersion: 1,
          backendId: record.target.backendId,
          instanceId: record.target.bodyId,
          assetId: handle.instance?.assetId ?? null,
          variantId: getActiveWaterRuntimeVariantId(record.target) ?? null,
          ...(structuredDraft === undefined ? { values } : { draft: structuredDraft })
        },
        null,
        2
      );
      await this._writeClipboard(payload);
      if (this._activeRecord()?.target.handle === handle) {
        this._setStatus("JSON copied", "idle");
      }
    } catch (error) {
      if (this._activeRecord()?.target.handle === handle) {
        this._setStatus(`Copy failed: ${formatError(error)}`, "error");
      }
    }
  }

  private async _writeClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard access is unavailable.");
  }

  private _poll(): void {
    if (this._destroyed || this._gui.closed) return;
    this._refreshAllBindings();
  }

  private _refreshAllBindings(): void {
    for (const controlId of this._bindings.keys()) this._refreshBinding(controlId);
  }

  private _refreshBinding(controlId: string): void {
    const binding = this._bindings.get(controlId);
    if (!binding) return;
    try {
      this._syncControlAvailability(binding);
      if (this._editingControls.has(controlId) || this._frameValues.has(controlId)) {
        return;
      }
      binding.model[controlId] = readControlValue(binding.descriptor);
      binding.controller.updateDisplay();
    } catch (error) {
      this._setStatus(`Read failed: ${formatError(error)}`, "error");
    }
  }

  private _syncControlAvailability(binding: WaterControlBinding): void {
    const { descriptor, controller } = binding;
    const row = controller.domElement.closest<HTMLElement>(".cr");
    if (!row) return;
    const availability = resolveControlAvailability(descriptor);
    if (row.dataset.waterControlAvailability === availability) return;
    const owner = resolveControlOwner(descriptor);
    const effect = resolveControlEffect(descriptor);
    row.dataset.waterControlOwner = owner;
    row.dataset.waterControlEffect = effect;
    row.dataset.waterControlAvailability = availability;
    row.classList.toggle("water-devtools__conditional", availability === "conditional");
    row.classList.toggle("water-devtools__unavailable", availability === "unavailable");
    row.setAttribute(
      "title",
      [
        getWaterDevToolsDisplayLabel(descriptor.label),
        descriptor.description,
        `Consumer: ${owner}`,
        `Effect: ${effect}`,
        `Availability: ${availability}`,
        descriptor.availabilityReason ? `Reason: ${descriptor.availabilityReason}` : undefined,
        descriptor.prerequisites?.length ? `Requires: ${descriptor.prerequisites.join(", ")}` : undefined
      ]
        .filter((value): value is string => value !== undefined)
        .join("\n")
    );
    if (!isWritableControl(descriptor)) {
      this._editingControls.delete(descriptor.id);
      this._disableController(controller);
    } else {
      row.classList.remove("water-devtools__readonly");
      for (const element of controller.domElement.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input, select, button"))
        element.removeAttribute("tabindex");
      const handle = this._activeRecord()?.target.handle;
      this._setControllerBusy(controller, handle !== undefined && (this._busyCounts.get(handle) ?? 0) > 0);
    }
  }

  private _activeRecord(): WaterTargetRecord | undefined {
    if (!this._activeKey) return undefined;
    return [...this._records.values()].find((record) => record.key === this._activeKey);
  }

  private _defaultRecord(): WaterTargetRecord | undefined {
    const records = [...this._records.values()];
    return records.find((record) => record.target.handle.visible) ?? records[0];
  }

  private _setStatus(status: string, kind: "idle" | "busy" | "error"): void {
    this._statusModel.status = status;
    this._statusController?.updateDisplay();
    this._gui.domElement.dataset.status = kind;
    this._syncPanelTitle();
  }

  private _readPanelOpenState(): boolean {
    try {
      return window.sessionStorage.getItem(PANEL_STATE_KEY) === "open";
    } catch {
      return false;
    }
  }

  private _writePanelOpenState(open: boolean): void {
    try {
      window.sessionStorage.setItem(PANEL_STATE_KEY, open ? "open" : "closed");
    } catch {
      // Session storage is optional in sandboxed or privacy-restricted previews.
    }
  }

  private _syncPanelOpenState(): void {
    this._writePanelOpenState(!this._gui.closed);
    this._syncPolling();
    this._syncPanelTitle();
  }

  private _syncPolling(): void {
    const shouldPoll = !this._destroyed && !this._gui.closed;
    if (shouldPoll && this._pollTimer === undefined) {
      this._pollTimer = window.setInterval(() => this._poll(), POLL_INTERVAL_MS);
    } else if (!shouldPoll && this._pollTimer !== undefined) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private _syncPanelTitle(): void {
    const closeButton = this._gui.domElement.querySelector<HTMLElement>(".close-button");
    if (!closeButton) return;
    closeButton.textContent = this._gui.closed ? "Water DevTools" : "Close Water DevTools";
  }
}

/**
 * Mounts one loader-bound Water DevTools panel. Repeated calls for the same
 * loader return the existing panel so a Demo can safely compose setup helpers.
 */
export function mountWaterDevTools(options: WaterDevToolsOptions): WaterDevToolsHandle {
  if (options.host && options.folderHost) {
    throw new Error("Water DevTools options 'host' and 'folderHost' are mutually exclusive.");
  }
  const existing = mountedPanels.get(options.loader);
  if (existing) return existing;
  const panel = new WaterDevToolsPanel(options);
  mountedPanels.set(options.loader, panel);
  return panel;
}
