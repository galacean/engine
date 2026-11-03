import { BoolUpdateFlag, Camera, Ray, Vector2, Vector3 } from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import type { PromptNoiseTerrainBinding } from "./PromptNoiseTerrainBinding.ts";
import {
  decodePromptNoiseWorldRecipe,
  insertPromptNoiseRiverControlPoint,
  intersectPromptNoiseTerrain,
  movePromptNoiseRiverControlPoint,
  operatorBounds,
  promptNoiseTemplateParameters,
  PromptNoiseTerrainProgram,
  removePromptNoiseRiverControlPoint,
  samplePromptNoiseRiverProfile,
  updatePromptNoiseRiverControlPoint,
  type PromptNoiseOperatorTemplateId,
  type PromptNoisePlacementParametersV1,
  type PromptNoiseTerrainOperatorKind,
  type PromptNoiseTerrainOperatorV1,
  type PromptNoiseRiverControlPointV1,
  type PromptNoiseRiverCurveMode,
  type PromptNoiseRiverOperatorV1,
  type PromptNoiseWorldPointV1,
  type PromptNoiseWorldRecipe
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import { PromptNoiseRiverFieldCompiler } from "@galacean/engine-world-planning/generation/noise/PromptNoiseRiverFieldCompiler";
import {
  connectPromptNoiseRiverConfluence,
  disconnectPromptNoiseRiverNetwork,
  listPromptNoiseRiverNetworks,
  type PromptNoiseRiverNetworkSnapshotV1
} from "./PromptNoiseRiverNetworkTopology.ts";
import { PromptNoiseWorldRegistry, type PromptNoiseWorldRegistryEntryV1 } from "./PromptNoiseWorldRegistry.ts";

const ACTIVE_CLIPMAP_RADIUS = 7_000;
const PICK_SAMPLE_LIMIT = 180;
const FRAME_SAMPLE_LIMIT = 240;

/** Target source used to place the live operator draft. */
export type PromptNoiseTargetModeV1 = "camera" | "mouse";

/** Authoring measurements exposed to the panel and browser acceptance tests. */
export interface PromptNoiseAuthoringSnapshotV1 {
  /** Whether interactive draft authoring and projected outlines are enabled. */
  readonly editingEnabled: boolean;
  /** Stable numeric local-registry identity for the committed recipe. */
  readonly worldId: number;
  /** Full canonical recipe digest. */
  readonly sha256: string;
  /** Number of committed operators. */
  readonly committedOperatorCount: number;
  /** Number of operators currently uploaded to the GPU. */
  readonly activeOperatorCount: number;
  /** Complete exported `.pnw3` or `.pnw4` byte count. */
  readonly operatorTableBytes: number;
  /** Active transient RGBA32F record bytes. */
  readonly activeOperatorBytes: number;
  /** Current draft tool, or null before a valid terrain pick. */
  readonly draftTool: PromptNoiseTerrainOperatorKind | null;
  /** Stable id selected for editing or highlighting. */
  readonly selectedOperatorId: number;
  /** Stable selected River Control Point identity, or zero. */
  readonly selectedRiverPointId: number;
  /** Selected River's curve mode. */
  readonly riverCurveMode: PromptNoiseRiverCurveMode | null;
  /** Selected River's arbitrary point count. */
  readonly riverControlPointCount: number;
  /** Total committed/draft River control points currently uploaded to Terrain. */
  readonly totalRiverControlPointCount: number;
  /** Bounded River Field tables currently uploaded by the Terrain binding. */
  readonly riverFieldCount: number;
  readonly riverFieldSegmentCount: number;
  readonly riverFieldCellCount: number;
  readonly riverFieldMaximumCellSegmentCount: number;
  readonly riverFieldBytes: number;
  readonly riverFieldUploadCount: number;
  /** Explicit C2-C topology diagnostics. */
  readonly riverNetworkCount: number;
  readonly riverReachCount: number;
  readonly riverJunctionCount: number;
  /** Current target-source mode. */
  readonly targetMode: PromptNoiseTargetModeV1;
  /** Logical terrain hit used by the draft. */
  readonly target: readonly [x: number, y: number, z: number] | null;
  /** Draft/selection minimum and maximum elevation delta. */
  readonly heightDeltaRange: readonly [minimum: number, maximum: number];
  /** Maximum sampled slope in the selected compact support. */
  readonly maximumSlope: number;
  /** Rolling analytic pick percentiles in milliseconds. */
  readonly pickMilliseconds: readonly [p50: number, p95: number];
  /** Rolling frame percentiles in milliseconds. */
  readonly frameMilliseconds: readonly [p50: number, p95: number];
  /** Non-persistent total draft replica count. */
  readonly stressOperatorCount: number;
  /** Whether an older committed recipe can be restored. */
  readonly canUndo: boolean;
  /** Whether an undone recipe can be restored. */
  readonly canRedo: boolean;
  /** Last persistence or authoring result. */
  readonly status: string;
  /** Whether input listeners and projected authoring graphics were released. */
  readonly destroyed: boolean;
}

/** Mutable panel fields; every change is recompiled through a placement intent. */
export type PromptNoiseAuthoringControlsV1 = {
  -readonly [Key in keyof PromptNoisePlacementParametersV1]: PromptNoisePlacementParametersV1[Key];
} & {
  /** Enables interactive draft authoring; disabled by default. */
  editingEnabled: boolean;
  /** Active tool. */
  tool: PromptNoiseTerrainOperatorKind;
  /** Active template provenance. */
  templateId: PromptNoiseOperatorTemplateId;
  /** Target source. */
  targetMode: PromptNoiseTargetModeV1;
  /** Stress-preview replica count; zero disables stress mode. */
  stressOperatorCount: number;
  /** Numeric ID typed for local-registry loading. */
  worldIdInput: number;
};

/** Construction dependencies for the authoring deep module. */
export interface PromptNoiseTerrainAuthoringOptionsV1 {
  /** Render canvas receiving pointer input. */
  readonly canvas: HTMLCanvasElement;
  /** Camera used for analytic picking and overlay projection. */
  readonly camera: Camera;
  /** Orbit control whose input convention is coordinated with mouse placement. */
  readonly orbit: OrbitControl;
  /** GPU binding receiving compiled active operator tables. */
  readonly binding: PromptNoiseTerrainBinding;
  /** Initial committed terrain program. */
  readonly program: PromptNoiseTerrainProgram;
  /** Returns the current floating logical origin. */
  readonly getLogicalOrigin: () => readonly [x: number, z: number];
  /** SVG overlay owned by the demo shell. */
  readonly overlay: SVGSVGElement;
  /** Optional state callback used to refresh the panel. */
  readonly onChange?: (snapshot: PromptNoiseAuthoringSnapshotV1) => void;
  /** Optional committed-recipe observer for dependent systems such as Water. */
  readonly onCommittedProgramChange?: (program: PromptNoiseTerrainProgram) => void | Promise<void>;
}

/**
 * Owns interactive placement, deterministic history, binary persistence, picking, and projected outlines.
 */
export class PromptNoiseTerrainAuthoring {
  readonly controls: PromptNoiseAuthoringControlsV1;

  private readonly _canvas: HTMLCanvasElement;
  private readonly _camera: Camera;
  private readonly _orbit: OrbitControl;
  private readonly _binding: PromptNoiseTerrainBinding;
  private readonly _getLogicalOrigin: () => readonly [x: number, z: number];
  private readonly _overlay: SVGSVGElement;
  private readonly _onChange?: (snapshot: PromptNoiseAuthoringSnapshotV1) => void;
  private readonly _onCommittedProgramChange?: (program: PromptNoiseTerrainProgram) => void | Promise<void>;
  private readonly _registry = new PromptNoiseWorldRegistry();
  private readonly _screenPoint = new Vector2();
  private readonly _pickRay = new Ray();
  private readonly _projectPoint = new Vector3();
  private readonly _projectedPoint = new Vector3();
  private _pickSamples = new RollingTimingSamples(PICK_SAMPLE_LIMIT);
  private _frameSamples = new RollingTimingSamples(FRAME_SAMPLE_LIMIT);
  private _cameraTransformChanged: BoolUpdateFlag;
  private _cameraDraftPosition = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  private _cameraDraftForward = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  private readonly _undo: PromptNoiseWorldRecipe[] = [];
  private readonly _redo: PromptNoiseWorldRecipe[] = [];
  private _program: PromptNoiseTerrainProgram;
  private _publishedProgram: PromptNoiseTerrainProgram;
  private _publishedEntry: PromptNoiseWorldRegistryEntryV1 | null = null;
  private _publishedUndo: PromptNoiseWorldRecipe[] = [];
  private _publishedRedo: PromptNoiseWorldRecipe[] = [];
  private _previewProgram: PromptNoiseTerrainProgram;
  private _displayProgram: PromptNoiseTerrainProgram;
  private _draft: PromptNoiseTerrainOperatorV1 | null = null;
  private _entry: PromptNoiseWorldRegistryEntryV1 | null = null;
  private _editingOperatorId = 0;
  private _selectedOperatorId = 0;
  private _selectedRiverPointId = 0;
  private _riverDrag: Readonly<{
    operatorId: number;
    pointId: number;
    kind: "position" | "width";
  }> | null = null;
  private _riverDragChanged = false;
  private _mouseClientX = 0;
  private _mouseClientY = 0;
  private _hasMouse = false;
  private _orbitSuspendedByCanvasAuthoring = false;
  private _orbitEnabledBeforeAuthoringInteraction: boolean | null = null;
  private _dirty = true;
  private _destroyed = false;
  private _status = "正在注册初始世界…";
  private _target: readonly [number, number, number] | null = null;
  private _heightDeltaRange: readonly [number, number] = [0, 0];
  private _maximumSlope = 0;
  private readonly _initialCommit: Promise<void>;

  private readonly _onPointerMove = (event: PointerEvent): void => {
    this._mouseClientX = event.clientX;
    this._mouseClientY = event.clientY;
    this._hasMouse = true;
    if (this.controls.editingEnabled && this.controls.targetMode === "mouse" && this._editingOperatorId === 0)
      this._dirty = true;
  };

  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (
      !this.controls.editingEnabled ||
      this.controls.targetMode !== "mouse" ||
      event.button !== 0 ||
      event.altKey ||
      this._editingOperatorId !== 0
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this._orbitSuspendedByCanvasAuthoring = true;
    this._suspendOrbitForAuthoringInteraction();
    void this.applyDraft();
  };

  private readonly _onPointerUp = (): void => {
    if (!this._orbitSuspendedByCanvasAuthoring) return;
    this._orbitSuspendedByCanvasAuthoring = false;
    this._restoreOrbitAfterAuthoringInteraction();
  };

  private readonly _onWindowBlur = (): void => {
    this._cancelAuthoringPointerInteraction();
  };

  private readonly _onOverlayPointerDown = (event: PointerEvent): void => {
    const handle = (event.target as Element | null)?.closest<SVGElement>("[data-river-point-id]");
    if (!handle || event.button !== 0 || !this.controls.editingEnabled) return;
    const operatorId = Number(handle.dataset.operatorId);
    const pointId = Number(handle.dataset.riverPointId);
    const kind = handle.dataset.riverHandle === "width" ? "width" : "position";
    if (!Number.isInteger(operatorId) || !Number.isInteger(pointId)) return;
    event.preventDefault();
    event.stopPropagation();
    this._selectedOperatorId = operatorId;
    this._selectedRiverPointId = pointId;
    this._editingOperatorId = operatorId;
    this._riverDrag = Object.freeze({ operatorId, pointId, kind });
    this._riverDragChanged = false;
    this._suspendOrbitForAuthoringInteraction();
    this._notify();
  };

  private readonly _onOverlayPointerMove = (event: PointerEvent): void => {
    if (!this._riverDrag) return;
    const hit = this._pickAtClient(event.clientX, event.clientY);
    if (!hit) return;
    const operator = this._riverDraftOperator(this._riverDrag.operatorId);
    if (!operator) return;
    if (this._riverDrag.kind === "position") {
      this._setRiverDraft(
        movePromptNoiseRiverControlPoint(operator, this._riverDrag.pointId, { x: hit.x, z: hit.z }),
        "控制点拖动预览（尚未提交）"
      );
    } else {
      const point = operator.controlPoints!.find((entry) => entry.id === this._riverDrag!.pointId);
      if (!point) return;
      const width = Math.min(50, Math.max(1, Math.hypot(hit.x - point.position.x, hit.z - point.position.z) * 2));
      this._setRiverDraft(
        updatePromptNoiseRiverControlPoint(operator, point.id, { width }),
        "河宽拖动预览（尚未提交）"
      );
    }
    this._riverDragChanged = true;
  };

  private readonly _onOverlayPointerUp = (): void => {
    if (!this._riverDrag) return;
    const changed = this._riverDragChanged;
    this._riverDrag = null;
    this._riverDragChanged = false;
    this._restoreOrbitAfterAuthoringInteraction();
    if (this.controls.editingEnabled && changed) void this.commitRiverControlPointEdit();
  };

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    if (!this.controls.editingEnabled || event.key !== "Enter" || event.repeat || isEditableTarget(event.target))
      return;
    event.preventDefault();
    void this.applyDraft();
  };

  /**
   * Creates an isolated authoring session and immediately registers its initial recipe.
   * @param options Runtime, persistence, and overlay dependencies.
   */
  constructor(options: PromptNoiseTerrainAuthoringOptionsV1) {
    this._canvas = options.canvas;
    this._camera = options.camera;
    this._cameraTransformChanged = options.camera.entity.registerWorldChangeFlag();
    this._orbit = options.orbit;
    this._binding = options.binding;
    this._getLogicalOrigin = options.getLogicalOrigin;
    this._overlay = options.overlay;
    this._onChange = options.onChange;
    this._onCommittedProgramChange = options.onCommittedProgramChange;
    this._program = options.program;
    this._publishedProgram = options.program;
    this._previewProgram = options.program;
    this._displayProgram = options.program;
    this.controls = createControls("river", "river-shallow");
    this._canvas.addEventListener("pointermove", this._onPointerMove, { passive: true });
    this._canvas.addEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
    window.addEventListener("blur", this._onWindowBlur);
    this._overlay.addEventListener("pointerdown", this._onOverlayPointerDown);
    window.addEventListener("pointermove", this._onOverlayPointerMove);
    window.addEventListener("pointerup", this._onOverlayPointerUp);
    window.addEventListener("pointercancel", this._onOverlayPointerUp);
    window.addEventListener("keydown", this._onKeyDown);
    this._initialCommit = this._registerCommitted("初始世界已注册");
  }

  /** Resolves after the initial Terrain/Water/Semantic/Layout world commit. */
  waitUntilReady(): Promise<void> {
    return this._initialCommit;
  }

  /**
   * Recompiles a dirty draft, updates compact GPU residency, and redraws terrain-projected outlines.
   * @param frameMilliseconds Latest real frame duration.
   */
  update(frameMilliseconds: number): void {
    if (this._destroyed) return;
    this._frameSamples.add(frameMilliseconds);
    if (!this.controls.editingEnabled) {
      if (this._dirty) this._restoreCommittedDisplay();
      return;
    }
    if (this.controls.targetMode === "camera" && this._editingOperatorId === 0 && this._cameraTransformChanged.flag) {
      this._cameraTransformChanged.flag = false;
      const transform = this._camera.entity.transform;
      const positionChanged = updateCameraDraftVector(transform.worldPosition, this._cameraDraftPosition);
      const forwardChanged = updateCameraDraftVector(transform.worldForward, this._cameraDraftForward);
      if (positionChanged || forwardChanged) {
        this._dirty = true;
      }
    }
    if (this._dirty) this._rebuildPreview();
    this._renderOverlay();
  }

  /** Starts a fresh steady-state performance window after cold-start or committed regeneration work. */
  resetPerformanceMetrics(): void {
    this._pickSamples.reset();
    this._frameSamples.reset();
  }

  /**
   * Enables or disables interactive draft authoring without changing the committed recipe.
   * @param enabled Whether picks, previews, overlays, and Enter-to-apply are active.
   */
  setEditingEnabled(enabled: boolean): void {
    if (!enabled) this._cancelAuthoringPointerInteraction();
    if (this.controls.editingEnabled === enabled) return;
    this.controls.editingEnabled = enabled;
    this._editingOperatorId = 0;
    this._selectedOperatorId = 0;
    this._status = enabled ? "算子编辑已开启" : "算子编辑已关闭";
    this._dirty = true;
    if (!enabled) this._restoreCommittedDisplay();
    this._notify();
  }

  /**
   * Replaces the current tool and resolves the requested template into complete editable values.
   * @param tool Operator family.
   * @param templateId Compatible template identifier.
   */
  setTool(tool: PromptNoiseTerrainOperatorKind, templateId: PromptNoiseOperatorTemplateId): void {
    this._editingOperatorId = 0;
    this._selectedOperatorId = 0;
    this.controls.tool = tool;
    this.controls.templateId = templateId;
    Object.assign(this.controls, promptNoiseTemplateParameters(templateId));
    this._dirty = true;
  }

  /**
   * Changes target source while preserving the current template values.
   * @param targetMode Camera-center or mouse-hover placement.
   */
  setTargetMode(targetMode: PromptNoiseTargetModeV1): void {
    this.controls.targetMode = targetMode;
    this._dirty = true;
  }

  /** Marks panel parameter changes for recompilation on the next frame. */
  invalidateDraft(): void {
    this._dirty = true;
  }

  /**
   * Changes the non-persistent stress replica count and starts a fresh frame-time window.
   * @param count Number of active draft replicas to display.
   */
  setStressOperatorCount(count: number): void {
    if (!Number.isInteger(count) || count < 0)
      throw new RangeError("Stress operator count must be a non-negative integer");
    this.controls.stressOperatorCount = count;
    this._frameSamples.reset();
    this._dirty = true;
  }

  /**
   * Commits a deterministic base-field edit and assigns the resulting world a new registry identity.
   * @param base Complete normalized FBM and ridge parameter object.
   */
  async setBase(base: PromptNoiseWorldRecipe["base"]): Promise<void> {
    this._pushHistory();
    this._program = new PromptNoiseTerrainProgram({ ...this._program.recipe, base });
    this._editingOperatorId = 0;
    await this._registerCommitted("基底参数已更新");
    this._dirty = true;
  }

  /**
   * Replaces the committed recipe through the same history and registry path used by import.
   * @param program Decoded or migrated deterministic program.
   * @param status User-facing source description.
   */
  async replaceProgram(program: PromptNoiseTerrainProgram, status: string): Promise<void> {
    this._pushHistory();
    this._program = program;
    this._editingOperatorId = 0;
    this._draft = null;
    await this._registerCommitted(status);
    this._restoreCommittedDisplay();
    this._notify();
  }

  /**
   * Commits exactly one real draft; stress replicas never enter the recipe.
   * @returns Completion after IndexedDB registration and digest computation.
   */
  async applyDraft(): Promise<void> {
    if (!this.controls.editingEnabled) {
      this._status = "请先开启算子编辑";
      this._notify();
      return;
    }
    if (this._dirty) this._rebuildPreview();
    if (!this._draft) {
      this._status = "当前射线没有命中地形";
      this._notify();
      return;
    }
    this._undo.push(this._program.recipe);
    this._redo.length = 0;
    this._program = this._program.withOperator(this._draft);
    this._previewProgram = this._program;
    this._editingOperatorId = 0;
    this._selectedOperatorId = this._draft.id;
    this._draft = null;
    await this._registerCommitted("算子已提交");
    this._dirty = true;
  }

  /** Cancels an edit and restores the exact committed bytes. */
  cancelEdit(): void {
    this._editingOperatorId = 0;
    this._draft = null;
    this._previewProgram = this._program;
    this._status = "编辑已取消，配方未变化";
    this._dirty = true;
  }

  /**
   * Selects an existing operator and opens a detached editable draft.
   * @param operatorId Stable committed identity.
   */
  editOperator(operatorId: number): void {
    if (!this.controls.editingEnabled) {
      this._status = "请先开启算子编辑";
      this._notify();
      return;
    }
    const operator = this._program.recipe.operators.find((entry) => entry.id === operatorId);
    if (!operator) return;
    this._editingOperatorId = operator.id;
    this._selectedOperatorId = operator.id;
    this._selectedRiverPointId = operator.kind === "river" ? (operator.controlPoints?.[0].id ?? 0) : 0;
    this.controls.tool = operator.kind;
    this.controls.templateId = operator.templateId;
    Object.assign(this.controls, parametersFromOperator(this._program, operator));
    this._dirty = true;
  }

  /**
   * Selects an operator for mask highlighting without changing it.
   * @param operatorId Stable identity, or zero for none.
   */
  selectOperator(operatorId: number): void {
    this._selectedOperatorId = operatorId;
    const river = this._program.recipe.operators.find(
      (operator): operator is PromptNoiseRiverOperatorV1 => operator.id === operatorId && operator.kind === "river"
    );
    this._selectedRiverPointId = river?.controlPoints?.[0].id ?? 0;
    this._binding.setSelectedOperatorId(operatorId);
    this._notify();
  }

  /** Selects one stable River point for viewport and Inspector editing. */
  listRiverControlPoints(operatorId: number): readonly PromptNoiseRiverControlPointV1[] {
    const operator = this._riverDraftOperator(operatorId);
    return Object.freeze(
      (operator?.controlPoints ?? []).map((point) =>
        Object.freeze({
          ...point,
          position: { ...point.position },
          inHandle: { ...point.inHandle },
          outHandle: { ...point.outHandle }
        })
      )
    );
  }

  /** Selects one stable River point for viewport and Inspector editing. */
  selectRiverControlPoint(operatorId: number, pointId: number): void {
    const operator = this._program.recipe.operators.find(
      (entry): entry is PromptNoiseRiverOperatorV1 => entry.id === operatorId && entry.kind === "river"
    );
    if (!operator?.controlPoints?.some((point) => point.id === pointId)) {
      throw new RangeError(`Unknown River control point ${pointId}`);
    }
    this._selectedOperatorId = operatorId;
    this._editingOperatorId = operatorId;
    this._selectedRiverPointId = pointId;
    this._draft = operator;
    this._displayProgram = this._program;
    this._previewProgram = this._program;
    this._binding.setSelectedOperatorId(operatorId);
    this._notify();
  }

  /** Returns detached data for the current River Point Inspector. */
  getSelectedRiverControlPoint(): PromptNoiseRiverControlPointV1 | null {
    const operator = this._riverDraftOperator(this._selectedOperatorId);
    const point = operator?.controlPoints?.find((entry) => entry.id === this._selectedRiverPointId);
    return point
      ? {
          ...point,
          position: { ...point.position },
          inHandle: { ...point.inHandle },
          outHandle: { ...point.outHandle }
        }
      : null;
  }

  /** Updates Terrain preview only; Water/Semantic/Layout remain on the committed revision. */
  previewRiverControlPoint(
    operatorId: number,
    pointId: number,
    patch: Partial<Omit<PromptNoiseRiverControlPointV1, "id">>
  ): void {
    const operator = this._riverDraftOperator(operatorId);
    if (!operator) throw new RangeError(`Unknown editable River operator ${operatorId}`);
    this._selectedOperatorId = operatorId;
    this._editingOperatorId = operatorId;
    this._selectedRiverPointId = pointId;
    const { position, ...profilePatch } = patch;
    const updated = position
      ? updatePromptNoiseRiverControlPoint(
          movePromptNoiseRiverControlPoint(operator, pointId, position),
          pointId,
          profilePatch
        )
      : updatePromptNoiseRiverControlPoint(operator, pointId, profilePatch);
    this._setRiverDraft(updated, "控制点 Inspector 预览（尚未提交）");
  }

  /** Atomically publishes the current River point preview as one world revision. */
  async commitRiverControlPointEdit(): Promise<void> {
    if (!this._draft || this._draft.kind !== "river" || !this._draft.controlPoints) return;
    this._pushHistory();
    this._program = this._program.withOperator(this._draft);
    this._previewProgram = this._program;
    this._displayProgram = this._program;
    await this._registerCommitted("River 控制点已原子提交");
    this._draft = this._program.recipe.operators.find((entry) => entry.id === this._editingOperatorId) ?? null;
    this._dirty = false;
    this._bindPreview();
  }

  /** Inserts a midpoint after one stable point and commits one history revision. */
  async insertRiverControlPoint(operatorId: number, afterPointId: number): Promise<void> {
    const operator = this._riverDraftOperator(operatorId);
    if (!operator) throw new RangeError(`Unknown editable River operator ${operatorId}`);
    if (operator.controlPoints!.at(-1)!.id === afterPointId) {
      this._status = "河口之后不能插入控制点；请先选择河口之前的点";
      this._notify();
      return;
    }
    const updated = insertPromptNoiseRiverControlPoint(operator, afterPointId);
    this._selectedOperatorId = operatorId;
    this._editingOperatorId = operatorId;
    this._selectedRiverPointId = updated.nextControlPointId! - 1;
    this._setRiverDraft(updated, "River 控制点已插入（尚未提交）");
    await this.commitRiverControlPointEdit();
  }

  /** Deletes one internal stable point and commits one history revision. */
  async deleteRiverControlPoint(operatorId: number, pointId: number): Promise<void> {
    const operator = this._riverDraftOperator(operatorId);
    if (!operator) throw new RangeError(`Unknown editable River operator ${operatorId}`);
    const index = operator.controlPoints!.findIndex((point) => point.id === pointId);
    if (index === 0 || index === operator.controlPoints!.length - 1) {
      this._status = "源头和河口控制点不能删除";
      this._notify();
      return;
    }
    const updated = removePromptNoiseRiverControlPoint(operator, pointId);
    this._selectedOperatorId = operatorId;
    this._editingOperatorId = operatorId;
    this._selectedRiverPointId = updated.controlPoints![Math.max(0, index - 1)].id;
    this._setRiverDraft(updated, "River 控制点已删除（尚未提交）");
    await this.commitRiverControlPointEdit();
  }

  listRiverNetworks(): readonly PromptNoiseRiverNetworkSnapshotV1[] {
    return listPromptNoiseRiverNetworks(this._program);
  }

  /** Atomically connects two incoming Reach mouths to one outgoing Reach source. */
  async connectRiverConfluence(
    incomingOperatorIds: readonly [number, number],
    outgoingOperatorId: number,
    mergeRadius: number
  ): Promise<void> {
    let updated: PromptNoiseTerrainProgram;
    try {
      updated = connectPromptNoiseRiverConfluence(this._program, incomingOperatorIds, outgoingOperatorId, mergeRadius);
    } catch (error) {
      this._status = `River 汇流连接失败 · ${error instanceof Error ? error.message : String(error)}`;
      this._notify();
      return;
    }
    this._pushHistory();
    this._program = updated;
    this._previewProgram = updated;
    this._displayProgram = updated;
    this._selectedOperatorId = outgoingOperatorId;
    this._editingOperatorId = outgoingOperatorId;
    this._selectedRiverPointId =
      updated.recipe.operators.find(
        (operator): operator is PromptNoiseRiverOperatorV1 =>
          operator.kind === "river" && operator.id === outgoingOperatorId
      )?.controlPoints?.[0].id ?? 0;
    try {
      await this._registerCommitted("River Y 汇流已原子提交");
    } catch {
      this._draft = null;
      this._bindPreview();
      this._renderOverlay();
      this._notify();
      return;
    }
    this._draft = this._program.recipe.operators.find((operator) => operator.id === outgoingOperatorId) ?? null;
    this._dirty = false;
    this._bindPreview();
    this._renderOverlay();
    this._notify();
  }

  /** Atomically disconnects the selected Network into explicit singleton Reaches. */
  async disconnectRiverNetwork(operatorId: number): Promise<void> {
    let updated: PromptNoiseTerrainProgram;
    try {
      updated = disconnectPromptNoiseRiverNetwork(this._program, operatorId);
    } catch (error) {
      this._status = `River Network 断开失败 · ${error instanceof Error ? error.message : String(error)}`;
      this._notify();
      return;
    }
    if (updated === this._program) return;
    this._pushHistory();
    this._program = updated;
    this._previewProgram = updated;
    this._displayProgram = updated;
    this._selectedOperatorId = operatorId;
    this._editingOperatorId = operatorId;
    try {
      await this._registerCommitted("River Network 已断开为独立 Reach");
    } catch {
      this._draft = null;
      this._bindPreview();
      this._renderOverlay();
      this._notify();
      return;
    }
    this._draft = this._program.recipe.operators.find((operator) => operator.id === operatorId) ?? null;
    this._dirty = false;
    this._bindPreview();
    this._renderOverlay();
    this._notify();
  }

  /** Changes the selected River interpolation mode; preview and commit are deliberately separate. */
  setRiverCurveMode(operatorId: number, curveMode: PromptNoiseRiverCurveMode, commit: boolean): Promise<void> | void {
    const operator = this._riverDraftOperator(operatorId);
    if (!operator) throw new RangeError(`Unknown editable River operator ${operatorId}`);
    this._setRiverDraft(Object.freeze({ ...operator, curveMode }), "River 曲线模式预览（尚未提交）");
    if (commit) return this.commitRiverControlPointEdit();
  }

  /**
   * Deletes one committed operator as a history-tracked recipe edit.
   * @param operatorId Stable identity.
   */
  async deleteOperator(operatorId: number): Promise<void> {
    if (!this._program.recipe.operators.some((entry) => entry.id === operatorId)) return;
    const connectedNetwork = this.listRiverNetworks().find(
      (network) => network.reachOperatorIds.includes(operatorId) && network.reachOperatorIds.length > 1
    );
    if (connectedNetwork) {
      this._status = `Reach #${operatorId} 仍属于 Network #${connectedNetwork.id}；请先断开河网再删除`;
      this._notify();
      return;
    }
    this._pushHistory();
    this._program = this._program.withoutOperator(operatorId);
    this._selectedOperatorId = 0;
    this._editingOperatorId = 0;
    await this._registerCommitted("算子已删除");
    this._dirty = true;
  }

  /**
   * Moves one operator within the compatible Shape or Smooth stage.
   * @param operatorId Stable identity.
   * @param direction Earlier or later.
   */
  async moveOperator(operatorId: number, direction: -1 | 1): Promise<void> {
    const moved = this._program.moveOperator(operatorId, direction);
    if (
      moved === this._program ||
      moved.recipe.operators.every((entry, index) => entry.id === this._program.recipe.operators[index]?.id)
    ) {
      this._status = "算子不能跨越 Shape / Smooth 阶段";
      this._notify();
      return;
    }
    this._pushHistory();
    this._program = moved;
    await this._registerCommitted("算子顺序已更新");
    this._dirty = true;
  }

  /** Restores the exact previous recipe bytes. */
  async undo(): Promise<void> {
    const recipe = this._undo.pop();
    if (!recipe) return;
    this._redo.push(this._program.recipe);
    this._program = new PromptNoiseTerrainProgram(recipe);
    this._editingOperatorId = 0;
    this._draft = null;
    await this._registerCommitted("已撤销");
    this._restoreCommittedDisplay();
    this._notify();
  }

  /** Restores the exact recipe bytes removed by the last undo. */
  async redo(): Promise<void> {
    const recipe = this._redo.pop();
    if (!recipe) return;
    this._undo.push(this._program.recipe);
    this._program = new PromptNoiseTerrainProgram(recipe);
    this._editingOperatorId = 0;
    this._draft = null;
    await this._registerCommitted("已重做");
    this._restoreCommittedDisplay();
    this._notify();
  }

  /** Downloads the committed self-contained linear RGBA32F operator table. */
  exportWorld(): void {
    if (!this._entry) return;
    const blob = new Blob([this._entry.bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${this._entry.worldId}.${this._program.recipe.version === 4 ? "pnw4" : "pnw3"}`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** Returns detached committed bytes for deterministic automation and import recovery checks. */
  getWorldBytes(): Uint8Array {
    return this._entry ? this._entry.bytes.slice() : this._program.encode(0).bytes.slice();
  }

  /**
   * Imports a self-contained PNW3 or PNW4 pixel table and reports any local numeric-ID remapping.
   * @param bytes Exact `.pnw3` or `.pnw4` bytes.
   */
  async importWorld(bytes: Uint8Array): Promise<void> {
    const imported = await this._registry.import(bytes);
    const decoded = decodePromptNoiseWorldRecipe(imported.bytes);
    this._pushHistory();
    this._program = decoded.program;
    this._editingOperatorId = 0;
    this._draft = null;
    await this._publishRegisteredCandidate(
      imported,
      imported.remapped ? "导入成功；本地 ID 冲突，已映射为" : "导入成功"
    );
    this._restoreCommittedDisplay();
    this._notify();
  }

  /**
   * Loads one locally registered numeric identity.
   * @param worldId Unsigned decimal lookup key.
   */
  async loadWorldId(worldId: number): Promise<void> {
    const loaded = await this._registry.load(Math.round(worldId) >>> 0);
    if (!loaded) {
      this._status = `本地没有 World Seed ID ${Math.round(worldId) >>> 0}`;
      this._notify();
      return;
    }
    this._pushHistory();
    this._program = loaded.program;
    this._editingOperatorId = 0;
    this._draft = null;
    await this._publishRegisteredCandidate(loaded.entry, "已从本地注册表还原");
    this._restoreCommittedDisplay();
    this._notify();
  }

  /** @returns Stable ordered committed operator identities and labels. */
  listOperators(): readonly { readonly id: number; readonly label: string }[] {
    return Object.freeze(
      this._program.recipe.operators.map((operator, index) =>
        Object.freeze({
          id: operator.id,
          label: `${index + 1}. ${kindLabel(operator.kind)} #${operator.id}`
        })
      )
    );
  }

  /** @returns Current immutable committed terrain program. */
  getProgram(): PromptNoiseTerrainProgram {
    return this._program;
  }

  /** @returns Immutable authoring and performance state. */
  snapshot(): PromptNoiseAuthoringSnapshotV1 {
    const binding = this._binding.getTerrainProgram();
    const riverNetworks = this.listRiverNetworks();
    return Object.freeze({
      editingEnabled: this.controls.editingEnabled,
      worldId: this._entry?.worldId ?? 0,
      sha256: this._entry?.sha256 ?? "pending",
      committedOperatorCount: this._program.recipe.operators.length,
      activeOperatorCount: binding.activeOperatorCount,
      operatorTableBytes: this._entry?.bytes.byteLength ?? this._program.encode(0).bytes.byteLength,
      activeOperatorBytes: binding.activeOperatorBytes,
      draftTool: this._draft?.kind ?? null,
      selectedOperatorId: this._selectedOperatorId,
      selectedRiverPointId: this._selectedRiverPointId,
      riverCurveMode: this._riverDraftOperator(this._selectedOperatorId)?.curveMode ?? null,
      riverControlPointCount: this._riverDraftOperator(this._selectedOperatorId)?.controlPoints?.length ?? 0,
      totalRiverControlPointCount: binding.riverFieldMetrics.controlPointCount,
      riverFieldCount: binding.riverFieldMetrics.fieldCount,
      riverFieldSegmentCount: binding.riverFieldMetrics.segmentCount,
      riverFieldCellCount: binding.riverFieldMetrics.cellCount,
      riverFieldMaximumCellSegmentCount: binding.riverFieldMetrics.maximumCellSegmentCount,
      riverFieldBytes: binding.riverFieldMetrics.totalBytes,
      riverFieldUploadCount: binding.riverFieldUploadCount,
      riverNetworkCount: riverNetworks.length,
      riverReachCount: riverNetworks.reduce((sum, network) => sum + network.reachOperatorIds.length, 0),
      riverJunctionCount: riverNetworks.reduce((sum, network) => sum + network.junctionCount, 0),
      targetMode: this.controls.targetMode,
      target: this._target,
      heightDeltaRange: this._heightDeltaRange,
      maximumSlope: this._maximumSlope,
      pickMilliseconds: this._pickSamples.percentiles(),
      frameMilliseconds: this._frameSamples.percentiles(),
      stressOperatorCount: this.controls.stressOperatorCount,
      canUndo: this._undo.length > 0,
      canRedo: this._redo.length > 0,
      status: this._status,
      destroyed: this._destroyed
    });
  }

  /** Removes input handlers and projected authoring graphics. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._cameraTransformChanged.destroy();
    this._cancelAuthoringPointerInteraction();
    this._canvas.removeEventListener("pointermove", this._onPointerMove);
    this._canvas.removeEventListener("pointerdown", this._onPointerDown, { capture: true });
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("blur", this._onWindowBlur);
    this._overlay.removeEventListener("pointerdown", this._onOverlayPointerDown);
    window.removeEventListener("pointermove", this._onOverlayPointerMove);
    window.removeEventListener("pointerup", this._onOverlayPointerUp);
    window.removeEventListener("pointercancel", this._onOverlayPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    this._overlay.replaceChildren();
  }

  private _suspendOrbitForAuthoringInteraction(): void {
    if (this._orbitEnabledBeforeAuthoringInteraction === null) {
      this._orbitEnabledBeforeAuthoringInteraction = this._orbit.enabled;
    }
    this._orbit.enabled = false;
  }

  private _restoreOrbitAfterAuthoringInteraction(): void {
    const enabled = this._orbitEnabledBeforeAuthoringInteraction;
    if (enabled === null) return;
    this._orbitEnabledBeforeAuthoringInteraction = null;
    this._orbit.enabled = enabled;
  }

  private _cancelAuthoringPointerInteraction(): void {
    this._orbitSuspendedByCanvasAuthoring = false;
    this._riverDrag = null;
    this._riverDragChanged = false;
    this._restoreOrbitAfterAuthoringInteraction();
  }

  private _riverDraftOperator(operatorId: number): PromptNoiseRiverOperatorV1 | null {
    if (this._draft?.kind === "river" && this._draft.id === operatorId && this._draft.controlPoints) {
      return this._draft;
    }
    const operator = this._program.recipe.operators.find(
      (entry): entry is PromptNoiseRiverOperatorV1 => entry.id === operatorId && entry.kind === "river"
    );
    return operator?.controlPoints ? operator : null;
  }

  private _setRiverDraft(operator: PromptNoiseRiverOperatorV1, status: string): void {
    this._draft = operator;
    this._displayProgram = this._program.withOperator(operator);
    this._previewProgram = this._displayProgram;
    this._status = status;
    this._dirty = false;
    this._bindPreview();
    this._renderOverlay();
    this._notify();
  }

  private _pickAtClient(clientX: number, clientY: number): { x: number; y: number; z: number } | null {
    const bounds = this._canvas.getBoundingClientRect();
    this._screenPoint.set(
      ((clientX - bounds.left) / bounds.width) * this._canvas.width,
      ((clientY - bounds.top) / bounds.height) * this._canvas.height
    );
    this._camera.screenPointToRay(this._screenPoint, this._pickRay);
    const origin = this._getLogicalOrigin();
    return intersectPromptNoiseTerrain(this._program, {
      origin: [this._pickRay.origin.x + origin[0], this._pickRay.origin.y, this._pickRay.origin.z + origin[1]],
      direction: [this._pickRay.direction.x, this._pickRay.direction.y, this._pickRay.direction.z]
    });
  }

  private _rebuildPreview(): void {
    this._dirty = false;
    const editing =
      this._editingOperatorId > 0
        ? (this._program.recipe.operators.find((entry) => entry.id === this._editingOperatorId) ?? null)
        : null;
    const hit = editing
      ? { x: editing.anchor.x, y: this._program.sampleHeight(editing.anchor.x, editing.anchor.z), z: editing.anchor.z }
      : this._pickTarget();
    if (!hit) {
      this._draft = null;
      this._target = null;
      this._previewProgram = this._program;
      this._displayProgram = this._program;
      this._bindPreview();
      this._notify();
      return;
    }
    this._target = Object.freeze([hit.x, hit.y, hit.z] as const);
    const forward = editing?.forward ?? this._cameraForward();
    const source = editing ? this._program.withoutOperator(editing.id) : this._program;
    const compiled = source.compilePlacement({
      tool: this.controls.tool,
      templateId: this.controls.templateId,
      anchor: { x: hit.x, z: hit.z },
      forward,
      parameters: copyParameters(this.controls)
    });
    this._draft = editing ? replaceOperatorId(compiled, editing.id) : compiled;
    const realPreview = this._program.withOperator(this._draft);
    this._displayProgram = realPreview;
    this._previewProgram = this._stressPreview(realPreview, this._draft);
    this._measureSelection(source, realPreview, this._draft);
    this._selectedOperatorId = this._draft.id;
    this._bindPreview();
    this._notify();
  }

  private _restoreCommittedDisplay(): void {
    this._dirty = false;
    this._draft = null;
    this._target = null;
    this._previewProgram = this._program;
    this._displayProgram = this._program;
    this._heightDeltaRange = Object.freeze([0, 0]);
    this._maximumSlope = 0;
    this._overlay.replaceChildren();
    this._bindPreview();
  }

  private _pickTarget(): { x: number; y: number; z: number } | null {
    const bounds = this._canvas.getBoundingClientRect();
    if (this.controls.targetMode === "mouse" && !this._hasMouse) return null;
    const clientX = this.controls.targetMode === "mouse" ? this._mouseClientX : bounds.left + bounds.width * 0.5;
    const clientY = this.controls.targetMode === "mouse" ? this._mouseClientY : bounds.top + bounds.height * 0.5;
    this._screenPoint.set(
      ((clientX - bounds.left) / bounds.width) * this._canvas.width,
      ((clientY - bounds.top) / bounds.height) * this._canvas.height
    );
    this._camera.screenPointToRay(this._screenPoint, this._pickRay);
    const origin = this._getLogicalOrigin();
    const started = performance.now();
    const hit = intersectPromptNoiseTerrain(this._program, {
      origin: [this._pickRay.origin.x + origin[0], this._pickRay.origin.y, this._pickRay.origin.z + origin[1]],
      direction: [this._pickRay.direction.x, this._pickRay.direction.y, this._pickRay.direction.z]
    });
    this._pickSamples.add(performance.now() - started);
    return hit;
  }

  private _cameraForward(): PromptNoiseWorldPointV1 {
    const forward = this._camera.entity.transform.worldForward;
    const length = Math.hypot(forward.x, forward.z);
    return length > 1e-5 ? { x: forward.x / length, z: forward.z / length } : { x: 0, z: -1 };
  }

  private _stressPreview(
    realPreview: PromptNoiseTerrainProgram,
    draft: PromptNoiseTerrainOperatorV1
  ): PromptNoiseTerrainProgram {
    const count = this.controls.stressOperatorCount;
    if (count <= 1) return realPreview;
    const bounds = operatorBounds(draft);
    const spacing = Math.max(160, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 1.12);
    const columns = Math.ceil(Math.sqrt(count));
    let preview = realPreview;
    for (let index = 1; index < count; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const offsetX = (column - (columns - 1) * 0.5) * spacing;
      const offsetZ = (row - (Math.ceil(count / columns) - 1) * 0.5) * spacing;
      preview = preview.withOperator({
        ...draft,
        id: preview.recipe.nextOperatorId,
        anchor: { x: draft.anchor.x + offsetX, z: draft.anchor.z + offsetZ }
      });
    }
    return preview;
  }

  private _measureSelection(
    source: PromptNoiseTerrainProgram,
    preview: PromptNoiseTerrainProgram,
    operator: PromptNoiseTerrainOperatorV1
  ): void {
    const bounds = operatorBounds(operator);
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let maximumSlope = 0;
    const stepX = Math.max(1, (bounds.maxX - bounds.minX) / 12);
    const stepZ = Math.max(1, (bounds.maxZ - bounds.minZ) / 12);
    for (let zIndex = 0; zIndex <= 12; zIndex++) {
      for (let xIndex = 0; xIndex <= 12; xIndex++) {
        const x = bounds.minX + stepX * xIndex;
        const z = bounds.minZ + stepZ * zIndex;
        const height = preview.sampleHeight(x, z);
        const difference = height - source.sampleHeight(x, z);
        minimum = Math.min(minimum, difference);
        maximum = Math.max(maximum, difference);
        const slopeX = (preview.sampleHeight(x + 1, z) - preview.sampleHeight(x - 1, z)) * 0.5;
        const slopeZ = (preview.sampleHeight(x, z + 1) - preview.sampleHeight(x, z - 1)) * 0.5;
        maximumSlope = Math.max(maximumSlope, Math.hypot(slopeX, slopeZ));
      }
    }
    this._heightDeltaRange = Object.freeze([minimum, maximum] as const);
    this._maximumSlope = maximumSlope;
  }

  private _bindPreview(): void {
    const origin = this._getLogicalOrigin();
    const camera = this._camera.entity.transform.position;
    const logicalX = origin[0] + camera.x;
    const logicalZ = origin[1] + camera.z;
    this._binding.setTerrainProgram(this._previewProgram, {
      minX: logicalX - ACTIVE_CLIPMAP_RADIUS,
      minZ: logicalZ - ACTIVE_CLIPMAP_RADIUS,
      maxX: logicalX + ACTIVE_CLIPMAP_RADIUS,
      maxZ: logicalZ + ACTIVE_CLIPMAP_RADIUS
    });
    this._binding.setSelectedOperatorId(this._selectedOperatorId);
  }

  private _renderOverlay(): void {
    if (!this.controls.editingEnabled) {
      this._overlay.replaceChildren();
      return;
    }
    const origin = this._getLogicalOrigin();
    const bounds = this._canvas.getBoundingClientRect();
    this._overlay.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const paths: string[] = [];
    for (const operator of this._displayProgram.recipe.operators) {
      if (!operator.enabled || operator.id !== this._selectedOperatorId) continue;
      const selected = operator.id === this._selectedOperatorId;
      if (operator.kind === "river") {
        paths.push(...this._riverPaths(operator, origin, bounds, selected));
      } else {
        const innerRadius =
          operator.kind === "flatten"
            ? Math.max(1, operator.radius - operator.falloff)
            : Math.max(1, operator.sampleRadius);
        const className = operator.kind === "flatten" ? "flatten" : "smooth";
        const outer = this._ringPath(operator.anchor, operator.radius, origin, bounds);
        const inner = this._ringPath(operator.anchor, innerRadius, origin, bounds);
        if (outer) paths.push(svgPath(outer, className, selected, false));
        if (inner) paths.push(svgPath(inner, className, selected, true));
      }
    }
    this._overlay.innerHTML = paths.join("");
  }

  private _riverPaths(
    operator: Extract<PromptNoiseTerrainOperatorV1, { kind: "river" }>,
    origin: readonly [number, number],
    bounds: DOMRect,
    selected: boolean
  ): string[] {
    if (operator.controlPoints) return this._riverFieldPaths(operator, origin, bounds, selected);
    const halfLength = operator.length * 0.5;
    const right = { x: -operator.forward.z, z: operator.forward.x };
    const start = {
      x: operator.anchor.x - operator.forward.x * halfLength,
      z: operator.anchor.z - operator.forward.z * halfLength
    };
    const control = { x: operator.anchor.x + right.x * operator.bend, z: operator.anchor.z + right.z * operator.bend };
    const end = {
      x: operator.anchor.x + operator.forward.x * halfLength,
      z: operator.anchor.z + operator.forward.z * halfLength
    };
    const results: string[] = [];
    for (let offsetIndex = 0; offsetIndex < 5; offsetIndex++) {
      const points: string[] = [];
      for (let index = 0; index <= 40; index++) {
        const t = index / 40;
        const oneMinusT = 1 - t;
        const x = oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x;
        const z = oneMinusT * oneMinusT * start.z + 2 * oneMinusT * t * control.z + t * t * end.z;
        const tangentX = 2 * oneMinusT * (control.x - start.x) + 2 * t * (end.x - control.x);
        const tangentZ = 2 * oneMinusT * (control.z - start.z) + 2 * t * (end.z - control.z);
        const tangentLength = Math.max(1e-5, Math.hypot(tangentX, tangentZ));
        const halfWidth = samplePromptNoiseRiverProfile(operator, t).width * 0.5;
        const offset = [0, halfWidth, -halfWidth, halfWidth + operator.bankWidth, -(halfWidth + operator.bankWidth)][
          offsetIndex
        ];
        const point = this._project(
          x - (tangentZ / tangentLength) * offset,
          z + (tangentX / tangentLength) * offset,
          origin,
          bounds
        );
        if (point) points.push(`${points.length === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
      }
      if (points.length > 1) results.push(svgPath(points.join(" "), "river", selected, offsetIndex !== 0));
    }
    return results;
  }

  private _riverFieldPaths(
    operator: PromptNoiseRiverOperatorV1,
    origin: readonly [number, number],
    bounds: DOMRect,
    selected: boolean
  ): string[] {
    const field = PromptNoiseRiverFieldCompiler.compile(operator);
    const results: string[] = [];
    const samples = field.segments.map((segment) => ({
      x: segment.start.x,
      z: segment.start.z,
      tangentX: segment.end.x - segment.start.x,
      tangentZ: segment.end.z - segment.start.z,
      width: segment.startWidth
    }));
    const last = field.segments[field.segments.length - 1];
    samples.push({
      x: last.end.x,
      z: last.end.z,
      tangentX: last.end.x - last.start.x,
      tangentZ: last.end.z - last.start.z,
      width: last.endWidth
    });
    for (const offsetKind of [0, 1, -1, 2, -2] as const) {
      const points: string[] = [];
      for (const sample of samples) {
        const tangentLength = Math.max(1e-5, Math.hypot(sample.tangentX, sample.tangentZ));
        const halfWidth = sample.width * 0.5;
        const offset =
          offsetKind === 0
            ? 0
            : Math.sign(offsetKind) * (halfWidth + (Math.abs(offsetKind) === 2 ? operator.bankWidth : 0));
        const point = this._project(
          sample.x - (sample.tangentZ / tangentLength) * offset,
          sample.z + (sample.tangentX / tangentLength) * offset,
          origin,
          bounds
        );
        if (point) points.push(`${points.length === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
      }
      if (points.length > 1) results.push(svgPath(points.join(" "), "river", selected, offsetKind !== 0));
    }
    operator.controlPoints!.forEach((point, index, points) => {
      const center = this._project(point.position.x, point.position.z, origin, bounds);
      if (!center) return;
      const previous = points[Math.max(0, index - 1)].position;
      const next = points[Math.min(points.length - 1, index + 1)].position;
      const tangentX = next.x - previous.x;
      const tangentZ = next.z - previous.z;
      const tangentLength = Math.max(1e-5, Math.hypot(tangentX, tangentZ));
      const widthX = point.position.x - (tangentZ / tangentLength) * point.width * 0.5;
      const widthZ = point.position.z + (tangentX / tangentLength) * point.width * 0.5;
      const width = this._project(widthX, widthZ, origin, bounds);
      const selectedPoint = point.id === this._selectedRiverPointId;
      results.push(svgRiverHandle(center, operator.id, point.id, "position", selectedPoint, `Point ${point.id}`));
      if (width) {
        results.push(svgHandleLink(center, width));
        results.push(
          svgRiverHandle(width, operator.id, point.id, "width", selectedPoint, `Width ${point.width.toFixed(2)}m`)
        );
      }
    });
    return results;
  }

  private _ringPath(
    center: PromptNoiseWorldPointV1,
    radius: number,
    origin: readonly [number, number],
    bounds: DOMRect
  ): string | null {
    const points: string[] = [];
    for (let index = 0; index < 64; index++) {
      const angle = (index / 64) * Math.PI * 2;
      const point = this._project(
        center.x + Math.cos(angle) * radius,
        center.z + Math.sin(angle) * radius,
        origin,
        bounds
      );
      if (point) points.push(`${points.length === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
    }
    return points.length > 2 ? `${points.join(" ")} Z` : null;
  }

  private _project(
    logicalX: number,
    logicalZ: number,
    origin: readonly [number, number],
    bounds: DOMRect
  ): { x: number; y: number } | null {
    const height = this._displayProgram.sampleHeight(logicalX, logicalZ) + 0.8;
    this._projectPoint.set(logicalX - origin[0], height, logicalZ - origin[1]);
    const screen = this._camera.worldToScreenPoint(this._projectPoint, this._projectedPoint);
    if (screen.z <= 0) return null;
    return {
      x: (screen.x / this._canvas.width) * bounds.width,
      y: (screen.y / this._canvas.height) * bounds.height
    };
  }

  private _pushHistory(): void {
    this._undo.push(this._program.recipe);
    this._redo.length = 0;
  }

  private async _registerCommitted(status: string): Promise<void> {
    const registering = this._program;
    const entry = await this._registry.register(registering);
    if (this._program !== registering) return;
    await this._publishRegisteredCandidate(entry, status);
  }

  private async _publishRegisteredCandidate(entry: PromptNoiseWorldRegistryEntryV1, status: string): Promise<void> {
    const candidate = this._program;
    try {
      await this._onCommittedProgramChange?.(candidate);
      if (this._program !== candidate) return;
      this._entry = entry;
      this.controls.worldIdInput = entry.worldId;
      this._status = `${status} · ${entry.worldId}`;
      this._publishedProgram = candidate;
      this._publishedEntry = entry;
      this._publishedUndo = [...this._undo];
      this._publishedRedo = [...this._redo];
      this._notify();
    } catch (error) {
      if (this._program === candidate) this._restorePublishedAfterFailure(error);
      throw error;
    }
  }

  private _restorePublishedAfterFailure(error: unknown): void {
    this._program = this._publishedProgram;
    this._previewProgram = this._publishedProgram;
    this._displayProgram = this._publishedProgram;
    this._entry = this._publishedEntry;
    this._undo.splice(0, this._undo.length, ...this._publishedUndo);
    this._redo.splice(0, this._redo.length, ...this._publishedRedo);
    this.controls.worldIdInput = this._publishedEntry?.worldId ?? 0;
    this._binding.setTerrainProgram(this._publishedProgram);
    this._draft = null;
    this._editingOperatorId = 0;
    this._status = `世界提交失败，已保留旧版本 · ${error instanceof Error ? error.message : String(error)}`;
    this._dirty = true;
    this._notify();
  }

  private _notify(): void {
    this._onChange?.(this.snapshot());
  }
}

function createControls(
  tool: PromptNoiseTerrainOperatorKind,
  templateId: PromptNoiseOperatorTemplateId
): PromptNoiseAuthoringControlsV1 {
  return {
    editingEnabled: false,
    tool,
    templateId,
    targetMode: "camera",
    stressOperatorCount: 0,
    worldIdInput: 0,
    ...promptNoiseTemplateParameters(templateId)
  };
}

function copyParameters(value: PromptNoisePlacementParametersV1): PromptNoisePlacementParametersV1 {
  return {
    length: value.length,
    bend: value.bend,
    halfWidth: value.halfWidth,
    bankWidth: value.bankWidth,
    cutDepth: value.cutDepth,
    minimumDrop: value.minimumDrop,
    bankHeight: value.bankHeight,
    sourceWidth: value.sourceWidth,
    sourceDepth: value.sourceDepth,
    sourceFlowSpeed: value.sourceFlowSpeed,
    sourceBankFeather: value.sourceBankFeather,
    middleWidth: value.middleWidth,
    middleDepth: value.middleDepth,
    middleFlowSpeed: value.middleFlowSpeed,
    middleBankFeather: value.middleBankFeather,
    mouthWidth: value.mouthWidth,
    mouthDepth: value.mouthDepth,
    mouthFlowSpeed: value.mouthFlowSpeed,
    mouthBankFeather: value.mouthBankFeather,
    radius: value.radius,
    falloff: value.falloff,
    heightOffset: value.heightOffset,
    sampleRadius: value.sampleRadius,
    strength: value.strength
  };
}

function parametersFromOperator(
  program: PromptNoiseTerrainProgram,
  operator: PromptNoiseTerrainOperatorV1
): PromptNoisePlacementParametersV1 {
  const defaults = promptNoiseTemplateParameters(operator.templateId);
  const source = program.withoutOperator(operator.id);
  if (operator.kind === "river") {
    const halfLength = operator.length * 0.5;
    const startX = operator.anchor.x - operator.forward.x * halfLength;
    const startZ = operator.anchor.z - operator.forward.z * halfLength;
    const endX = operator.anchor.x + operator.forward.x * halfLength;
    const endZ = operator.anchor.z + operator.forward.z * halfLength;
    const upstreamSurface = Math.max(source.sampleHeight(startX, startZ), source.sampleHeight(endX, endZ));
    const sourceProfile = samplePromptNoiseRiverProfile(operator, 0);
    const middleProfile = samplePromptNoiseRiverProfile(operator, 0.5);
    const mouthProfile = samplePromptNoiseRiverProfile(operator, 1);
    return {
      ...defaults,
      length: operator.length,
      bend: operator.bend,
      halfWidth: operator.halfWidth,
      bankWidth: operator.bankWidth,
      cutDepth: Math.max(0, upstreamSurface - operator.startHeight),
      minimumDrop: Math.max(0, operator.startHeight - operator.endHeight),
      bankHeight: operator.bankHeight,
      sourceWidth: sourceProfile.width,
      sourceDepth: sourceProfile.depth,
      sourceFlowSpeed: sourceProfile.flowSpeed,
      sourceBankFeather: sourceProfile.bankFeather,
      middleWidth: middleProfile.width,
      middleDepth: middleProfile.depth,
      middleFlowSpeed: middleProfile.flowSpeed,
      middleBankFeather: middleProfile.bankFeather,
      mouthWidth: mouthProfile.width,
      mouthDepth: mouthProfile.depth,
      mouthFlowSpeed: mouthProfile.flowSpeed,
      mouthBankFeather: mouthProfile.bankFeather,
      strength: operator.strength
    };
  }
  if (operator.kind === "flatten") {
    return {
      ...defaults,
      radius: operator.radius,
      falloff: operator.falloff,
      heightOffset: operator.targetHeight - source.sampleHeight(operator.anchor.x, operator.anchor.z),
      strength: operator.strength
    };
  }
  return {
    ...defaults,
    radius: operator.radius,
    falloff: operator.falloff,
    sampleRadius: operator.sampleRadius,
    strength: operator.strength
  };
}

function replaceOperatorId(operator: PromptNoiseTerrainOperatorV1, id: number): PromptNoiseTerrainOperatorV1 {
  return Object.freeze({ ...operator, id }) as PromptNoiseTerrainOperatorV1;
}

function svgPath(path: string, kind: PromptNoiseTerrainOperatorKind, selected: boolean, secondary: boolean): string {
  return `<path class="operator-path ${kind}${selected ? " selected" : ""}${secondary ? " secondary" : ""}" d="${path}"/>`;
}

function svgRiverHandle(
  point: Readonly<{ x: number; y: number }>,
  operatorId: number,
  pointId: number,
  kind: "position" | "width",
  selected: boolean,
  label: string
): string {
  return `<circle class="river-handle ${kind}${selected ? " selected" : ""}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${kind === "position" ? 6 : 5}" data-operator-id="${operatorId}" data-river-point-id="${pointId}" data-river-handle="${kind}" aria-label="${label}"/>`;
}

function svgHandleLink(start: Readonly<{ x: number; y: number }>, end: Readonly<{ x: number; y: number }>): string {
  return `<line class="river-handle-link" x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}"/>`;
}

function kindLabel(kind: PromptNoiseTerrainOperatorKind): string {
  return { river: "曲线河谷", flatten: "拍平", smooth: "Smooth" }[kind];
}

function updateCameraDraftVector(source: Readonly<Vector3>, target: Vector3): boolean {
  const x = Math.round(source.x * 1000);
  const y = Math.round(source.y * 1000);
  const z = Math.round(source.z * 1000);
  if (target.x === x && target.y === y && target.z === z) {
    return false;
  }
  target.set(x, y, z);
  return true;
}

class RollingTimingSamples {
  private _values: Float64Array;
  private _count = 0;
  private _next = 0;

  constructor(capacity: number) {
    this._values = new Float64Array(capacity);
  }

  add(value: number): void {
    this._values[this._next] = value;
    this._next = (this._next + 1) % this._values.length;
    if (this._count < this._values.length) {
      this._count++;
    }
  }

  reset(): void {
    this._count = 0;
    this._next = 0;
  }

  percentiles(): readonly [p50: number, p95: number] {
    if (this._count === 0) {
      return Object.freeze([0, 0] as const);
    }
    const sorted = this._values.slice(0, this._count).sort();
    return Object.freeze([
      sorted[Math.floor((this._count - 1) * 0.5)],
      sorted[Math.floor((this._count - 1) * 0.95)]
    ] as const);
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}
